/**
 * Wallet Setup Script
 *
 * Run AFTER 15:00 UTC when 500 EGLD arrives in guild leader wallet.
 * Creates 10 agent wallets and funds them directly from GL wallet.
 *
 * Usage:
 *   GL_PEM=/path/to/guild_leader.pem ts-node scripts/setup_wallets.ts
 *
 * IMPORTANT: All agents must be funded DIRECTLY from GL wallet.
 * No intermediary wallets — chain of GL→A→B will NOT be counted.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { sendSingleTx } from '../src/bonSigner';
import { log } from '../src/logger';
import { BON_GATEWAY_API } from '../src/config';

const GL_PEM = process.env.GL_PEM || '';
const NUM_AGENTS = 10;
const EGLD_PER_AGENT = '45000000000000000000'; // 45 EGLD each (450 total, 50 reserve)

async function main() {
  if (!GL_PEM) {
    console.error('ERROR: Set GL_PEM to path of guild leader PEM file');
    process.exit(1);
  }

  // Parse GL wallet
  const glPemData = fs.readFileSync(GL_PEM, 'utf8');
  const glLines = glPemData.split('\n');
  let glB64 = '';
  let inBlock = false;
  for (const line of glLines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('-----BEGIN')) { inBlock = true; continue; }
    if (trimmed.startsWith('-----END')) break;
    if (inBlock) glB64 += trimmed;
  }
  const glDecoded = Buffer.from(glB64, 'base64').toString();
  const glSeedHex = glDecoded.slice(0, 64);
  // Extract GL address from PEM header
  const glAddrMatch = glPemData.match(/erd1[a-z0-9]+/);
  if (!glAddrMatch) {
    console.error('Could not extract GL address from PEM');
    process.exit(1);
  }
  const glAddress = glAddrMatch[0];
  log(`GL wallet: ${glAddress.slice(0, 24)}...`);

  // Generate 10 agent wallets
  const agents: any[] = [];
  const outputDir = path.join(__dirname, '../wallets');
  fs.mkdirSync(outputDir, { recursive: true });

  log(`Generating ${NUM_AGENTS} agent wallets...`);

  for (let i = 0; i < NUM_AGENTS; i++) {
    // Generate ed25519 keypair
    const seed = crypto.randomBytes(32);
    const seedHex = seed.toString('hex');

    // We need mxpy or sdk to get the bech32 address from the seed.
    // For now, write the seed and let the user derive addresses.
    const pemPath = path.join(outputDir, `agent_${i + 1}.pem`);

    // Note: Proper PEM generation requires the MultiversX SDK.
    // This script provides the structure — use mxpy for actual key generation:
    //   mxpy wallet new --format pem --outfile wallets/agent_1.pem
    log(`  Agent ${i + 1}: wallet generation requires mxpy`);
    log(`    Run: mxpy wallet new --format pem --outfile ${pemPath}`);
  }

  log('');
  log('After generating wallets with mxpy, run this to fund them:');
  log('');

  // Funding instructions
  log('FUNDING COMMANDS (run after wallet generation):');
  for (let i = 1; i <= NUM_AGENTS; i++) {
    log(`  mxpy tx new \\`);
    log(`    --receiver $(head -1 wallets/agent_${i}.pem | grep -o 'erd1[a-z0-9]*') \\`);
    log(`    --value ${EGLD_PER_AGENT} \\`);
    log(`    --pem ${GL_PEM} \\`);
    log(`    --proxy ${BON_GATEWAY_API} \\`);
    log(`    --chain B --gas-limit 100000 --send`);
    log('');
  }

  log('After funding, update config/agents.json with wallet addresses and private keys.');
  log('Then run: ts-node scripts/register_agents.ts');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
