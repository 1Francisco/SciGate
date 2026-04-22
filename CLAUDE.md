# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: SciGate

Decentralized academic-paper platform where every AI/human RAG query pays the author in USDC via the x402 protocol. Built for the World Build 3 Hackathon (April 2026) and being hardened toward production.

The `package.json` name is `scigate`.

## Three-service architecture

```
Next.js web (3000) ──calls── Hono x402 gateway (3001) ──calls── Python FastAPI RAG (8000)
      │                               │                                      │
  MiniKit + wagmi            @x402/hono + viem                       Supabase pgvector
  World ID verify             trial/RLS/Supabase                      PyMuPDF + Gemini
                              PaperRegistry.sol (World Chain 480)
```

1. **`app/` (Next.js 14 App Router, :3000)** — UI. The frontend talks directly to `NEXT_PUBLIC_SERVER_URL`; the few `app/api/*` routes that remain (`/api/verify`) exist only because they need server-side secrets.
2. **`packages/server/` (Hono + `tsx watch`, :3001)** — the x402 tollbooth. A single `paymentMiddleware` in `src/index.ts` enforces all gating: demo bypass (gated by `DEMO_MODE`), verified on-chain payment, persistent free trial, or 402 challenge. Post-pago, llama `recordAccess` on-chain en segundo plano.
3. **`packages/rag/` (FastAPI, :8000)** — PDF ingest + semantic search + Gemini QA. `POST /query`, `GET /sections`, `POST /ask-agent` están protegidos por `RAG_INTERNAL_TOKEN` (sólo el Hono los llama). `/upload` y `/search` son públicos.
4. **`packages/contracts/` (Foundry, Solidity 0.8.24)** — `PaperRegistry.sol` guarda metadata + analytics (`totalEarnings`, `totalAccesses`). Pagos fluyen off-chain por x402; `recordAccess` se llama por el Hono server con `RECORDER_PRIVATE_KEY`.
5. **`supabase/migrations/`** — schema versionado. Tablas: `papers`, `chunks` (pgvector), `usage_trials`, `pending_records`. RPCs: `match_chunks` (`p_paper_id=NULL` → global), `increment_trial`.

## Payment flow — cómo gating realmente funciona hoy

`packages/server/src/index.ts` declara `paymentMiddleware`. En cada request a una ruta de pago (query/section/citations/full/data/agent):

1. **Demo bypass** — sólo si `DEMO_MODE=true` y el header `x-payment-proof` vale `demo_bypass` o `bypass`. No hay heurísticas de "longitud mayor a 5".
2. **Verificación on-chain real** — si llega un tx hash (`0x…` 66 chars), se comprueba en World Chain con viem que la transacción hizo `transfer(USDC, payTo, ≥amount)`. Con replay cache en memoria. Si pasa, llama `recordAccess` en background y deja pasar la request.
3. **Free trial persistido** — `incrementTrial(userId, kind)` en Supabase retorna el nuevo conteo. Con `FREE_TRIAL_QUERY=3` o `FREE_TRIAL_FULL=1`. Si el conteo ≤ límite, pasa.
4. **402 challenge** — con `accepts` para World Chain y Solana. El payee viene de on-chain (`getPaperFromChain`) primero, Supabase después, fallback global al final.

`DEMO_MODE=true` con `NODE_ENV=production` → el server hace `process.exit(1)` al arrancar.

## Virtual "agent" papers

IDs `agent-query`, `agent-full` y `agent` no son papers reales. Se manejan en `routes/papers.ts` → `/papers/:id/metadata` con metadata sintética. `POST /agent/{query,full}` proxy stream SSE a `/ask-agent` del RAG (`packages/rag/main.py`).

## Commands

### Frontend (root)
```bash
npm install
npm run dev          # Next on :3000
npm run build
npm run lint
npm run typecheck
```

### Hono server
```bash
cd packages/server
npm install
npm run dev          # tsx watch on :3001
npm run build        # tsc
npx tsc --noEmit     # typecheck
```

### RAG engine
```bash
cd packages/rag
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python main.py       # uvicorn :8000
```

### Contracts
```bash
cd packages/contracts
forge build
forge test
```

### Supabase schema
```bash
supabase link --project-ref <ref>
supabase db push     # applies supabase/migrations/*
```

## Environment variables (tres `.env`)

- **Root `.env.local`** (Next.js) — ver `.env.example`. Importante: `NEXT_PUBLIC_DEMO_MODE` (no por defecto `true`), `NEXT_PUBLIC_PAPER_REGISTRY_ADDRESS` (hoy requerido para que `upload` no explote).
- **`packages/server/.env`** — ver `packages/server/.env.example`. Críticos: `DEMO_MODE`, `PAY_TO_ADDRESS`, `WORLD_APP_ID`, `PAPER_REGISTRY_ADDRESS`, `RECORDER_PRIVATE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RAG_INTERNAL_TOKEN`, `DEBUG_LOG_TOKEN`.
- **`packages/rag/.env`** — ver `packages/rag/.env.example`. Críticos: `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RAG_INTERNAL_TOKEN`. Opcionales para modo agente: `RAG_AGENT_PRIVATE_KEY`, `RAG_AGENT_SOLANA_KEY`.

Fail-fast: en `NODE_ENV=production` el server hace `process.exit(1)` si falta `PAY_TO_ADDRESS`, `WORLD_APP_ID`, `PAPER_REGISTRY_ADDRESS`, `SUPABASE_URL`, o `SUPABASE_SERVICE_ROLE_KEY`.

## Convenciones críticas

- **`paper_id = "0x" + sha256(pdf_bytes)`**. Mismo valor que `contentHash` en `PaperRegistry.sol`. Calculado en `packages/rag/main.py` al hacer upload.
- **Solana network ID**: `solana:5eykt4UsFv8P8NJdTREpY1vzqAQZSSfL`. **Debe** coincidir entre `packages/server/src/config.ts:SOLANA` y `packages/rag/services/x402_handler.py`. Si cambias uno, cambia el otro.
- **Root alias `@/*`** → repo root (para Next). El `tsconfig.json` raíz **excluye** `packages/` — cada package tiene su propio tsconfig.
- **Server → RAG** siempre mete el header `x-internal-token` (valor `RAG_INTERNAL_TOKEN`) para llamadas que no sean `/upload` o `/search`.
- **Precios en config** como strings USD (`'$0.01'`); el `registerMoneyParser` de `ExactEvmScheme` los convierte a atomic units USDC (6 decimales) en runtime.
- **Supabase en el server usa SERVICE_ROLE**, nunca ANON. El cliente Supabase emite un warning si detecta ANON en server-side.

## Hot spots conocidos (abril 2026)

- **Contrato `PaperRegistry` no desplegado en mainnet 480** según `packages/contracts/broadcast/Deploy.s.sol/480/run-latest.json` (hash=null, receipts=[]). El frontend ya no cae a la dirección fantasma `0x497f0a…`; ahora exige `NEXT_PUBLIC_PAPER_REGISTRY_ADDRESS` válido o rechaza el publish. **Sepolia 4801 puede tener deploys** — verifica antes de prometer mainnet.
- **`x402` facilitator es de terceros** (`x402-worldchain.vercel.app`). Single point of failure para la verificación cross-chain. Considera mirror propio.
- **Replay cache en memoria** (`services/payment.ts`). Mueve a Supabase (tabla `used_tx_hashes`) antes de tener múltiples instancias.
- **Rate limiter en memoria** (`services/rateLimit.ts`). Lo mismo: Redis/Upstash si escalas.
