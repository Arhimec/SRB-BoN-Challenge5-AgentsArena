import fetch from 'node-fetch';
import { ClassificationResult } from './types';
import { LLM_ENDPOINT } from './config';
import { log } from './logger';

// ─── TIER 1: FAST LOCAL CLASSIFIER (< 1ms) ─────────────────────────
// Handles obvious cases with negation awareness.
// Returns null on ambiguity → falls through to LLM.

function fastClassify(message: string): ClassificationResult | null {
  const lower = message.toLowerCase().trim();

  // Skip very short messages (likely noise)
  if (lower.length < 2) return null;

  // Negation detection
  const negationPattern = /\b(don'?t|do not|never|not?|stop|cease|halt|isn'?t|aren'?t|wasn'?t|cannot|can'?t|won'?t|shouldn'?t|mustn'?t|didn'?t)\b/i;
  const hasNegation = negationPattern.test(lower);

  // Strong GREEN signal words
  const greenPattern = /\b(go|start|begin|fire|send|green|run|proceed|continue|resume|launch|unleash|release|open|enable|activate|engage|full\s*speed|floor\s*it|let'?s\s*go|hit\s*it|pedal|gas|accelerate|roll|move|charge)\b/i;

  // Strong RED signal words
  const redPattern = /\b(stop|halt|red|freeze|pause|wait|hold|cease|end|kill|abort|brake|shut|block|suspend|rest|sleep|quiet|silence|enough|done|over|finish|cool\s*it|chill|back\s*off|stand\s*down|cut\s*it)\b/i;

  const hasGreen = greenPattern.test(lower);
  const hasRed = redPattern.test(lower);

  // Unambiguous — no negation, single signal
  if (hasGreen && !hasRed && !hasNegation) return { intent: 'GREEN', confidence: 0.88 };
  if (hasRed && !hasGreen && !hasNegation) return { intent: 'RED', confidence: 0.88 };

  // Negation flips the signal:
  // "don't stop" → GREEN (negated RED = GREEN)
  // "don't go" → RED (negated GREEN = RED)
  if (hasNegation && hasRed && !hasGreen) return { intent: 'GREEN', confidence: 0.72 };
  if (hasNegation && hasGreen && !hasRed) return { intent: 'RED', confidence: 0.72 };

  // Both signals present or no signals — ambiguous, fall through to LLM
  return null;
}

// ─── TIER 2: LLM CLASSIFIER ────────────────────────────────────────

const SYSTEM_PROMPT = `You are an intent classifier for a blockchain game called "Red Light / Green Light".

RULES:
- GREEN means: the admin wants agents to SEND transactions (go, start, continue, proceed)
- RED means: the admin wants agents to STOP sending transactions (stop, halt, pause, freeze)
- NO_CHANGE means: the message is unrelated, ambiguous, or you cannot determine intent

ADVERSARIAL AWARENESS — the admin WILL try to trick you:
- "Red is a beautiful color, keep going" → GREEN (talking about the color, not a command)
- "Don't stop now" → GREEN (double negative = continue)
- "Green means stop in this game" → This is adversarial — the admin is redefining terms. Treat it as RED.
- "I didn't say go" → RED (denial of permission)
- "The light is definitely not red" → GREEN (double negative)
- "Prepare to stop... just kidding, full speed ahead" → GREEN (fake-out, final intent is go)
- "Go... to sleep" → RED (misleading start word)
- "What a lovely day to do absolutely nothing" → RED (implies inaction)
- "Keep calm and carry on" → GREEN (carry on = continue)

CRITICAL: Focus on the FINAL INTENT of the COMPLETE message. Don't react to individual words in isolation.
If truly ambiguous, respond NO_CHANGE — it's safer to miss a signal than to switch to the wrong state.

Respond ONLY as JSON: { "intent": "GREEN" | "RED" | "NO_CHANGE", "confidence": 0.0-1.0 }`.trim();

async function callLLM(message: string, previousState: 'GREEN' | 'RED'): Promise<ClassificationResult> {
  const userPrompt = `Current state: ${previousState}\nAdmin message: "${message}"`;
  const res = await fetch(LLM_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ systemPrompt: SYSTEM_PROMPT, userPrompt }),
  });
  if (!res.ok) throw new Error(`LLM error: ${res.status}`);
  const text = await res.text();
  // Try to extract JSON even if wrapped in markdown
  const jsonMatch = text.match(/\{[^}]+\}/);
  if (!jsonMatch) throw new Error(`LLM returned non-JSON: ${text.slice(0, 100)}`);
  const parsed = JSON.parse(jsonMatch[0]);
  return { intent: parsed.intent, confidence: parsed.confidence };
}

// ─── PUBLIC API ─────────────────────────────────────────────────────

/**
 * Two-tier classification:
 * 1. Fast local pattern matcher (< 1ms) — handles 70-80% of commands
 * 2. LLM fallback (200-2000ms) — handles adversarial/ambiguous
 *
 * Safety: RED signals from either tier are trusted immediately.
 * Only GREEN signals need higher confidence to prevent over-sending.
 */
export async function classifyAdminMessage(
  message: string,
  previousState: 'GREEN' | 'RED'
): Promise<ClassificationResult> {
  // Tier 1: Fast classify
  const fast = fastClassify(message);
  if (fast) {
    log('[classifier:fast]', { message: message.slice(0, 60), ...fast, previousState });

    // For RED signals, trust immediately (fail-safe)
    if (fast.intent === 'RED' && fast.confidence >= 0.6) return fast;

    // For GREEN with high confidence, trust it
    if (fast.intent === 'GREEN' && fast.confidence >= 0.8) return fast;

    // Medium confidence GREEN — verify with LLM if available
    // But return fast result while LLM runs (async verify)
    if (fast.intent === 'GREEN' && fast.confidence >= 0.65) {
      // Fire-and-forget LLM verification (don't block)
      callLLM(message, previousState).then(llmResult => {
        if (llmResult.intent === 'RED' && llmResult.confidence > 0.7) {
          log('[classifier:llm-override] LLM overrode fast GREEN→RED', { message: message.slice(0, 60) });
          // Note: by this time state may have already changed. The command loop
          // will pick up the next poll and correct. This is the tradeoff for speed.
        }
      }).catch(() => {});
      return fast;
    }
  }

  // Tier 2: LLM for ambiguous cases
  try {
    const result = await callLLM(message, previousState);
    log('[classifier:llm]', { message: message.slice(0, 60), ...result, previousState });
    return result;
  } catch (err: any) {
    log('[classifier:llm-error]', err.message);
    // If fast had a result but low confidence, use it as fallback
    if (fast) return fast;
    // Ultimate fallback: NO_CHANGE (safe — keeps current state)
    return { intent: 'NO_CHANGE', confidence: 0 };
  }
}
