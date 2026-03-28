import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());
const PORT = Number(process.env.LLM_PORT || 8080);
const geminiKey = process.env.GEMINI_API_KEY || '';

const SYS = `You are a sentiment and intent analyzer for the Battle of Nodes Challenge.
Analyze the message for "Positive/Action" vs "Negative/Stop" sentiment.
- "Positive" includes flow, movement, start, open, hunt, begin. (Result: GREEN)
- "Negative" includes stop, cut, break, trip, halt, silence. (Result: RED)
- If unsure, return OTHER.

Return JSON ONLY: {"reasoning": "...", "intent": "GREEN"|"RED"|"OTHER", "confidence": 0.9}`;

/**
 * OMNI-FLASH FALLBACK ENGINE
 * Order: 2.0 Flash (Expt) -> 1.5 Flash (Std) -> 1.5 Flash-8B -> 1.5 Pro
 */
async function callGemini(userMessage: string): Promise<any> {
    const models = [
        { name: 'gemini-2.0-flash-exp', version: 'v1beta' },
        { name: 'gemini-1.5-flash', version: 'v1' },
        { name: 'gemini-1.5-flash-8b', version: 'v1beta' },
        { name: 'gemini-1.5-pro', version: 'v1' }
    ];

    let lastError = '';

    for (const modelCfg of models) {
        const url = `https://generativelanguage.googleapis.com/${modelCfg.version}/models/${modelCfg.name}:generateContent?key=${geminiKey}`;
        
        const payload = {
            contents: [{
                role: 'user',
                parts: [{ text: `${SYS}\n\nAnalyze this message: "${userMessage}"` }]
            }],
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 200
            }
        };

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const data: any = await res.json();
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
                const match = text.match(/\{[\s\S]*\}/);
                if (match) return JSON.parse(match[0]);
            } else {
                const errBody = await res.text();
                lastError = `[${modelCfg.name}] ${res.status}: ${errBody}`;
                console.warn(`[REASONING WARNING] Model ${modelCfg.name} failed. Trying next...`);
            }
        } catch (e: any) {
            lastError = `[${modelCfg.name}] Connection Error: ${e.message}`;
            console.warn(`[REASONING WARNING] Model ${modelCfg.name} unreachable. Trying next...`);
        }
    }

    throw new Error(`Omni-Flash Exhausted. Last Error: ${lastError}`);
}

app.post('/classify-intent', async (req, res) => {
    try {
        const msg = req.body.text || req.body.message || '';
        const result = await callGemini(msg);
        console.log(`[REASONING] "${msg.slice(0, 40)}..." -> ${result.intent}`);
        res.json(result);
    } catch (err) {
        console.error(`[OMNI-FLASH ERROR] ${(err as any).message}`);
        res.status(500).json({ error: 'LLM failed', details: (err as any).message });
    }
});

app.listen(PORT, () => {
    console.log(`\n🧠 B-Chain OMNI-FLASH Reasoning Server Live on port ${PORT}`);
});
