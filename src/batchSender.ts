import fetch from 'node-fetch';
import { log } from './logger';

export interface BatchResult {
  accepted: number;
  rejected: number;
  hashes: string[]; // positional — empty string = rejected
}

/**
 * Send a batch of pre-signed transactions via /transaction/send-multiple.
 * Returns per-tx acceptance status for rejection recovery.
 */
export async function sendBatch(gateway: string, txs: any[]): Promise<BatchResult> {
  const res = await fetch(`${gateway}/transaction/send-multiple`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(txs),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`send-multiple failed: ${res.status} ${text}`);
  }

  const body: any = await res.json();
  if (body.error) throw new Error(`send-multiple error: ${body.error}`);

  const hashMap: Record<string, string> = body.data?.txsHashes || {};
  const hashes: string[] = [];
  let accepted = 0;

  for (let i = 0; i < txs.length; i++) {
    const h = hashMap[String(i)] || '';
    hashes.push(h);
    if (h) accepted++;
  }

  return { accepted, rejected: txs.length - accepted, hashes };
}

/**
 * Send batch in parallel slices for higher throughput.
 */
export async function sendBatchParallel(
  gateway: string,
  txs: any[],
  parallelism: number = 4
): Promise<BatchResult> {
  if (parallelism <= 1 || txs.length <= 50) {
    return sendBatch(gateway, txs);
  }

  const sliceSize = Math.ceil(txs.length / parallelism);
  const promises: Promise<{ result: BatchResult | null; offset: number }>[] = [];

  for (let off = 0; off < txs.length; off += sliceSize) {
    const slice = txs.slice(off, off + sliceSize);
    const offset = off;
    promises.push(
      sendBatch(gateway, slice)
        .then(result => ({ result, offset }))
        .catch(() => ({ result: null, offset }))
    );
  }

  const results = await Promise.all(promises);
  const merged: BatchResult = { accepted: 0, rejected: 0, hashes: new Array(txs.length).fill('') };

  for (const { result, offset } of results) {
    if (!result) {
      // Entire slice failed — count all as rejected
      const sliceEnd = Math.min(offset + sliceSize, txs.length);
      merged.rejected += sliceEnd - offset;
      continue;
    }
    merged.accepted += result.accepted;
    merged.rejected += result.rejected;
    for (let i = 0; i < result.hashes.length; i++) {
      if (offset + i < merged.hashes.length) {
        merged.hashes[offset + i] = result.hashes[i];
      }
    }
  }

  return merged;
}
