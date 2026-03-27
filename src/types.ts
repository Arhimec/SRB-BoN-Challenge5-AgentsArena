export type LightState = 'GREEN' | 'RED';
export interface ClassificationResult {
  intent: 'GREEN' | 'RED' | 'NO_CHANGE';
  confidence: number;
}
export interface AgentMetrics {
  id: string;
  state: LightState;
  permitted: number;
  unpermitted: number;
  score: number;
  feeSpent: number;
  tps: number;
  lastAdminMessage?: string;
  lastAdminIntent?: string;
  lastAdminConfidence?: number;
  lastTxAt?: number;
  lastError?: string;
  updatedAt: number;
}
