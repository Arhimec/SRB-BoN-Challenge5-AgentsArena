import express from 'express';
import http from 'http';
import WebSocket from 'ws';
import { DASHBOARD_PORT } from '../src/config';
import { getAllAgentMetrics, computeGuildMetrics, updateAgentMetrics } from './metricsHub';
import { getBonHealth } from './bonHealth';
import { prometheusHandler } from './prometheus';
import { getGlobalState, getAdminContext } from '../src/globalState';
import { getGuildFeeSpent, getGuildTxCount, estimateRemainingTxs } from '../src/globalFee';
import { processCommand } from '../src/commandLoop';
import { log } from '../src/logger';

export { updateAgentMetrics };

const DASHBOARD_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Battle of Nodes Dashboard</title>
  <style>
    body { font-family: sans-serif; background: #1a1a1a; color: #fff; padding: 2rem; }
    .status { font-size: 2rem; padding: 1rem; border-radius: 8px; text-align: center; margin-bottom: 2rem; }
    .status.RED { background: #ff4444; }
    .status.GREEN { background: #00c851; }
    .controls { display: flex; gap: 1rem; justify-content: center; }
    button { padding: 1rem 2rem; font-size: 1.2rem; cursor: pointer; border: none; border-radius: 4px; transition: opacity 0.2s; }
    button.red { background: #ff4444; color: white; }
    button.green { background: #00c851; color: white; }
    button:hover { opacity: 0.8; }
    .meta { text-align: center; margin-top: 1rem; color: #888; }
  </style>
</head>
<body>
  <div id="status" class="status">LOADING...</div>
  <div class="controls">
    <button class="green" onclick="send('go')">MOCK: GO</button>
    <button class="red" onclick="send('stop')">MOCK: STOP</button>
  </div>
  <div id="meta" class="meta">Waiting for data...</div>

  <script>
    const statusDiv = document.getElementById('status');
    const metaDiv = document.getElementById('meta');
    
    // Use window.location.host since this runs in the browser
    const ws = new WebSocket('ws://' + window.location.host);
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'snapshot') {
        statusDiv.className = 'status ' + data.globalState;
        statusDiv.innerText = 'GLOBAL STATE: ' + data.globalState;
        metaDiv.innerText = 'Txs: ' + data.guildTxCount + ' | Last Msg: ' + (data.admin.lastAdminMessage || 'none');
      }
    };

    async function send(msg) {
      await fetch('/mock-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg })
      });
    }
  </script>
</body>
</html>
`;

export function startDashboardServer() {
  const app = express();
  app.use(express.json());
  const server = http.createServer(app);
  const wss = new WebSocket.Server({ server });

  app.get('/', (_req, res) => { res.send(DASHBOARD_HTML); });
  app.get('/metrics', prometheusHandler);
  app.get('/bon-health', async (_req, res) => { res.json(await getBonHealth()); });
  
  app.post('/mock-command', async (req, res) => {
    const { message } = req.body;
    log('[dashboard] mock command: ' + message);
    const newState = await processCommand(message);
    res.json({ success: true, newState });
  });

  wss.on('connection', ws => {
    const send = async () => {
      ws.send(JSON.stringify({ type: 'snapshot', agents: getAllAgentMetrics(), guild: computeGuildMetrics(),
        health: await getBonHealth(), globalState: getGlobalState(), admin: getAdminContext(),
        guildFeeSpent: getGuildFeeSpent(), guildTxCount: getGuildTxCount(), remainingTxs: estimateRemainingTxs() }));
    };
    send(); const id = setInterval(send, 1000); ws.on('close', () => clearInterval(id));
  });

  server.listen(DASHBOARD_PORT, () => log('[dashboard] :' + DASHBOARD_PORT));
}

