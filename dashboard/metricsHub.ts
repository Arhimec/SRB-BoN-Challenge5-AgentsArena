import { AgentMetrics } from '../src/types';
const agents = new Map<string, AgentMetrics>();
export function updateAgentMetrics(metrics: AgentMetrics) { agents.set(metrics.id, metrics); }
export function getAllAgentMetrics() { return Array.from(agents.values()); }
export function computeGuildMetrics() {
  const list = getAllAgentMetrics();
  return {
    totalScore: list.reduce((s, a) => s + a.score, 0),
    totalFeeSpent: list.reduce((s, a) => s + a.feeSpent, 0),
    totalPermitted: list.reduce((s, a) => s + a.permitted, 0),
    totalUnpermitted: list.reduce((s, a) => s + a.unpermitted, 0),
    activeAgents: list.length,
  };
}
