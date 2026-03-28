import { LightState } from './types';
import { SIMULATION_MODE } from './config';

/**
 * EMERGENCY ROUND OVERRIDE:
 * Removed all date-based boundaries to ensure attack doesn't stop during high-latency periods.
 */

let currentState: LightState = 'GREEN'; // Force GREEN by default
let lastAdminMessage: string | undefined;
let lastAdminIntent: 'GREEN' | 'RED' | 'NO_CHANGE' | undefined;
let lastAdminConfidence: number | undefined;
let lastAdminAt: number | undefined;

let killSwitch = false;

export function getGlobalState(): LightState {
  if (SIMULATION_MODE) return currentState;
  return currentState; // Return forced state
}

export function setGlobalState(state: LightState) {
  currentState = state;
  if (state === 'RED') {
    killSwitch = true;
  } else {
    killSwitch = false;
  }
}

export function isKillSwitchActive(): boolean {
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
  
  if (intent === 'GREEN') setGlobalState('GREEN');
  if (intent === 'RED') setGlobalState('RED');
}

export function getAdminContext() {
  return { lastAdminMessage, lastAdminIntent, lastAdminConfidence, lastAdminAt };
}
