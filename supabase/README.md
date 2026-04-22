# Supabase schema

Migrations for the SciGate backend. Apply them in order with the Supabase CLI:

```bash
# install the CLI once
brew install supabase/tap/supabase

# link to your project
supabase link --project-ref <your-ref>

# push migrations
supabase db push
```

## Tables

| Table              | Purpose                                                          |
|--------------------|------------------------------------------------------------------|
| `papers`           | Paper metadata cache (id, title, author wallet, prices, active). |
| `chunks`           | Vector store — Gemini 768-dim embeddings for RAG retrieval.      |
| `usage_trials`     | Free-trial counter per user × kind (persistent across restarts). |
| `pending_records`  | Queue of `recordAccess` calls to retry on-chain.                 |

## RPCs

| RPC                  | Purpose                                                      |
|----------------------|--------------------------------------------------------------|
| `match_chunks`       | Vector similarity search. `p_paper_id = NULL` → global.      |
| `increment_trial`    | Atomic increment of the free-trial counter.                  |

## Requirements

- `vector` extension (pgvector) enabled on the project.
- Server code uses `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS). Never expose the service role key to the browser.
