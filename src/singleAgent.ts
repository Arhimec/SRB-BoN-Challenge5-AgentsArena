import { txLoopFactory } from './txEngine';
import { getGlobalState, getAdminContext } from './globalState';
import { AgentMetrics } from './types';

export interface AgentConfig {
  id: string;
  address: string;
  privateKey: string;
  feeLimitEgld: number;
  batchSize?: number;
}

export type AgentMetricsSink = (metrics: AgentMetrics) => void;

export function startAgent(cfg: AgentConfig, report: AgentMetricsSink) {
  let permitted = 0;
  let unpermitted = 0;
  let feeSpent = 0;
  let rejected = 0;
  let lastTxAt: number | undefined;
  let lastError: string | undefined;
  const startTime = Date.now();

  const txLoop = txLoopFactory({
    id: cfg.id,
    privateKey: cfg.privateKey,
    senderAddress: cfg.address,
    feeLimitEgld: cfg.feeLimitEgld,
    batchSize: cfg.batchSize ?? 80,
    onTx: (count, fee, rejectedCount) => {
      feeSpent += fee;
      permitted += count;
      rejected += rejectedCount;
      lastTxAt = Date.now();
      pushMetrics();
    },
    onError: err => {
      lastError = err;
      pushMetrics();
    },
  });

  function pushMetrics() {
    const admin = getAdminContext();
    const elapsed = (Date.now() - startTime) / 1000;
    const metrics: AgentMetrics = {
      id: cfg.id,
      // M1 FIX: read state from globalState, not dead local variable
      state: getGlobalState(),
      permitted,
      unpermitted,
      score: permitted - unpermitted,
      feeSpent,
      tps: elapsed > 0 ? permitted / elapsed : 0,
      lastAdminMessage: admin.lastAdminMessage,
      lastAdminIntent: admin.lastAdminIntent,
      lastAdminConfidence: admin.lastAdminConfidence,
      lastTxAt,
      lastError,
      updatedAt: Date.now(),
    };
    report(metrics);
  }

  // Start the tx loop
  txLoop().catch(err => {
    lastError = `txLoop crashed: ${err.message}`;
    pushMetrics();
  });
}
