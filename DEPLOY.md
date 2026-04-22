# SciGate — Production deployment checklist

Esto es el runbook mínimo para salir a producción. Divide en cosas que **yo pude dejar listas en código** y cosas que **requieren acciones externas tuyas** (credenciales, servicios terceros, claves).

---

## ✅ Lo que el repo ya trae resuelto

| Área | Estado |
|---|---|
| Higiene del repo | `.gitignore` restaurado, binarios removidos del index. |
| Versiones dependencias | `package.json` con versiones reales; `name="scigate"`, `license=MIT`. |
| Env examples | `.env.example` consistentes en raíz, `packages/server/`, `packages/rag/`. |
| Bypasses consolidados | Todos detrás de `DEMO_MODE=true`. `NODE_ENV=production + DEMO_MODE=true` → `process.exit(1)`. |
| Trial persistente | Supabase `usage_trials` + RPC `increment_trial`. |
| Verificación tx USDC | `services/payment.ts` con viem + replay cache. |
| `recordAccess` on-chain | Post-pago, en background, con cola `pending_records` si falla. |
| Encoding 402 | Header `PAYMENT-REQUIRED` JSON plano; cliente parsea JSON o body. |
| Solana network ID | Unificado entre `config.ts` y `x402_handler.py`. |
| Registry address | Frontend rechaza publicar sin `NEXT_PUBLIC_PAPER_REGISTRY_ADDRESS` válido. |
| UI Manual Fallback | Sólo visible con `NEXT_PUBLIC_DEMO_MODE=true`. |
| Dashboard demo-data | Banner amber prominente + botón "Use demo data" sólo en demo. |
| `/debug/log` | Requiere `Authorization: Bearer ${DEBUG_LOG_TOKEN}`. |
| RAG interno | Endpoints `/query`, `/sections`, `/ask-agent` protegidos por `RAG_INTERNAL_TOKEN`. |
| Migraciones Supabase | `supabase/migrations/` — init, match_chunks, increment_trial, RLS. |
| search_all global | `p_paper_id=NULL` funciona (RPC actualizada). |
| N+1 en /papers/search | Delegado a RAG; snippet ya viene en el resultado. |
| RAG fixes | Drift de offsets corregido, ordering `chunk_index`, fallback random eliminado, `response.text` con try/except, agent buyer lazy import. |
| Rate limiter | `services/rateLimit.ts`, 20 rpm por IP. |
| Logger estructurado | `services/logger.ts`, JSON lines. |
| CI | `.github/workflows/ci.yml` — typecheck web, typecheck server, smoke RAG, forge test. |

---

## 🟠 Lo que NECESITAS hacer antes de producción

### 1. Deploy del contrato on-chain

```bash
cd packages/contracts
export DEPLOYER_KEY=0x…
# Testnet primero
forge script script/Deploy.s.sol --rpc-url world_chain_testnet --broadcast --private-key $DEPLOYER_KEY
# Cuando esté verificado, mainnet
forge script script/Deploy.s.sol --rpc-url world_chain_mainnet --broadcast --private-key $DEPLOYER_KEY
```

Guarda la dirección resultante y ponla en:
- `packages/server/.env` → `PAPER_REGISTRY_ADDRESS`
- Vercel env vars → `NEXT_PUBLIC_PAPER_REGISTRY_ADDRESS`

Verifica en Worldscan que el bytecode está publicado (el broadcast anterior en el repo tiene `receipt: []` → **no está desplegado hoy**).

### 2. Crear proyecto Supabase y aplicar migraciones

```bash
supabase init                       # dentro del repo, si nunca se inicializó
supabase link --project-ref <ref>   # desde el dashboard
supabase db push                    # aplica supabase/migrations/
```

Habilita la extensión `pgvector` en Dashboard → Database → Extensions.

Ajusta las dimensiones del vector si cambias de modelo de embeddings (hoy 768 = Gemini `embedding-001`).

### 3. Wallets (tres roles distintos)

| Rol | Dónde | Qué hace | Recomendación |
|---|---|---|---|
| **Deployer** | Local durante deploy del contrato | Crea el contrato | Cold wallet, sólo se usa una vez. |
| **Recorder** | `RECORDER_PRIVATE_KEY` en server | Llama `recordAccess` post-pago | Hot wallet, tope bajo de ETH. Rotación periódica. |
| **Receiver** | `PAY_TO_ADDRESS` global + autores | Recibe USDC de pagos | Mejor un **Safe multisig** cuando haya revenue real. |
| **RAG agent buyer** | `RAG_AGENT_PRIVATE_KEY` en RAG | Firma pagos x402 cuando el agente compra contexto | Hot wallet con presupuesto limitado. Opcional. |

