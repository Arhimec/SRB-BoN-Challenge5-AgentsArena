import fetch from 'node-fetch';
import { BON_EXPLORER_API, BON_GATEWAY_API, TARGET_ADDRESS } from '../src/config';
export async function getBonHealth() {
  let explorerOk = false, gatewayOk = false;
  try { const r = await fetch(`${BON_EXPLORER_API}/accounts/${TARGET_ADDRESS}/transactions?size=1`); explorerOk = r.ok; } catch {}
  try { const r = await fetch(`${BON_GATEWAY_API}/network/config`); gatewayOk = r.ok; } catch {}
  return { explorerOk, gatewayOk, checkedAt: Date.now() };
}
