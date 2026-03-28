import fs from "fs";
import path from "path";
import { UserSigner } from "@multiversx/sdk-wallet";
import { sendSingleTx } from "../src/bonSigner";
import { log } from "../src/logger";

const GL_PEM_PATH = "wallets/guild_leader.pem";
const AGENTS_CONFIG = "config/agents.json";
// Default to 45 EGLD for competition. For testing, use "1000000000000000" (0.001 EGLD).
const FUND_VALUE = process.env.FUND_VALUE || "45000000000000000000"; 

async function main() {
  if (!fs.existsSync(GL_PEM_PATH)) {
    console.error(`ERROR: ${GL_PEM_PATH} not found`);
    process.exit(1);
  }

  const pem = fs.readFileSync(GL_PEM_PATH, "utf8");
  const signer = UserSigner.fromPem(pem);
  const glAddress = signer.getAddress().bech32();
  
  // Extract private key from PEM for use in sendSingleTx
  // sendSingleTx uses the hex private key.
  // Note: the SDK-Wallet Mnemonic/UserSigner don't expose purely hex easily, 
  // but we can get it from the PEM parsing.
  const b64Data = pem.split("\n").filter(l => !l.startsWith("-----")).join("").trim();
  const hexKey = Buffer.from(b64Data, 'base64').toString('hex');

  const agents = JSON.parse(fs.readFileSync(path.join(__dirname, "../", AGENTS_CONFIG), "utf8"));

  log(`Bulk Funding started from GL: ${glAddress}`);
  log(`Amount: ${FUND_VALUE} (45 EGLD) per agent`);

  for (const agent of agents) {
    try {
      log(`  Funding ${agent.id} (${agent.address.slice(0, 20)}...)...`);
      const txHash = await sendSingleTx(
        hexKey,
        glAddress,
        agent.address,
        FUND_VALUE
      );
      log(`  ✓ ${agent.id} funded: ${txHash}`);
      
      // Small delay between transactions to allow nonce processing
      await new Promise(r => setTimeout(r, 2000));
    } catch (err: any) {
      log(`  ✗ ${agent.id} funding failed: ${err.message}`);
    }
  }

  log("Bulk funding completed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
