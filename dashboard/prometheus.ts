import client from 'prom-client';
import { computeGuildMetrics } from './metricsHub';
const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });
const gauge = new client.Gauge({ name: 'guild_metrics', help: 'Guild metrics', labelNames: ['metric'] });
registry.registerMetric(gauge);
export function updatePrometheus() {
  const g = computeGuildMetrics();
  gauge.set({ metric: 'total_score' }, g.totalScore);
  gauge.set({ metric: 'total_fee' }, g.totalFeeSpent);
  gauge.set({ metric: 'active_agents' }, g.activeAgents);
  gauge.set({ metric: 'total_permitted' }, g.totalPermitted);
}
export function prometheusHandler(_req: any, res: any) {
  updatePrometheus(); res.set('Content-Type', registry.contentType); res.end(registry.metrics());
}
