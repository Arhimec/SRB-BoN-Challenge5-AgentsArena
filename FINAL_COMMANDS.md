# Final Step-by-Step Commands (Battle of Nodes Challenge 5-3)

### 1. Create New Agents & Wallets
*This generates 10 fresh PEM files and updates `config/agents.json` automatically.*
```bash
npx ts-node scripts/setup_wallets.ts
```

### 2. Final Bulk Funding (45 EGLD each)
*Sends 45 EGLD from `wallets/guild_leader.pem` to all 10 agents.*
```bash
npx ts-node scripts/bulk_fund.ts
```

### 3. Agent Registration (after 15:00 UTC)
*Replace `erd1...` with the official address from [bon.multiversx.com](https://bon.multiversx.com).*
```bash
REGISTRY_CONTRACT=erd1... npx ts-node scripts/register_agents.ts
```

### 4. Start LLM Classifier
```bash
npm run llm
```

### 5. Toggle Simulation Mode OFF
*Edit your `.env` file:*
```text
SIMULATION_MODE=false
```

### 6. Start Orchestrator (Competition Run)
```bash
npm run dev
```

### Monitoring
*Visit [http://localhost:4000](http://localhost:4000) for real-time status and manual control.*
