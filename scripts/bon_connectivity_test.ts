import { BON_EXPLORER_API, BON_GATEWAY_API, ADMIN_ADDRESS, TARGET_ADDRESS, SIMULATION_MODE } from '../src/config';
import fetch from 'node-fetch';
import { log } from '../src/logger';

async function testExplorer() {
  log('Testing Explorer...');
  const url = `${BON_EXPLORER_API}/accounts/${TARGET_ADDRESS}/transactions?size=5&sort=desc`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Explorer error: ${res.status}`);
  const txs: any[] = await res.json() as any[];
  log(`Explorer OK, got ${txs.length} txs`);
  const adminTxs = txs.filter((tx: any) => tx.sender === ADMIN_ADDRESS && tx.receiver === TARGET_ADDRESS);
  log(`Admin→TARGET txs: ${adminTxs.length}`);
}

async function testGateway() {
  log('Testing Gateway...');
  const res = await fetch(`${BON_GATEWAY_API}/network/config`);
  if (!res.ok) throw new Error(`Gateway error: ${res.status}`);
  const body: any = await res.json();
  log('Gateway OK, chainID:', body.data?.config?.ChainID || 'unknown');
}

async function main() {
  try {
    await testExplorer();
    await testGateway();
    log('All connectivity tests passed');
  } catch (e: any) {
    log('Connectivity test failed:', e.message || e);
  }
}

main();
