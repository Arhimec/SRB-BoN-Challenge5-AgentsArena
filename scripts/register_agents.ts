/**
 * MX-8004 Agent Registration Script
 *
 * MUST be run BEFORE 15:45 UTC on challenge day.
 * Registers all agents in config/agents.json with the on-chain registry.
 *
 * Usage:
 *   REGISTRY_CONTRACT=erd1... ts-node scripts/register_agents.ts
 *
 * The registry contract address will be available from:
 *   - bon.multiversx.com/guild-wars (announced at 15:00 UTC)
 *   - github.com/sasurobert/moltbot-starter-kit (openclaw-template)
 *
 * Each agent wallet calls the registry contract to register itself.
 */

import fs from 'fs';
import path from 'path';
import { sendSingleTx } from '../src/bonSigner';
import { log } from '../src/logger';

const REGISTRY_CONTRACT = process.env.REGISTRY_CONTRACT || '';

async function main() {
  if (!REGISTRY_CONTRACT) {
    console.error('ERROR: Set REGISTRY_CONTRACT env var to the MX-8004 registry address');
    console.error('  This will be announced at 15:00 UTC on challenge day');
    process.exit(1);
  }

  const cfgPath = path.join(__dirname, '../config/agents.json');
  const agents = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));

  log(`Registering ${agents.length} agents with registry: ${REGISTRY_CONTRACT.slice(0, 30)}...`);

  for (const agent of agents) {
    try {
      log(`  Registering ${agent.id} (${agent.address.slice(0, 20)}...)...`);

      // MX-8004 registration — the exact endpoint name may vary.
      // Common patterns from openclaw-template:
      //   - "registerAgent" (SC call with no args)
      //   - "register" (SC call)
      // Gas limit needs to be higher for SC calls (~5M)
      const txHash = await sendSingleTx(
        agent.privateKey,
        agent.address,
        REGISTRY_CONTRACT,
        '0',
        'registerAgent', // data field — adjust if registry uses different endpoint
        undefined,       // nonce — auto-fetch
        5_000_000        // gasLimit for SC call
      );

      log(`  ✓ ${agent.id} registered: ${txHash}`);

      // Wait for cross-shard finality
      await new Promise(r => setTimeout(r, 6000));
    } catch (err: any) {
      log(`  ✗ ${agent.id} registration failed: ${err.message}`);
      log(`    You may need to register manually via mxpy or the Agent Marketplace UI`);
    }
  }

  log('Registration complete. Verify at bon.multiversx.com/guild-wars');
  log('DEADLINE: All agents must appear in Agent Marketplace by 15:45 UTC');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
