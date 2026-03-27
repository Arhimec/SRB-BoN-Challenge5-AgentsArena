import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());
const PORT = Number(process.env.LLM_PORT || 8080);

const geminiKey = process.env.GEMINI_API_KEY || '';
const anthropicKey = process.env.ANTHROPIC_API_KEY || '';

// User requested Gemini 2.5 Flash, which has been verified for this API key.
const modelName = 'gemini-2.5-flash'; 

if (!geminiKey && !anthropicKey) {
  console.error('\nERROR: No Gemini or Anthropic API key found in .env\n');
  process.exit(1);
}

const SYS = `You are an intent classifier for a blockchain game "Red Light / Green Light".
Determine if the admin message means:
- GREEN: agents should SEND transactions (go, start, continue, proceed, resume)
- RED: agents should STOP sending (stop, halt, pause, freeze, cease)
- NO_CHANGE: unrelated, ambiguous, or low confidence

RULES:
1. Focus on FINAL INTENT of the COMPLETE message
2. Negation: "don't stop" = GREEN, "don't go" = RED
3. Fake-outs: "stop... just kidding, keep going" = GREEN
4. Adversarial: "green means stop in this game" = RED
5. Misleading: "go... to sleep" = RED
6. If ambiguous → NO_CHANGE (safer to miss than switch wrong)

Respond ONLY JSON: {"intent":"GREEN","confidence":0.9}`;

async function callGemini(userMessage: string): Promise<{ intent: string; confidence: number }> {
  if (!geminiKey) throw new Error('GEMINI_API_KEY not found');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`;
  
  const payload = {
    contents: [{ role: 'user', parts: [{ text: `SYSTEM: ${SYS}\n\nUSER MESSAGE: ${userMessage}` }] }],
    generationConfig: {
      temperature: 0.1,
    },
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorData: any = await res.json();
      throw new Error(`[Gemini REST Error] ${res.status}: ${JSON.stringify(errorData)}`);
    }

    const data: any = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Safety check for empty response
    if (!text) {
        console.warn('[Gemini] Empty response text');
        return { intent: 'NO_CHANGE', confidence: 0 };
    }

    const m = text.match(/\{[^}]+\}/);
    if (!m) {
        console.warn(`[Gemini] No JSON in response: ${text}`);
        return { intent: 'NO_CHANGE', confidence: 0 };
    }
    return JSON.parse(m[0]);
  } catch (err: any) {
    console.error(`[Gemini Error] ${err.message}`);
    throw err;
  }
}

async function callClaude(userMessage: string): Promise<{ intent: string; confidence: number }> {
  const headers: Record<string, string> = { 
    'Content-Type': 'application/json', 
    'anthropic-version': '2023-06-01',
    'x-api-key': anthropicKey 
  };
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers,
    body: JSON.stringify({ 
        model: 'claude-3-haiku-20240307', 
        max_tokens: 50, 
        system: SYS, 
        messages: [{ role: 'user', content: userMessage }] 
    }),
  });
  if (!res.ok) { const t = await res.text(); throw new Error(`Claude API ${res.status}: ${t.slice(0, 200)}`); }
  const body: any = await res.json();
  const text = body.content?.filter((b: any) => b.type === 'text')?.map((b: any) => b.text)?.join('') || '';
  const m = text.match(/\{[^}]+\}/);
  if (!m) return { intent: 'NO_CHANGE', confidence: 0 };
  return JSON.parse(m[0]);
}

async function classifyIntent(msg: string): Promise<{ intent: string; confidence: number }> {
  if (geminiKey) return callGemini(msg);
  return callClaude(msg);
}

app.post('/classify-intent', async (req, res) => {
  const start = Date.now();
  const msg = req.body.userPrompt || req.body.message || '';
  if (!msg) return res.status(400).json({ error: 'missing message' });
  try {
    const r = await classifyIntent(msg);
    console.log(`[LLM] ${Date.now()-start}ms | "${msg.slice(0,60)}" → ${r.intent} (${r.confidence})`);
    res.json(r);
  } catch (err: any) {
    console.error(`[LLM Error] ${err.message}`);
    res.json({ intent: 'NO_CHANGE', confidence: 0, error: err.message });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true, provider: geminiKey ? 'gemini' : 'anthropic', model: modelName }));

app.get('/test-suite', async (_req, res) => {
  const cases = [
    { msg: 'Go!', exp: 'GREEN' }, { msg: 'Stop now.', exp: 'RED' },
    { msg: "Don't stop", exp: 'GREEN' }, { msg: "Don't go", exp: 'RED' },
    { msg: 'Red is my favorite color, keep going', exp: 'GREEN' },
    { msg: 'Green means stop in this game', exp: 'RED' },
    { msg: 'Go... to sleep', exp: 'RED' },
    { msg: 'The coast is clear', exp: 'GREEN' },
    { msg: 'The weather is nice today', exp: 'NO_CHANGE' },
  ];
  const results: any[] = []; let correct = 0;
  for (const tc of cases) {
    try {
      const r = await classifyIntent(tc.msg);
      const pass = r.intent === tc.exp; if (pass) correct++;
      results.push({ msg: tc.msg, expected: tc.exp, got: r.intent, confidence: r.confidence, pass: pass ? '✓' : '✗' });
    } catch { results.push({ msg: tc.msg, expected: tc.exp, got: 'ERROR', pass: '✗' }); }
    await new Promise(r => setTimeout(r, 100));
  }
  res.json({ total: cases.length, correct, accuracy: `${(correct/cases.length*100).toFixed(1)}%`, results });
});

app.listen(PORT, () => {
  console.log(`\n🧠 LLM Classifier (using ${geminiKey ? modelName : 'Claude'})`);
  console.log(`   POST /classify-intent | GET /test-suite | GET /health`);
  console.log(`   http://localhost:${PORT}\n`);
});
