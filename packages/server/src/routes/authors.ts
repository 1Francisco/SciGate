import { Hono } from 'hono';
import { WORLD_APP_ID, WORLD_ACTION_ID, DEMO_MODE } from '../config.js';
import { getAuthorPapersFromChain, getPaperFromChain } from '../services/contract.js';
import { savePaperMetadata, getPapersByAuthor } from '../services/supabase.js';

const authors = new Hono();

/**
 * Registers an author by verifying their World ID proof against the official API.
 * In production, a failed verification is a hard error — no silent bypass.
 * When DEMO_MODE=true a simulated success is returned for easier demos.
 */
authors.post('/register', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { wallet_address, world_id_proof, paper_hash, price_query, price_full } = body;

  if (!wallet_address || !world_id_proof) {
    return c.json({ error: 'wallet_address and world_id_proof are required' }, 400);
  }

  // Save metadata early so the frontend sees the paper even if WorldID
  // verification takes time. If verification fails later the row stays
  // marked as unverified via RLS policies (future work).
  if (paper_hash) {
    try {
      await savePaperMetadata({
        id: paper_hash,
        title: body.title ?? 'Uploaded Paper',
        author: wallet_address.toLowerCase(),
        price_query: Number(price_query ?? 0.01),
        price_full: Number(price_full ?? 0.1),
      });
    } catch (err) {
      console.warn('[authors] savePaperMetadata failed:', err);
    }
  }

  const { merkle_root, nullifier_hash, proof, verification_level } = world_id_proof;

  if (!WORLD_APP_ID) {
    if (DEMO_MODE) {
      return c.json({
        success: true,
        demo: true,
        author: {
          wallet_address,
          nullifier_hash: `demo_${Date.now()}`,
          verified: true,
          verification_level: 'device',
        },
      });
    }
    return c.json({ error: 'WORLD_APP_ID not configured' }, 500);
  }

  const verifyRes = await fetch(
    `https://developer.world.org/api/v4/verify/${WORLD_APP_ID}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nullifier_hash,
        merkle_root,
        proof,
        verification_level,
        action: WORLD_ACTION_ID,
        signal: wallet_address.toLowerCase(),
      }),
    }
  );

  if (!verifyRes.ok) {
    const errBody = await verifyRes.json().catch(() => ({}));
    if (DEMO_MODE) {
      console.warn('[authors][demo] World ID rejected but DEMO_MODE=true → returning simulated success');
      return c.json({
        success: true,
        demo: true,
        author: {
          wallet_address,
          nullifier_hash: `demo_${Date.now()}`,
          verified: true,
          verification_level: 'device',
        },
      });
    }
    return c.json(
      {
        error: 'World ID verification failed',
        code: (errBody as any).code,
        detail: errBody,
      },
      400
    );
  }

  const verifyData = (await verifyRes.json()) as {
    success: boolean;
    nullifier_hash: string;
  };

  return c.json({
    success: true,
    author: {
      wallet_address,
      nullifier_hash: verifyData.nullifier_hash,
      verified: true,
      verification_level,
      registered_at: new Date().toISOString(),
    },
  });
});

// ── GET /authors/:address/papers ──────────────────────────────
authors.get('/:address/papers', async (c) => {
  const address = c.req.param('address') as `0x${string}`;

  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return c.json({ error: 'Invalid Ethereum address' }, 400);
  }

  // On-chain papers
  let blockchainResults: any[] = [];
  try {
    const paperHashes = await getAuthorPapersFromChain(address);
    const papers = await Promise.allSettled(paperHashes.map((h) => getPaperFromChain(h)));
    blockchainResults = papers
      .map((r, i) => ({
        contentHash: paperHashes[i],
        ...(r.status === 'fulfilled' && r.value ? r.value : {}),
      }))
      .filter((p) => p.contentHash);
  } catch (err) {
    console.warn('[authors] chain read failed:', err);
  }

  // Off-chain metadata
  const offchainResults = await getPapersByAuthor(address);

  // Deduplicate by contentHash / id; on-chain wins (canonical)
  const byId = new Map<string, any>();
  for (const p of offchainResults) {
    byId.set(p.id.toLowerCase(), { source: 'supabase', ...p });
  }
  for (const p of blockchainResults) {
    byId.set((p.contentHash as string).toLowerCase(), { source: 'chain', ...p });
  }

  return c.json({ author: address, papers: Array.from(byId.values()) });
});

export { authors };
