import { Mnemonic } from "@multiversx/sdk-wallet";
import fs from "fs";
import path from "path";

const NUM_AGENTS = 10;
const WALLET_DIR = path.join(__dirname, "../wallets");
const CONFIG_PATH = path.join(__dirname, "../config/agents.json");

if (!fs.existsSync(WALLET_DIR)) {
  fs.mkdirSync(WALLET_DIR, { recursive: true });
}

async function main() {
  const agents = [];

  console.log(`\n🚀 Generating ${NUM_AGENTS} fresh agent wallets...`);

  for (let i = 1; i <= NUM_AGENTS; i++) {
    const mnemonic = Mnemonic.generate();
    const secretKey = mnemonic.deriveKey(0);
    const address = secretKey.generatePublicKey().toAddress().bech32();
    const secretKeyHex = secretKey.hex();

    // Save as PEM
    const pemContent = `-----BEGIN PRIVATE KEY for ${address}-----\n${Buffer.from(secretKeyHex, 'hex').toString('base64')}\n-----END PRIVATE KEY-----`;
    const pemPath = path.join(WALLET_DIR, `agent_${i}.pem`);
    fs.writeFileSync(pemPath, pemContent);

    agents.push({
      id: `agent-${i}`,
      address: address,
      privateKey: secretKeyHex,
      feeLimitEgld: 50,
      batchSize: 80
    });

    console.log(`  [agent-${i}] Generated: ${address}`);
  }

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(agents, null, 2));
  console.log(`\n✅ Updated ${CONFIG_PATH} with 10 agents.`);
  console.log(`✅ PEM files saved in ${WALLET_DIR}`);
  console.log(`\nNEXT STEP: Fund these agents from your Guild Leader wallet using scripts/bulk_fund.ts\n`);
}

main().catch(console.error);
