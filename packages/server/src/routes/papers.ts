import { Hono } from 'hono';
import { getPaperFromChain } from '../services/contract.js';
import { queryPaper, getPaperSections, searchPapers } from '../services/rag.js';
import { PAY_TO_ADDRESS } from '../config.js';
import { getPaperMetadata } from '../services/supabase.js';

const papers = new Hono();

// ── GET /papers/search?q=... ──────────────────────────────────
// Delegates entirely to RAG's /search which now returns a snippet-enriched
// payload in a single RPC (see migrations/0002_match_chunks.sql).
papers.get('/search', async (c) => {
  const q = c.req.query('q');
  if (!q || q.trim().length < 2) {
    return c.json({ error: 'Query must be at least 2 characters' }, 400);
  }

  try {
    const { data } = await searchPapers(q);
    const results = data.results ?? [];

    // Deduplicate by paper_id (preserve first occurrence)
    const unique = new Map<string, any>();
    for (const p of results) {
      const id = p.paper_id ?? p.id ?? p.title;
      if (id && !unique.has(id)) unique.set(id, p);
    }

    return c.json({ results: Array.from(unique.values()) });
  } catch (err: any) {
    console.error('[search] error:', err);
    return c.json({ error: 'Failed to search RAG engine' }, 500);
  }
});

// ── GET /papers/:id/metadata ──────────────────────────────────
papers.get('/:id/metadata', async (c) => {
  const id = c.req.param('id');

  // Virtual "agent" papers (synthetic; not registered anywhere)
  if (id === 'agent-query') {
    return c.json({
      contentHash: 'agent-query',
      author: PAY_TO_ADDRESS,
      title: 'NanoClaw Quick Inquiry',
      description: 'Single high-precision inquiry to the autonomous researcher.',
      pricePerQuery: '10000',
      pricePerFull: '10000',
      active: true,
      source: 'virtual',
      isAgent: true,
    });
  }

  if (id === 'agent-full' || id === 'agent') {
    return c.json({
      contentHash: 'agent-full',
      author: PAY_TO_ADDRESS,
      title: 'NanoClaw Alpha Researcher',
      description: 'Full autonomous loop with multi-source synthesis.',
      pricePerQuery: '50000',
      pricePerFull: '50000',
      active: true,
      source: 'virtual',
      isAgent: true,
    });
  }

  // 1. On-chain (canonical)
  const paper = await getPaperFromChain(id as `0x${string}`);
  if (paper) {
    return c.json({
      contentHash: id,
      author: paper.author,
      metadataURI: paper.metadataURI,
      pricePerQuery: paper.pricePerQuery.toString(),
      pricePerFull: paper.pricePerFull.toString(),
      trainingPrice: paper.trainingPrice.toString(),
      totalEarnings: paper.totalEarnings.toString(),
      totalAccesses: paper.totalAccesses.toString(),
      active: paper.active,
      createdAt: new Date(Number(paper.createdAt) * 1000).toISOString(),
      source: 'chain',
    });
  }

  // 2. Supabase (cache)
  const cloudMeta = await getPaperMetadata(id);
  if (cloudMeta) {
    return c.json({
      contentHash: id,
      author: cloudMeta.author,
      title: cloudMeta.title ?? 'Research Paper',
      pricePerQuery: String(Math.round(cloudMeta.price_query * 1e6)),
      pricePerFull: String(Math.round(cloudMeta.price_full * 1e6)),
      active: cloudMeta.active ?? true,
      source: 'supabase',
    });
  }

  return c.json({ error: 'Paper not found' }, 404);
});

// ── Paid handlers (invoked from index.ts after payment middleware) ────────

export async function handleQuery(paperId: string, question: string) {
  if (!question || question.trim().length < 5) {
    return { data: { error: 'Question must be at least 5 characters' }, status: 400 };
  }

  try {
    const { data, status } = await queryPaper(paperId, question);
    return { data, status };
  } catch (err: any) {
    console.error(`[handleQuery] error on ${paperId}: ${err.message}`);
    return {
      data: {
        error: 'RAG engine error',
        detail: err.message,
      },
      status: 502,
    };
  }
}

export async function handlePreview(paperId: string) {
  const { data: sectionRes } = await getPaperSections(paperId);
  if (!sectionRes.sections || sectionRes.sections.length === 0) {
    return { data: { error: 'No sections found for this paper' }, status: 404 };
  }
  const first = sectionRes.sections[0];
  return {
    data: {
      paper_id: paperId,
      title: first.name,
      content: first.content,
      total_sections: sectionRes.sections.length,
    },
    status: 200,
  };
}

export async function handleSection(paperId: string, sectionName: string) {
  const { data: sectionRes } = await getPaperSections(paperId);
  const section = sectionRes.sections.find(
    (s) => s.name.toLowerCase() === sectionName.toLowerCase()
  );
  if (!section) {
    return {
      data: {
        error: `Section '${sectionName}' not found`,
        available: sectionRes.sections.map((s) => s.name),
      },
      status: 404,
    };
  }
  return { data: section, status: 200 };
}

export async function handleCitations(paperId: string) {
  const { data: sections } = await getPaperSections(paperId);
  const citations = sections.sections.find((s) => s.name.toLowerCase() === 'references');
  return {
    data: {
      paper_id: paperId,
      citations: citations?.content ?? 'No references section found',
    },
    status: 200,
  };
}

export async function handleFull(paperId: string) {
  const { data: sections } = await getPaperSections(paperId);
  const fullText = sections.sections.map((s) => `## ${s.name}\n\n${s.content}`).join('\n\n');
  return {
    data: {
      paper_id: paperId,
      full_text: fullText,
      sections: sections.sections.length,
      note: 'Full text returned as extracted text, not original PDF',
    },
    status: 200,
  };
}

export async function handleData(paperId: string) {
  const { data: result } = await queryPaper(
    paperId,
    'What datasets, tables, and experimental results are reported in this paper?'
  );
  return {
    data: {
      paper_id: paperId,
      datasets: result.answer,
      chunks: result.chunks,
    },
    status: 200,
  };
}

export { papers };
