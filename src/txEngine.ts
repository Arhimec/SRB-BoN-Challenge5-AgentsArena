import { log } from './logger';
import { getGlobalState, isKillSwitchActive } from './globalState';
import { addGuildFee, guildFeeLimitReached, MOVBALANCE_FEE } from './globalFee';
import { SIMULATION_MODE, BON_GATEWAY_API } from './config';
import { NonceManager } from './nonceManager';
import { buildAndSignBatch } from './bonSigner';
import { sendBatchParallel } from './batchSender';

interface TxEngineConfig {
  id: string;
  privateKey: string;
  senderAddress: string;
  feeLimitEgld: number;
  batchSize: number;
  onTx: (count: number, fee: number, rejected: number) => void;
  onError: (err: string) => void;
}

/**
 * Burst-monitor tx engine (adapted from RosettaStake patterns).
 *
 * Flow per cycle:
 *  1. Check state — if RED, wait
 *  2. Allocate batch of nonces from NonceManager
 *  3. Build + sign all txs
 *  4. CHECK KILL SWITCH — abort if RED switched during signing
 *  5. Send via /transaction/send-multiple (parallel slices)
 *  6. Track rejections, rollback nonces if needed
 *  7. Wait briefly for confirms (resync nonces)
 *  8. Repeat
 */
export function txLoopFactory(cfg: TxEngineConfig) {
  let agentFeeSpent = 0;
  let nonceManager: NonceManager | null = null;

  return async function txLoop() {
    // Initialize nonce manager (only if NOT in simulation mode)
    if (!SIMULATION_MODE) {
      nonceManager = await NonceManager.create(cfg.senderAddress, BON_GATEWAY_API);
      log(`[${cfg.id}] nonce manager ready, starting nonce: ${nonceManager.pendingCount()}`);
    } else {
      log(`[${cfg.id}] running in SIMULATION MODE`);
    }

    // Periodic resync (every 2 seconds, only if NOT in simulation mode)
    const resyncInterval = !SIMULATION_MODE ? setInterval(async () => {
      if (nonceManager) {
        const confirmed = await nonceManager.resync();
        if (confirmed > 0) {
          log(`[${cfg.id}] ${confirmed} txs confirmed on-chain`);
        }
      }
    }, 2000) : null;

    try {
      while (true) {
        // ── Budget check ──
        if (guildFeeLimitReached() || agentFeeSpent >= cfg.feeLimitEgld) {
          await sleep(500);
          continue;
        }

        // ── State check ──
        if (getGlobalState() === 'RED' || isKillSwitchActive()) {
          await sleep(50); // tight poll — ready to go as soon as GREEN
          continue;
        }

        // ── SIMULATION MODE ──
        if (SIMULATION_MODE) {
          const fee = MOVBALANCE_FEE * 10;
          agentFeeSpent += fee;
          addGuildFee(fee);
          cfg.onTx(10, fee, 0);
          await sleep(100);
          continue;
        }

        // ── Phase 1: Allocate nonces ──
        const nonces = nonceManager?.nextBatch(cfg.batchSize) || [];
        if (nonces.length === 0) {
          // Mempool full — resync and wait
          await nonceManager?.resync();
          await sleep(100);
          continue;
        }

        // ── Phase 2: Build + sign ──
        let txs: any[];
        try {
          txs = await buildAndSignBatch(cfg.privateKey, cfg.senderAddress, nonces);
        } catch (err: any) {
          cfg.onError(`sign error: ${err.message}`);
          nonceManager?.rollbackTo(nonces[0]); // give back nonces
          await sleep(200);
          continue;
        }

        // ── H2 FIX: Kill switch check AFTER sign, BEFORE send ──
        if (isKillSwitchActive() || getGlobalState() === 'RED') {
          // State changed while we were signing — abort batch, rollback nonces
          nonceManager?.rollbackTo(nonces[0]);
          log(`[${cfg.id}] kill switch: aborted ${txs.length} txs before send`);
          continue;
        }

        // ── Phase 3: Send ──
        try {
          const result = await sendBatchParallel(BON_GATEWAY_API, txs, 2);
          const fee = result.accepted * MOVBALANCE_FEE;
          agentFeeSpent += fee;
          addGuildFee(fee);
          cfg.onTx(result.accepted, fee, result.rejected);

          // ── Phase 4: Handle rejections ──
          if (result.rejected > 0) {
            // Find lowest rejected nonce and rollback
            for (let i = 0; i < result.hashes.length; i++) {
              if (result.hashes[i] === '') {
                nonceManager?.rollbackTo(nonces[i]);
                nonceManager?.trackRejection();
                break;
              }
            }
          }
        } catch (err: any) {
          cfg.onError(`send error: ${err.message}`);
          nonceManager?.rollbackTo(nonces[0]);
          await nonceManager?.forceReset();
          await sleep(300);
        }

        // Tiny yield to not starve the event loop
        await sleep(1);
      }
    } finally {
      if (resyncInterval) clearInterval(resyncInterval);
    }
  };
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}
