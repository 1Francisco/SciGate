import { RAG_SERVICE_URL } from '../config.js';

const RAG_INTERNAL_TOKEN = process.env.RAG_INTERNAL_TOKEN ?? '';

export interface UploadResponse {
  paper_id: string;
  content_hash: string;
  chunks_count: number;
  title: string;
  pages: number;
}

export interface QueryResponse {
  answer: string;
  chunks: Array<{ text: string; page: number; chunk_index: number }>;
  paper_id: string;
}

export interface SectionInfo {
  name: string;
  start_page: number;
  content: string;
}

export interface SectionsResponse {
  paper_id: string;
  sections: SectionInfo[];
}

function internalHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { ...extra };
  if (RAG_INTERNAL_TOKEN) h['x-internal-token'] = RAG_INTERNAL_TOKEN;
  return h;
}

async function ragFetch<T>(
  path: string,
  init: RequestInit = {},
  retries = 2
): Promise<{ data: T; status: number }> {
  const url = `${RAG_SERVICE_URL}${path}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: internalHeaders((init.headers as Record<string, string>) ?? {}),
      });

      if (res.ok || res.status === 402 || res.status === 404) {
        const data = (await res.json()) as T;
        return { data, status: res.status };
      }

      if (res.status === 503 || res.status === 429) {
        const wait = 500 * (attempt + 1);
        console.warn(`[rag] upstream ${res.status}, retrying in ${wait}ms`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }

      const text = await res.text().catch(() => '');
      throw new Error(`RAG engine error (${res.status}): ${text}`);
    } catch (err: any) {
      if (attempt === retries) throw err;
      console.warn(`[rag] fetch attempt ${attempt + 1} failed, retrying:`, err.message);
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error('RAG engine unreachable after retries');
}

export async function uploadPaper(formData: FormData) {
  // Upload does not require the internal token so the frontend can call it directly.
  return ragFetch<UploadResponse>('/upload', { method: 'POST', body: formData });
}

export async function queryPaper(paperId: string, question: string) {
  return ragFetch<QueryResponse>('/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paper_id: paperId, question }),
  });
}

export async function getPaperSections(paperId: string) {
  return ragFetch<SectionsResponse>(`/papers/${paperId}/sections`);
}

export async function searchPapers(query: string) {
  return ragFetch<{ results: any[] }>(`/search?q=${encodeURIComponent(query)}`);
}