**Nunca** pongas los dos roles en la misma wallet.

### 4. World ID production

1. En [developer.world.org](https://developer.world.org), crea un App en modo **Production** (no Staging).
2. Crea el action `verify-author`.
3. Genera el `signing_key` y pon:
   - `WORLD_APP_ID` en server y frontend (mismo valor).
   - `WORLD_ID_SIGNING_KEY` en server.
   - `WORLD_ID_RP_ID` en server.
4. Elimina cualquier rastro de `app_aacdf4487837b144901774135e3b0803` — ese era el valor default de demo.

### 5. Tokens compartidos

Genera y configura (cualquier random fuerte, mínimo 32 caracteres):

```bash
openssl rand -hex 32
```

- `RAG_INTERNAL_TOKEN` — mismo valor en `packages/server/.env` y `packages/rag/.env`.
- `DEBUG_LOG_TOKEN` — sólo en `packages/server/.env`. Si lo dejas vacío, `/debug/log` responde 404.

### 6. Key management

Para el hackathon `.env` plano está bien. Para producción, mueve al menos:
- `RECORDER_PRIVATE_KEY`
- `RAG_AGENT_PRIVATE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WORLD_ID_SIGNING_KEY`

a un vault:
- **Vercel/Render**: env vars del dashboard (no commitees `.env`).
- **Mejor aún**: Doppler, AWS Secrets Manager, 1Password CLI.

### 7. Hosting sugerido

| Servicio | Host | Notas |
|---|---|---|
| Next.js web | Vercel | Auto-detecta Next 16. |
| Hono server | Render / Fly.io / Railway | `npm run start`. Requiere puerto expuesto. |
| RAG FastAPI | Render / Fly.io / Raspberry Pi | Requiere `pgvector` accesible desde Supabase. |
| Supabase | supabase.com | Free tier aguanta hackathon; Pro para producción. |

### 8. Observabilidad

- Añade **Sentry** SDK a Next y Hono (`@sentry/nextjs`, `@sentry/node`). Opcional pero recomendado.
- El logger actual (`services/logger.ts`) escribe JSON a stdout — compatible con Render/Vercel log aggregation.
- Para métricas custom (earnings/accesses por día), queries directas a Supabase o dashboard en Grafana Cloud.

### 9. Validación post-deploy

Ejecuta este checklist **antes** de anunciar el launch:

- [ ] `GET /health` del server devuelve `"env":"production","demo":false`.
- [ ] `POST /papers/:id/query` sin header → 402 con `accepts[0].payTo` correcto.
- [ ] `POST /papers/:id/query` con header `x-payment-proof: demo_bypass` → **401** (porque `DEMO_MODE=false`).
- [ ] `POST /papers/:id/query` con un tx hash inventado → 402.
- [ ] Query real con tx válido → 200 y en pocos segundos `getPaperStats(contentHash)` muestra `totalAccesses += 1`.
- [ ] `POST /api/verify` con proof falso → 400 (no simula éxito).
- [ ] `POST /debug/log` sin token → 401 (o 404 si `DEBUG_LOG_TOKEN` vacío).
- [ ] `SELECT count(*) FROM pending_records WHERE resolved_at IS NULL` en Supabase cada hora — si crece, el recorder wallet tiene problema (sin ETH, RPC caído, etc.).
- [ ] `SELECT sum(count) FROM usage_trials` — el free trial está actualmente siendo usado, no reset por restart.

### 10. Qué queda fuera de este release (por si levantas dinero)

- Worker async para el upload de PDFs (hoy es síncrono en FastAPI).
- Reconciliación on-chain ↔ Supabase (cron que detecta divergencias).
- Facilitator x402 propio (hoy dependes de vercel community).
- KMS serio para keys (hoy `.env`).
- i18n (hoy hay Spanglish).
- Sentry + dashboards.
- Monorepo con pnpm/Turbo (hoy cada package instala por separado).

---

## Cronograma realista

Con 1-2 ingenieros full-time, desde el estado actual del repo:

| Hito | Tiempo |
|---|---|
| Items 1-6 de arriba (deploy + credenciales) | 1-2 días |
| Item 7 (hosting setup) | 1 día |
| Item 8 (Sentry + dashboards) | 1 día |
| Item 9 (validación) | 1 día |
| **Launch mínimo** | **~1 semana** |
| Items de la sección 10 | 2-4 semanas adicionales |
