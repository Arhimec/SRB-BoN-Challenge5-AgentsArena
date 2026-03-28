import fs from 'fs';
import path from 'path';
import { Address } from '@multiversx/sdk-core';

const AGENTS_CONFIG = path.join(__dirname, '../config/agents.json');
const WALLETS_DIR = path.join(__dirname, '../wallets');

async function main() {
    const agents = JSON.parse(fs.readFileSync(AGENTS_CONFIG, 'utf8'));

    for (const agent of agents) {
        const seed = Buffer.from(agent.privateKey, 'hex');
        // Get 32-byte public key from Bech32 address
        const pubKey = Address.newFromBech32(agent.address).getPublicKey();
        
        // MultiversX SDK expects 64 bytes: [seed (32) + pubKey (32)]
        const combined = Buffer.concat([seed, pubKey]);
        const base64Content = combined.toString('base64');
        
        const pemContent = `-----BEGIN PRIVATE KEY-----\n${base64Content}\n-----END PRIVATE KEY-----`;
        const pemPath = path.join(WALLETS_DIR, `agent_${agent.id.split('-')[1]}.pem`);
        
        fs.writeFileSync(pemPath, pemContent);
        console.log(`✅ Fixed PEM for ${agent.id}: ${agent.address}`);
    }
}

main().catch(console.error);
