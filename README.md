# Guild Agents — Battle of Nodes Challenge 5: Agent Arena

Multi-agent orchestrator for the Red Light / Green Light challenge.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    VPS / Local                       │
│                                                      │
│  ┌──────────────┐    ┌──────────────┐               │
│  │ LLM Server   │    │ Command Loop │               │
│  │ (Claude API) │◄───│ (300ms poll) │               │
│  │ :8080        │    └──────┬───────┘               │
│  └──────────────┘           │                        │
│                    setGlobalState(GREEN/RED)          │
│                             │                        │
│  ┌──────────────────────────▼──────────────────────┐ │
│  │              10 × Agent TX Engines              │ │
│  │  ┌─────┐ ┌─────┐ ┌─────┐      ┌─────┐        │ │
│  │  │ A-1 │ │ A-2 │ │ A-3 │ ···  │A-10 │        │ │
│  │  │80/bt│ │80/bt│ │80/bt│      │80/bt│        │ │
│  │  └──┬──┘ └──┬──┘ └──┬──┘      └──┬──┘        │ │
│  │     └───────┴───────┴────────────┘            │ │
│  │              /transaction/send-multiple         │ │
│  └─────────────────────┬──────────────────────────┘ │
│                        │                             │
│  ┌─────────────────────▼───────────┐                │
│  │ Dashboard + Prometheus (:4000)  │                │
│  └─────────────────────────────────┘                │
└────────────────────────┬────────────────────────────┘
                         │
              BoN Gateway / Explorer
```

## Quick Start — Local Testing

### 1. Install

```bash
npm install
```

### 2. Start the LLM classifier

```bash
ANTHROPIC_API_KEY=sk-ant-... npm run llm
```

This starts the Claude-backed classifier on `:8080`. Test it:

```bash
# Single message test
curl "http://localhost:8080/test?msg=Go%20go%20go!"

# Full adversarial test suite (25 cases)
curl http://localhost:8080/test-suite
```

### 3. Start the agent orchestrator

In a second terminal:

```bash
cp .env.example .env
# Edit .env with real values:
#   ADMIN_ADDRESS and TARGET_ADDRESS (announced at 15:00 UTC on challenge day)
#   LLM_ENDPOINT=http://localhost:8080/classify-intent (already default)

npm run dev
```

### 4. Monitor

- Dashboard: http://localhost:4000
- Prometheus: http://localhost:4000/metrics
- LLM health: http://localhost:8080/health

## Challenge Day Timeline

```
15:00 UTC — Addresses announced, 500 EGLD arrives
  → Edit .env: ADMIN_ADDRESS, TARGET_ADDRESS
  → Generate 10 wallets: mxpy wallet new --format pem (×10)  
  → Fund all 10 from GL wallet (45 EGLD each, direct, no intermediaries)
  → Update config/agents.json with real addresses + hex private keys

15:30 UTC — Registry contract known
  → REGISTRY_CONTRACT=erd1... npm run register

15:45 UTC — Registration deadline (HARD)
  → Verify all 10 agents at bon.multiversx.com/guild-wars

15:50 UTC — Final checks
  → npm run connectivity
  → Start LLM: ANTHROPIC_API_KEY=... npm run llm
  → Start agents: npm run dev

16:00 UTC — Round 1 (auto-detected by command loop)
16:30 UTC — Round 1 ends (hard stop in globalState.ts)
17:00 UTC — Round 2 (auto-resumes)
17:30 UTC — Challenge ends (hard stop)
```

## Key Fixes (v2)

- **308× throughput**: Local nonce management + batch sending (/transaction/send-multiple)
- **Two-tier classifier**: Fast local pattern match (<1ms) + Claude API fallback for adversarial commands
- **Kill switch**: Atomic RED flag checked between sign and send — no burst leaks
- **Round boundaries**: Hard stops at 16:30/17:00/17:30 regardless of admin commands  
- **txHash dedup**: No more missed same-block commands
- **Correct fees**: 0.00005 EGLD per tx (was 10× wrong)
