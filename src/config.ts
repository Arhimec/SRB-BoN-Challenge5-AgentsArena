import 'dotenv/config';

export const BON_EXPLORER_API = process.env.BON_EXPLORER_API || 'https://bon-explorer.multiversx.com';
export const BON_GATEWAY_API = process.env.BON_GATEWAY_API || 'https://gateway.battleofnodes.com';
export const ADMIN_ADDRESS = process.env.ADMIN_ADDRESS || '';
export const TARGET_ADDRESS = process.env.TARGET_ADDRESS || '';
export const LLM_ENDPOINT = process.env.LLM_ENDPOINT || 'http://localhost:8080/classify-intent';
export const SIMULATION_MODE = process.env.SIMULATION_MODE === 'true';
export const DASHBOARD_PORT = Number(process.env.DASHBOARD_PORT || 4000);
