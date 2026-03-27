// H3 FIX: Correct fee per MoveBalance tx on BoN:
// gasLimit=50000, gasPrice=1e9, modifier=0.01
// fee = 50000 * 1e9 = 50,000,000,000,000 raw = 0.00005 EGLD
// Old code used 0.0005 (10x too high) → agents stopped with 90% budget remaining

const GUILD_FEE_LIMIT_EGLD = 500;
const MOVBALANCE_FEE_EGLD = 0.00005;
let guildFeeSpent = 0;
let guildTxCount = 0;

export function addGuildFee(fee?: number) {
  guildFeeSpent += fee ?? MOVBALANCE_FEE_EGLD;
  guildTxCount++;
}

export function getGuildFeeSpent() {
  return guildFeeSpent;
}

export function getGuildTxCount() {
  return guildTxCount;
}

export function guildFeeLimitReached() {
  return guildFeeSpent >= GUILD_FEE_LIMIT_EGLD;
}

export function estimateRemainingTxs(): number {
  const remaining = GUILD_FEE_LIMIT_EGLD - guildFeeSpent;
  return Math.floor(remaining / MOVBALANCE_FEE_EGLD);
}

export const MOVBALANCE_FEE = MOVBALANCE_FEE_EGLD;
