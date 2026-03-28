import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { ClassificationResult } from './types';
import { LLM_ENDPOINT } from './config';
import { log } from './logger';

const CACHE_PATH = path.join(__dirname, '../data/metaphor_cache.json');

// ─── TIER 1: DYNAMIC METAPHOR CACHE (< 5ms) ─────────────────────────

function getCache(): Record<string, 'GREEN' | 'RED'> {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    }
  } catch (err) {
    log('[classifier:cache-error] failed to read cache');
  }
  return {};
}

function saveToCache(message: string, intent: 'GREEN' | 'RED') {
  try {
    const cache = getCache();
    cache[message.toLowerCase()] = intent;
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
    log(`[classifier:cache-save] cached: "${message.slice(0, 30)}..." as ${intent}`);
  } catch (err) {
    log('[classifier:cache-error] failed to save cache');
  }
}

function metaphorClassify(message: string): ClassificationResult | null {
  const lower = message.toLowerCase().trim();
  const cache = getCache();
  
  if (cache[lower]) {
    return { intent: cache[lower], confidence: 1.0 };
  }

  // Fallback to substring matching for slight variations
  for (const [key, intent] of Object.entries(cache)) {
    if (lower.includes(key) || key.includes(lower)) {
      return { intent, confidence: 0.9 };
    }
  }
  
  return null;
}

function fastClassify(message: string): ClassificationResult | null {
  const meta = metaphorClassify(message);
  if (meta) return meta;

  const lower = message.toLowerCase().trim();

  // Negation detection
  const negationPattern = /\b(don'?t|do not|never|not?|stop|cease|halt|isn'?t|aren'?t|wasn'?t|cannot|can'?t|won'?t|shouldn'?t|mustn'?t|didn'?t)\b/i;
  const hasNegation = negationPattern.test(lower);

  // Strong signals
  const greenPattern = /\b(go|start|begin|fire|send|green|run|proceed|continue|resume|launch|unleash|release|open|enable|activate|engage|hit\s*it|let'?s\s*go)\b/i;
  const redPattern = /\b(stop|halt|red|freeze|pause|wait|hold|cease|end|kill|abort|break|shut|block|suspend|rest|sleep|quiet|silence|enough|done|over|finish|chill|back\s*off|stand\s*down|cut\s*it)\b/i;

  const hasGreen = greenPattern.test(lower);
  const hasRed = redPattern.test(lower);

  if (hasRed && !hasGreen && !hasNegation) return { intent: 'RED', confidence: 0.95 };
  if (hasGreen && !hasRed && !hasNegation) return { intent: 'GREEN', confidence: 0.95 };
  if (hasNegation && hasRed && !hasGreen) return { intent: 'GREEN', confidence: 0.85 };
  if (hasNegation && hasGreen && !hasRed) return { intent: 'RED', confidence: 0.85 };

  return null;
}

// ─── TIER 2: LLM CLASSIFIER (Adversarial Reasoning) ────────────────

async function callLLM(message: string): Promise<ClassificationResult> {
  const res = await fetch(LLM_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message })
  });
  
  if (!res.ok) throw new Error(`LLM server error: ${res.status}`);
  const parsed = await res.json();
  
  if (parsed.reasoning) {
    log(`[classifier:reasoning] ${parsed.reasoning}`);
  }

  const intent = parsed.intent as any;
  if (intent === 'GREEN' || intent === 'RED') {
    saveToCache(message, intent);
  }
  
  return { 
    intent, 
    confidence: parsed.confidence || 0 
  };
}

// ─── PUBLIC API ─────────────────────────────────────────────────────

export async function classifyAdminMessage(
  message: string,
  _previousState: 'GREEN' | 'RED'
): Promise<ClassificationResult> {
  const fast = fastClassify(message);
  if (fast) {
    log('[classifier:fast]', { message: message.slice(0, 40), ...fast });
    return fast;
  }

  try {
    const result = await callLLM(message);
    log('[classifier:llm]', { message: message.slice(0, 40), ...result });
    return result;
  } catch (err: any) {
    log('[classifier:llm-error]', err.message);
    return { intent: 'NO_CHANGE', confidence: 0 };
  }
}
