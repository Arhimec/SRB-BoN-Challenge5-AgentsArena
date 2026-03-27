import fs from 'fs';
import path from 'path';
import { startCommandLoop } from './commandLoop';
import { startAgent, AgentConfig } from './singleAgent';
import { log } from './logger';
import { startDashboardServer, updateAgentMetrics } from '../dashboard/server';

async function main() {
  const cfgPath = path.join(__dirname, '../config/agents.json');
  const agents: AgentConfig[] = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  log(`[orchestrator] loading ${agents.length} agents`);

  startDashboardServer();
  startCommandLoop();

  for (const cfg of agents) {
    startAgent(cfg, metrics => updateAgentMetrics(metrics));
  }

  log('[orchestrator] all agents started');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
