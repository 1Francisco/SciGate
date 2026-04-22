# ⬡ SciGate

**Decentralized academic paper monetization.** Scientists publish papers verified with **World ID**. Every time an AI agent or a human queries the paper via RAG, the author receives an instant USDC micropayment via the **x402** protocol on **World Chain** (and Solana).

Built for the World Build 3 Hackathon · April 2026.

---

## Table of contents

1. [Architecture](#architecture)
2. [Repo structure](#repo-structure)
3. [What's already done vs. what you need to do](#whats-already-done-vs-what-you-need-to-do)
4. [Quick start (local dev)](#quick-start-local-dev)
5. [Production deployment — 4 pieces](#production-deployment--4-pieces)
   - [1. World App (Next.js frontend)](#1--world-app-nextjs-frontend)
   - [2. Smart contract (PaperRegistry)](#2--smart-contract-paperregistry)
   - [3. x402 gateway server + Supabase](#3--x402-gateway-server--supabase)
   - [4. RAG agent (Raspberry Pi)](#4--rag-agent-raspberry-pi)
6. [Environment variables reference](#environment-variables-reference)
7. [Suggested 1-day bring-up order](#suggested-1-day-bring-up-order)
8. [Known footguns](#known-footguns)
9. [Commands cheat sheet](#commands-cheat-sheet)
10. [Troubleshooting](#troubleshooting)
11. [Post-deploy validation](#post-deploy-validation)

---

## Architecture

```
┌───────────────────┐      ┌────────────────────────┐      ┌───────────────────┐
│  Next.js web      │ HTTP │  Hono x402 gateway     │ HTTP │  FastAPI RAG      │
│  :3000            │─────▶│  :3001                 │─────▶│  :8000 (Pi)       │
│                   │      │                        │      │                   │
│  MiniKit · wagmi  │      │  • payment middleware  │      │  • PDF ingest     │
│  World ID verify  │      │  • verify USDC (viem)  │      │  • Gemini QA      │
│  PayLink · Pay UI │      │  • recordAccess chain  │      │  • agent buyer    │
└───────────────────┘      │  • free-trial (PG)     │      │    (optional)     │
                           └────────────────────────┘      └───────────────────┘
                                      │                              │
                                      │ viem                         │ vector RPC
                                      ▼                              ▼
                           ┌────────────────────────┐      ┌───────────────────┐
                           │  PaperRegistry.sol     │      │  Supabase pgvector│
                           │  World Chain (480)     │      │  papers, chunks,  │
                           │  recordAccess events   │      │  usage_trials     │
                           └────────────────────────┘      └───────────────────┘
```

**Payment flow** (what the gateway middleware does on each paid request):

1. If `DEMO_MODE=true` **and** header `x-payment-proof: demo_bypass` → pass.
2. If `x-payment-proof` is a real `0x…` tx hash → verify on-chain (ERC-20 Transfer log to the correct payee, replay-checked) → pass + call `recordAccess` in the background.
3. Else check `increment_trial` in Supabase. If under the free-trial limit (3 queries, 1 full) → pass.
4. Else return HTTP `402` with an `accepts[]` array listing World Chain + Solana payment options.

---

## Repo structure

```
scigate/
├── app/                      # Next.js 14 App Router (the web frontend)
│   ├── api/                  # Proxies to server; only /api/verify has secrets
│   ├── upload/               # Publish a paper (World ID → PDF → on-chain register)
│   ├── explore/              # Search + query UI
│   ├── dashboard/            # Author earnings
│   └── pay/[id]/             # Shareable PayLink checkout
├── components/               # WorldIDVerify, PayLinkCard, AgentControl…
├── config/                   # abi.ts, wagmi.ts
├── packages/
│   ├── contracts/            # Foundry project (Solidity 0.8.24)
│   │   ├── src/PaperRegistry.sol
│   │   ├── script/Deploy.s.sol
│   │   └── test/PaperRegistry.t.sol
│   ├── server/               # Hono x402 gateway
│   │   └── src/
│   │       ├── index.ts      # app + payment middleware
│   │       ├── config.ts     # env loading + fail-fast
│   │       ├── routes/       # papers.ts, authors.ts
│   │       └── services/     # contract, payment, supabase, rag, rateLimit, logger
│   └── rag/                  # FastAPI RAG engine
│       ├── main.py
│       └── services/         # pdf_parser, chunker, embedder, qa, agent_buyer, x402_handler
├── supabase/
│   └── migrations/           # Versioned SQL: init, match_chunks, increment_trial, RLS
├── .github/workflows/ci.yml  # typecheck web + server, forge test, smoke RAG
├── CLAUDE.md                 # Architectural guide (for Claude Code)
├── DEPLOY.md                 # Full production checklist
└── README.md                 # This file
```

---

## What's already done vs. what you need to do

### ✅ The repo already ships with

| Area | State |
|---|---|
| Gitignore + clean repo | Artifacts (chroma_db, broadcast, cache) untracked |
| Dependency versions | Real, installable; `npm install` works on clean clone |
| Typechecks | `tsc --noEmit` green on root (Next) and `packages/server` |
| Bypasses | All consolidated behind `DEMO_MODE=true`; `NODE_ENV=production + DEMO_MODE=true` → `process.exit(1)` |
| x402 verification | Real on-chain USDC transfer check with viem + replay cache |
| `recordAccess` | Called post-payment in background; falls back to `pending_records` queue |
| Free trial | Persisted in Supabase `usage_trials` + `increment_trial` RPC |
| 402 challenge | Dual-network (World + Solana), author address resolved from chain → Supabase → default |
| Solana network ID | Unified between server (`config.ts`) and RAG (`x402_handler.py`) |
| World ID verification | Real API call; demo fallback only if `DEMO_MODE=true` |
| PayLink header parsing | JSON / base64 / body fallback |
| `/debug/log` | Requires `Authorization: Bearer ${DEBUG_LOG_TOKEN}` |
| RAG internal auth | `/query`, `/sections`, `/ask-agent` require `x-internal-token` |
| Vector search | `match_chunks` with optional `p_paper_id` (NULL = global) |
| Rate limiting | 20 rpm per IP in-memory (Redis-ready) |
| Structured logging | JSON lines via `services/logger.ts` |
| Migrations | 4 SQL files ready for `supabase db push` |
| CI | `.github/workflows/ci.yml` ready |

### 🟠 What you still need to do (can't be done without your credentials)

1. Create accounts (Supabase, Vercel, Render, World developer portal, Google AI Studio).
2. Generate 3 separate wallets.
3. Deploy the smart contract.
4. Install the RAG on the Raspberry Pi and expose it.
5. Wire env vars and deploy.

Step-by-step in [§ Production deployment](#production-deployment--4-pieces) below.

---

## Quick start (local dev)

Three terminals:

```bash
# Terminal 1 — RAG engine
cd packages/rag
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # fill GEMINI_API_KEY + SUPABASE_*
python main.py                # :8000

# Terminal 2 — Hono x402 gateway
cd packages/server
npm install
cp .env.example .env          # fill DEMO_MODE=true for local
npm run dev                   # :3001

# Terminal 3 — Next.js web
npm install
cp .env.example .env.local    # fill NEXT_PUBLIC_DEMO_MODE=true for local
npm run dev                   # :3000
```

For local you can set `DEMO_MODE=true` and skip most configuration. For production see below.

---

## Production deployment — 4 pieces

### 1. 📱 World App (Next.js frontend)

**Host:** Vercel.

**Prerequisites:**
- Create the app at [developer.world.org](https://developer.world.org) in **Production** mode.
- Add an action named `verify-author` under that app.
- Copy the App ID (`app_xxxx…`) and the Action ID.
- Generate a signing key; save both key and RP ID (used by the server, not here).

**Steps:**
```bash
# Push repo to GitHub, connect to Vercel
vercel link
vercel env add NEXT_PUBLIC_WORLD_APP_ID production
vercel env add NEXT_PUBLIC_WORLD_ACTION_ID production
vercel env add NEXT_PUBLIC_SERVER_URL production           # https://your-hono.onrender.com
vercel env add NEXT_PUBLIC_PAY_TO_ADDRESS production       # default recipient
vercel env add NEXT_PUBLIC_PAPER_REGISTRY_ADDRESS production  # after step 2
vercel env add NEXT_PUBLIC_DEMO_MODE production             # false
vercel --prod
```

**Verify:** Open the Vercel URL inside the World App. You should see `/upload` detect your wallet automatically (no "Manual Fallback" prompt unless `DEMO_MODE=true`).

---

### 2. ⛓️ Smart contract (`PaperRegistry`)

**Host:** World Chain (mainnet 480 or Sepolia 4801).

**Prerequisites:**
- Deployer wallet with ≈ 0.01 ETH on World Chain.
- Foundry installed (`curl -L https://foundry.paradigm.xyz | bash && foundryup`).

**Steps:**
```bash
cd packages/contracts
forge install                     # forge-std should already be there
forge test                        # sanity — all tests pass
export DEPLOYER_KEY=0x…           # your deployer private key

# Testnet first (Sepolia)
forge script script/Deploy.s.sol \
  --rpc-url world_chain_testnet \
  --broadcast \
  --private-key $DEPLOYER_KEY

# Once verified on https://worldchain-sepolia.explorer.alchemy.com, go mainnet
forge script script/Deploy.s.sol \
  --rpc-url world_chain_mainnet \
  --broadcast \
  --private-key $DEPLOYER_KEY
```

**Output:** the script logs the deployed address. **Save it.**

**Important:** the deployer wallet becomes the contract `owner`. Only `owner` can call `recordAccess`. Set `RECORDER_PRIVATE_KEY` (server env) to the **same wallet** — or transfer ownership via a new function you add. For MVP, just reuse the deployer key as recorder.

**Verify:**
```bash
cast code $CONTRACT_ADDRESS --rpc-url https://rpc.worldchain.dev
# Should return bytecode, not 0x.
```

Put the address in:
- `packages/server/.env` → `PAPER_REGISTRY_ADDRESS`
- Vercel → `NEXT_PUBLIC_PAPER_REGISTRY_ADDRESS`

---

### 3. 🛰️ x402 gateway server + Supabase

**Host:** Render, Fly.io, or Railway (needs Node 20+ and an open TCP port).

**Prerequisites:**
- [Supabase](https://supabase.com) project (free tier is fine to start).
- [Supabase CLI](https://supabase.com/docs/guides/cli) installed.

**Step 3.1 — Supabase schema:**
```bash
# From repo root
supabase link --project-ref <your-ref>         # dashboard → settings → reference id
supabase db push                                # applies supabase/migrations/*
```
Then in the Supabase Dashboard → Database → Extensions: **enable `vector`** (pgvector).

Get keys from Supabase Dashboard → Settings → API:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` ← **this one, not anon, for server-side**

**Step 3.2 — Generate shared tokens:**
```bash
openssl rand -hex 32       # → RAG_INTERNAL_TOKEN
openssl rand -hex 32       # → DEBUG_LOG_TOKEN
```

**Step 3.3 — Deploy the Hono server:**

On Render (example):
```
Root dir:       packages/server
Build command:  npm install && npm run build
Start command:  npm start
Node:           20
```

Env vars to configure (from `packages/server/.env.example`):

```bash
NODE_ENV=production
DEMO_MODE=false
PORT=3001

PAY_TO_ADDRESS=0x…                    # global fallback payee
PAY_TO_ADDRESS_SOLANA=…                # optional for Solana payments

WORLD_CHAIN_RPC=https://rpc.worldchain.dev
PAPER_REGISTRY_ADDRESS=0x…             # from step 2
RECORDER_PRIVATE_KEY=0x…               # same as deployer for MVP

WORLD_APP_ID=app_…
WORLD_ACTION_ID=verify-author
WORLD_ID_RP_ID=…                       # from developer.world.org
WORLD_ID_SIGNING_KEY=…

RAG_SERVICE_URL=https://your-pi-tunnel.trycloudflare.com
RAG_INTERNAL_TOKEN=<from openssl>

SUPABASE_URL=…
SUPABASE_SERVICE_ROLE_KEY=…

DEBUG_LOG_TOKEN=<from openssl>
RATE_LIMIT_RPM=20
```

The server will **refuse to start** in production if `PAY_TO_ADDRESS`, `WORLD_APP_ID`, `PAPER_REGISTRY_ADDRESS`, `SUPABASE_URL`, or `SUPABASE_SERVICE_ROLE_KEY` are missing. That's a feature.

**Verify:**
```bash
curl https://your-hono.onrender.com/health
# {"status":"ok","service":"scigate-server","version":"2.1.0","env":"production","demo":false}
```

---

### 4. 🍓 RAG agent (Raspberry Pi)

**Host:** Raspberry Pi 4/5 (or any Linux box, even a VPS).

**Prerequisites:**
- Python 3.11+.
- [Gemini API key](https://aistudio.google.com/apikey) (free tier).
- Cloudflare Tunnel, Tailscale Funnel, or ngrok for exposing the Pi to the gateway.

**Step 4.1 — Install:**
```bash
# On the Pi
git clone <your-repo> && cd scigate/packages/rag
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Fill `packages/rag/.env`:
```bash
PORT=8000
GEMINI_API_KEY=…                        # from Google AI Studio
SUPABASE_URL=…                          # same as server
SUPABASE_SERVICE_ROLE_KEY=…             # same as server
WORLD_CHAIN_RPC=https://rpc.worldchain.dev
PAY_TO_ADDRESS=…                        # same default payee as server
SCIGATE_API_URL=https://your-hono.onrender.com  # the public Hono URL

# Internal token — MUST match the server's
RAG_INTERNAL_TOKEN=<same value as server>

# Optional: agent buyer (autonomous cross-paper purchases)
RAG_AGENT_PRIVATE_KEY=                  # hot wallet with small balance
RAG_AGENT_SOLANA_KEY=                   # base58 Solana key, optional
```

**Step 4.2 — Run:**
```bash
python main.py              # dev
# OR for auto-restart:
pip install gunicorn
gunicorn main:app -w 2 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

**Step 4.3 — Expose to the server (Cloudflare Tunnel, simplest):**
```bash
# On the Pi
brew install cloudflared   # or apt install
cloudflared tunnel --url http://localhost:8000
# → prints https://abc-def.trycloudflare.com
```
Copy that URL into the server env var `RAG_SERVICE_URL` and redeploy.

**Alternatives:** `tailscale serve https / http://localhost:8000`, or `ngrok http 8000` (URL changes on free plan).

**Verify:**
```bash
curl https://your-pi-tunnel.trycloudflare.com/health
# {"status":"ok","service":"scigate-rag","version":"2.0.0"}

# Protected endpoint requires the token
curl -X POST https://your-pi-tunnel.trycloudflare.com/query \
  -H "x-internal-token: $RAG_INTERNAL_TOKEN" \
  -H "content-type: application/json" \
  -d '{"paper_id":"0x…","question":"What does this paper claim?"}'
```

---

## Environment variables reference

Three `.env` files — one per service. See the `.env.example` next to each.

### Root `.env.local` (Next.js, Vercel)

| Var | Required? | Notes |
|---|---|---|
| `NEXT_PUBLIC_DEMO_MODE` | yes | `false` in production |
| `NEXT_PUBLIC_SERVER_URL` | yes | Public URL of the Hono gateway |
| `NEXT_PUBLIC_RAG_URL` | optional | Only if the frontend uploads PDFs directly |
| `NEXT_PUBLIC_WORLD_APP_ID` | yes | `app_…` from developer.world.org |
| `NEXT_PUBLIC_WORLD_ACTION_ID` | yes | Default `verify-author` |
| `NEXT_PUBLIC_PAY_TO_ADDRESS` | yes | Global fallback recipient |
| `NEXT_PUBLIC_PAPER_REGISTRY_ADDRESS` | yes | From contract deploy; upload refuses without it |
| `NEXT_PUBLIC_ALLOWED_DEV_ORIGINS` | optional | Comma-separated ngrok hostnames |

### `packages/server/.env`

| Var | Required? | Notes |
|---|---|---|
| `DEMO_MODE` | yes | `false` in prod; `true` for local dev |
| `NODE_ENV` | yes | `production` in prod |
| `PORT` | no | Defaults to `3001` |
| `PAY_TO_ADDRESS` | **prod** | Global fallback payee |
| `PAY_TO_ADDRESS_SOLANA` | optional | For Solana payments |
| `WORLD_CHAIN_RPC` | no | Override if using Alchemy key |
| `PAPER_REGISTRY_ADDRESS` | **prod** | Contract address |
| `RECORDER_PRIVATE_KEY` | **prod** | Same wallet as contract deployer |
| `WORLD_APP_ID` | **prod** | Must match frontend |
| `WORLD_ACTION_ID` | no | Defaults to `verify-author` |
| `WORLD_ID_RP_ID` | **prod** | From developer.world.org |
| `WORLD_ID_SIGNING_KEY` | **prod** | From developer.world.org |
| `RAG_SERVICE_URL` | **prod** | Public URL of the Pi tunnel |
| `RAG_INTERNAL_TOKEN` | **prod** | Shared with RAG |
| `SUPABASE_URL` | **prod** | From Supabase dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | **prod** | Service role, NOT anon |
| `DEBUG_LOG_TOKEN` | optional | If empty, `/debug/log` returns 404 |
| `RATE_LIMIT_RPM` | no | Defaults to 20 |

### `packages/rag/.env`

| Var | Required? | Notes |
|---|---|---|
| `PORT` | no | Defaults to `8000` |
| `GEMINI_API_KEY` | yes | From aistudio.google.com |
| `SUPABASE_URL` | yes | Same as server |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Same as server |
| `WORLD_CHAIN_RPC` | no | For agent buyer |
| `PAY_TO_ADDRESS` | yes | Default payee |
| `SCIGATE_API_URL` | yes | Public URL of the Hono gateway |
| `RAG_INTERNAL_TOKEN` | yes | **Must** match the server's value |
| `RAG_AGENT_PRIVATE_KEY` | optional | Only for autonomous agent buyer |
| `RAG_AGENT_SOLANA_KEY` | optional | Base58 format |

---

## Suggested 1-day bring-up order

| Time | Task |
|---|---|
| 1h | Supabase: create project, enable pgvector, `supabase db push` |
| 1h | Generate 3 wallets, fund the deployer (0.01 ETH) and recorder (0.001 ETH) |
| 30m | `forge script` deploy on Sepolia 4801 → verify bytecode |
| 30m | `forge script` deploy on mainnet 480 → save address |
| 1h | World ID production app + action `verify-author` + RP signing key |
| 30m | Gemini API key → fill `packages/rag/.env` |
| 1h | On the Pi: clone, venv, `pip install`, `python main.py` |
| 30m | Cloudflare Tunnel → get `https://…trycloudflare.com` |
| 1h | Hono server to Render with all env vars |
| 30m | Vercel: deploy Next.js with public env vars |
| 1h | Run the [validation checklist](#post-deploy-validation) |

**~7h of work**, assuming no account-creation friction.

---

## Known footguns

1. **World Chain public RPC rate-limits.** If on-chain verification starts returning errors under load, switch `WORLD_CHAIN_RPC` to an Alchemy-Worldchain URL with API key.

2. **`recordAccess` requires `onlyOwner`.** The contract's `owner` is the deployer wallet. Set `RECORDER_PRIVATE_KEY` to that same wallet (simplest) or add a `setRecorder()` function and transfer. Mismatch → every paid access silently enqueues to `pending_records` forever.

3. **`match_chunks` vector dim is 768** (Gemini `embedding-001`). If you change the embedding model to a different dimension, you must re-run migrations and re-embed everything.

4. **x402 facilitator is third-party.** `https://x402-worldchain.vercel.app/facilitator` is a community deployment. Our direct viem verification **does not depend on it** for verifying a tx hash you already have — but building the 402 challenge references it. If it goes down, clients can still pay; they just won't auto-negotiate. Consider mirroring.

5. **Uploads are synchronous.** A 100-page PDF can block the RAG worker 30s (parse + chunk + N embeddings + insert). Fine for hackathon; add a worker queue before scaling.

6. **`pending_records` has no auto-drain.** If `recordAccess` fails (gas spike, RPC hiccup, missing key), rows pile up. There's no cron yet. Either drain manually or ask to have `scripts/drain-pending.ts` added.

7. **`NEXT_PUBLIC_*` variables leak to the browser bundle.** Don't put secrets there. Addresses and App IDs are fine (public by design).

8. **ChromaDB is not used anymore.** All vectors live in Supabase pgvector. The `packages/rag/chroma_db/` folder, if it exists on your Pi, is safe to delete.

9. **Supabase ANON vs SERVICE_ROLE.** The server will work with anon but prints a big warning and cannot bypass RLS for writes. Always use `SUPABASE_SERVICE_ROLE_KEY` server-side.

10. **CORS in production** uses the request's `Origin` (effectively open). Tighten to specific origins if threat model requires.

---

## Commands cheat sheet

```bash
# ── Typecheck everything ────────────────────────────────────────
npm run typecheck                              # web
cd packages/server && npx tsc --noEmit         # server

# ── Run tests ──────────────────────────────────────────────────
cd packages/contracts && forge test
cd packages/rag && python -c "from services import chunker, pdf_parser; print('ok')"

# ── Lint ────────────────────────────────────────────────────────
npm run lint                                   # next lint (root)

# ── Supabase ────────────────────────────────────────────────────
supabase db push                               # apply migrations
supabase db diff                               # show drift
supabase functions deploy <name>               # if you add Edge Functions

# ── Contracts ──────────────────────────────────────────────────
cd packages/contracts
forge build
forge test -vvv
forge script script/Deploy.s.sol --rpc-url world_chain_testnet --broadcast --private-key $DEPLOYER_KEY

# ── Read contract state from CLI ───────────────────────────────
cast call $CONTRACT "getPaperStats(bytes32)" 0xHASH --rpc-url https://rpc.worldchain.dev

# ── Local dev ──────────────────────────────────────────────────
# Terminal 1:  cd packages/rag && source venv/bin/activate && python main.py
# Terminal 2:  cd packages/server && npm run dev
# Terminal 3:  npm run dev
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `/health` returns `"demo":true` in prod | `DEMO_MODE=true` leaked into env | Set `DEMO_MODE=false`; server won't start otherwise |
| Upload → "PaperRegistry contract address not configured" | `NEXT_PUBLIC_PAPER_REGISTRY_ADDRESS` empty | Set it in Vercel from step 2 |
| Pay flow stuck at "HANDSHAKING…" | 402 header not parsed | Check browser console; server sends JSON plain, client falls back to body |
| `/papers/:id/query` → 402 even after paying | Tx hash not confirmed yet, or wrong payee | Wait a block; check `resolvePaymentTarget` returns the author recorded in the contract |
| RAG 401 on `/query` | `RAG_INTERNAL_TOKEN` mismatch | Set the same value in server AND rag .env files |
| Supabase insert fails silently | Using anon key server-side | Switch to `SUPABASE_SERVICE_ROLE_KEY` |
| `pending_records` growing | `RECORDER_PRIVATE_KEY` empty, wrong wallet, or out of gas | Fund the recorder or set it to the deployer wallet |
| Dashboard shows 0 earnings after real query | `recordAccess` failing; check server logs | Verify recorder is contract `owner`; check queue |
| Gemini 429 errors | Free-tier quota | Upgrade plan or add exponential backoff in `embedder.py` |
| "vector does not exist" in Supabase | pgvector not enabled | Dashboard → Database → Extensions → enable `vector` |

---

## Post-deploy validation

Run through this before announcing launch:

- [ ] `GET /health` returns `"env":"production","demo":false`.
- [ ] `POST /papers/:id/query` with no headers → `402` with correct `accepts[0].payTo`.
- [ ] `POST /papers/:id/query` with `x-payment-proof: demo_bypass` → `402` (because `DEMO_MODE=false`).
- [ ] `POST /papers/:id/query` with a bogus tx hash `0x000…` → `402`.
- [ ] `POST /papers/:id/query` with a real tx hash → `200`, and within a few blocks `cast call $CONTRACT "getPaperStats(bytes32)" 0xHASH` shows `totalAccesses += 1`.
- [ ] `POST /api/verify` with a garbage proof → `400` (not simulated success).
- [ ] `POST /debug/log` without token → `401` (or `404` if `DEBUG_LOG_TOKEN` is empty).
- [ ] `SELECT count(*) FROM pending_records WHERE resolved_at IS NULL` stays near zero. If it grows, the recorder has a problem.
- [ ] `SELECT sum(count) FROM usage_trials` survives a server restart (persisted, not memory).
- [ ] Upload a PDF in `/upload`. Address in the resulting Worldscan tx matches `PAPER_REGISTRY_ADDRESS`.
- [ ] `/explore` search returns real results (not empty) for common terms.
- [ ] Dashboard for a real wallet shows earnings matching on-chain stats. No amber "demo data" banner.

---

## Further reading

- `DEPLOY.md` — extended production runbook with the validation checklist.
- `CLAUDE.md` — architectural guide written for Claude Code sessions.
- `supabase/README.md` — schema and RPC documentation.
- `packages/contracts/src/PaperRegistry.sol` — on-chain source of truth.

---

## License

MIT. Built for the World Build 3 Hackathon, April 2026.
