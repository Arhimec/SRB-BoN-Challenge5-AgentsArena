import fetch from 'node-fetch';
import { BON_EXPLORER_API, ADMIN_ADDRESS, TARGET_ADDRESS, SIMULATION_MODE } from './config';
import { log } from './logger';

// C4 FIX: txHash-based dedup instead of timestamp (same-block commands were missed)
const seenHashes = new Set<string>();
const MAX_SEEN = 2000;

export interface AdminCommand {
  txHash: string;
  timestamp: number;
  message: string;
}

export async function pollAdminCommands(): Promise<AdminCommand[]> {
  // If in simulation mode or addresses are not set, return empty (or could return mock commands)
  if (SIMULATION_MODE || ADMIN_ADDRESS.includes('...') || TARGET_ADDRESS.includes('...')) {
    return []; 
  }

  const url = `${BON_EXPLORER_API}/accounts/${TARGET_ADDRESS}/transactions?size=50&sort=desc`;
  let res: any;
  try {
    res = await fetch(url);
  } catch (err: any) {
    log('[listener] fetch error:', err.message);
    return [];
  }

  if (!res.ok) {
    log('[listener] HTTP error:', res.status);
    return [];
  }

  let txs: any[];
  try {
    txs = await res.json();
  } catch {
    log('[listener] JSON parse error');
    return [];
  }

  if (!Array.isArray(txs)) return [];

  const cmds: AdminCommand[] = [];

  for (const tx of txs) {
    // H5 FIX: Filter BOTH sender AND receiver
    if (tx.sender !== ADMIN_ADDRESS) continue;
    if (tx.receiver !== TARGET_ADDRESS) continue;

    // C4 FIX: txHash-based dedup (not timestamp)
    if (seenHashes.has(tx.txHash)) continue;
    seenHashes.add(tx.txHash);

    const msg = tx.data ? Buffer.from(tx.data, 'base64').toString('utf8') : '';
    if (!msg.trim()) continue; // skip empty data txs

    cmds.push({ txHash: tx.txHash, timestamp: tx.timestamp, message: msg });
  }

  // Trim seen set to prevent unbounded growth
  if (seenHashes.size > MAX_SEEN) {
    const arr = Array.from(seenHashes);
    seenHashes.clear();
    for (const h of arr.slice(-1000)) seenHashes.add(h);
  }

  // Return in chronological order (oldest first)
  return cmds.reverse();
}
