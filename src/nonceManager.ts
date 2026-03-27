import fetch from 'node-fetch';
import { log } from './logger';

const MEMPOOL_CAP = 100;

export class NonceManager {
  private local: number;
  private lastSync: number;
  private address: string;
  private gateway: string;
  private consecutiveRejects = 0;

  constructor(address: string, gateway: string, initialNonce: number) {
    this.local = initialNonce;
    this.lastSync = initialNonce;
    this.address = address;
    this.gateway = gateway;
  }

  static async create(address: string, gateway: string): Promise<NonceManager> {
    const nonce = await NonceManager.fetchOnChainNonce(gateway, address);
    return new NonceManager(address, gateway, nonce);
  }

  /** Get next nonce and increment. Returns null if mempool cap reached. */
  getAndIncrement(): number | null {
    if (this.local - this.lastSync >= MEMPOOL_CAP) return null;
    return this.local++;
  }

  /** Reserve a batch of sequential nonces. Returns empty array if at cap. */
  nextBatch(size: number): number[] {
    const drift = this.local - this.lastSync;
    if (drift >= MEMPOOL_CAP) return [];
    const available = Math.min(size, MEMPOOL_CAP - drift);
    const nonces: number[] = [];
    for (let i = 0; i < available; i++) {
      nonces.push(this.local++);
    }
    return nonces;
  }

  /** Resync from chain. Returns number of confirmed txs since last sync. */
  async resync(): Promise<number> {
    try {
      const onChain = await NonceManager.fetchOnChainNonce(this.gateway, this.address);
      let confirmed = 0;
      if (onChain > this.lastSync) {
        confirmed = onChain - this.lastSync;
        this.lastSync = onChain;
      }
      if (onChain > this.local) {
        this.local = onChain;
      }
      if (confirmed > 0) this.consecutiveRejects = 0;
      return confirmed;
    } catch (err: any) {
      log(`[NonceManager] resync error ${this.address.slice(0, 16)}: ${err.message}`);
      return 0;
    }
  }

  /** Roll back local nonce to a lower value (for rejection recovery). */
  rollbackTo(nonce: number) {
    if (nonce < this.local) this.local = nonce;
  }

  /** Force reset from chain — used after repeated failures. */
  async forceReset(): Promise<void> {
    try {
      const onChain = await NonceManager.fetchOnChainNonce(this.gateway, this.address);
      this.local = onChain;
      this.lastSync = onChain;
      this.consecutiveRejects = 0;
      log(`[NonceManager] force reset ${this.address.slice(0, 16)} → nonce ${onChain}`);
    } catch (err: any) {
      log(`[NonceManager] forceReset failed: ${err.message}`);
    }
  }

  trackRejection() {
    this.consecutiveRejects++;
    if (this.consecutiveRejects >= 3) {
      this.forceReset();
    }
  }

  pendingCount(): number {
    return this.local - this.lastSync;
  }

  private static async fetchOnChainNonce(gateway: string, address: string): Promise<number> {
    const res = await fetch(`${gateway}/address/${address}`);
    if (!res.ok) throw new Error(`Nonce fetch failed: ${res.status}`);
    const body: any = await res.json();
    return Number(body.data?.account?.nonce || 0);
  }
}
