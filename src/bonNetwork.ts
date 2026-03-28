import fetch from 'node-fetch';
import { BON_GATEWAY_API } from './config';
import { log } from './logger';

export interface BonNetworkConfig {
  chainID: string;
  minGasPrice: number;
  gasPerDataByte: number;
  defaultGasLimit: number;
}

let cachedConfig: BonNetworkConfig | null = null;

export async function loadBonNetworkConfig(): Promise<BonNetworkConfig> {
  if (cachedConfig) return cachedConfig;
  const res = await fetch(`${BON_GATEWAY_API}/network/config`);
  if (!res.ok) throw new Error(`BoN network config error: ${res.status}`);
  const body: any = await res.json();
  const cfg = body.data?.config || body.data || body;
  cachedConfig = {
    chainID: cfg.erd_chain_id || cfg.ChainID || cfg.chainID || 'D',
    minGasPrice: Number(cfg.erd_min_gas_price || cfg.MinGasPrice || cfg.minGasPrice || 1000000000),
    gasPerDataByte: Number(cfg.erd_gas_per_data_byte || cfg.GasPerDataByte || cfg.gasPerDataByte || 1500),
    defaultGasLimit: Number(cfg.erd_min_gas_limit || cfg.MinGasLimit || cfg.minGasLimit || 50000),
  };

  log('[BoN] loaded network config:', cachedConfig);
  return cachedConfig;
}
