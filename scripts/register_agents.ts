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

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    try {
      log(`  Registering ${agent.id} (${agent.address.slice(0, 20)}...)...`);

      // 1. Hex encode arguments for register_agent@name@uri@pubkey@00@00
      const nameHex = Buffer.from(agent.id).toString('hex');
      const uriHex = Buffer.from(`https://agent.molt.bot/${agent.id}`).toString('hex');
      
      // Get 32-byte public key hex from Bech32 address
      const { Address } = require("@multiversx/sdk-core");
      const pubKeyHex = Address.newFromBech32(agent.address).getPublicKey().toString('hex');
      
      // Data format: register_agent@hexname@hexuri@hexpubkey@00@00
      const data = `register_agent@${nameHex}@${uriHex}@${pubKeyHex}@00@00`;

      const txHash = await sendSingleTx(
        agent.privateKey,
        agent.address,
        REGISTRY_CONTRACT,
        '0',
        data,
        undefined,
        20_000_000 // HIGHER GAS FOR NFT MINT
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
