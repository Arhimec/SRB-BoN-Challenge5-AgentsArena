import fetch from 'node-fetch';
import { BON_EXPLORER_API, ADMIN_ADDRESS, TARGET_ADDRESS } from './config';
import { log } from './logger';

const seenHashes = new Set<string>();
const MAX_SEEN = 2000;

export interface AdminCommand {
  message: string;
  txHash: string;
}

/**
 * High-Accuracy Polling Listener:
 * 1. Polls bon-api.multiversx.com for Admin's transactions.
 * 2. Filters for txs where Receiver === TARGET_ADDRESS.
 * 3. Decodes data (Base64) to get the raw message.
 */
export async function pollAdminCommands(): Promise<AdminCommand[]> {
  try {
    const res = await fetch(`${BON_EXPLORER_API}/accounts/${ADMIN_ADDRESS}/transactions?size=5`);
    if (!res.ok) return [];

    const txs: any = await res.json();
    if (!Array.isArray(txs)) return [];

    const newCommands: AdminCommand[] = [];

    // Filter for Admin -> Target transactions
    const relevantTxs = txs.filter(tx => 
      tx.receiver === TARGET_ADDRESS && 
      !seenHashes.has(tx.txHash)
    );

    for (const tx of relevantTxs) {
      seenHashes.add(tx.txHash);
      if (seenHashes.size > MAX_SEEN) {
        const first = seenHashes.values().next().value;
        if (first) seenHashes.delete(first);
      }

      if (!tx.data) continue;
      
      // Decode Base64 data
      const rawMessage = Buffer.from(tx.data, 'base64').toString();
      log(`[listener] Found Admin -> Target command: "${rawMessage}"`);
      
      newCommands.push({ message: rawMessage, txHash: tx.txHash });
    }

    return newCommands;
  } catch (err: any) {
    // Silent ignore for API noise
    return [];
  }
}
