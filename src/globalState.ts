import { LightState } from './types';
import { SIMULATION_MODE } from './config';


// ─── ROUND BOUNDARIES (M2 FIX) ──────────────────────────────────────
const ROUND1_START = new Date('2026-03-27T16:00:00Z').getTime();
const ROUND1_END   = new Date('2026-03-27T16:30:00Z').getTime();
const ROUND2_START = new Date('2026-03-27T17:00:00Z').getTime();
const ROUND2_END   = new Date('2026-03-27T17:30:00Z').getTime();

let currentState: LightState = 'RED';
let lastAdminMessage: string | undefined;
let lastAdminIntent: 'GREEN' | 'RED' | 'NO_CHANGE' | undefined;
let lastAdminConfidence: number | undefined;
let lastAdminAt: number | undefined;

// H2 FIX: Kill switch — checked by txEngine BEFORE every batch send
let killSwitch = false;

export function getGlobalState(): LightState {
  if (SIMULATION_MODE) return currentState;

  // M2 FIX: Hard-stop outside round windows regardless of admin commands
  const now = Date.now();
  if (now < ROUND1_START) return 'RED';
  if (now >= ROUND1_END && now < ROUND2_START) return 'RED'; // break
  if (now >= ROUND2_END) return 'RED'; // challenge over
  return currentState;
}



export function setGlobalState(state: LightState) {
  currentState = state;
  // H2 FIX: Kill switch — instant stop on RED
  if (state === 'RED') {
    killSwitch = true;
  } else {
    killSwitch = false;
  }
}

/** Check kill switch — used by txEngine to abort batch before sending */
export function isKillSwitchActive(): boolean {
  // Also enforce round boundaries
  const now = Date.now();
  if (now < ROUND1_START) return true;
  if (now >= ROUND1_END && now < ROUND2_START) return true;
  if (now >= ROUND2_END) return true;
  return killSwitch;
}

export function updateAdminContext(
  message: string,
  intent: 'GREEN' | 'RED' | 'NO_CHANGE',
  confidence: number
) {
  lastAdminMessage = message;
  lastAdminIntent = intent;
  lastAdminConfidence = confidence;
  lastAdminAt = Date.now();
}

export function getAdminContext() {
  return { lastAdminMessage, lastAdminIntent, lastAdminConfidence, lastAdminAt };
}
