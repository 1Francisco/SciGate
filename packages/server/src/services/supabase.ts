import 'dotenv/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_ANON_KEY; // legacy fallback with warning

if (supabaseUrl && !process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_ANON_KEY) {
  console.warn(
    '⚠️  [Supabase] Using SUPABASE_ANON_KEY server-side. Switch to SUPABASE_SERVICE_ROLE_KEY for production.'
  );
}

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️  [Supabase] SUPABASE_URL or service key missing — cloud metadata disabled.');
}

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// ── Paper metadata ──────────────────────────────────────────────

export interface PaperMetadata {
  id: string;
  title: string;
  author: string;
  price_query: number;
  price_full: number;
  active?: boolean;
}

export async function savePaperMetadata(metadata: PaperMetadata) {
  if (!supabase) return;

  console.log(`[Supabase] Saving metadata for ${metadata.id}`);
  const { error } = await supabase.from('papers').upsert({
    ...metadata,
    active: metadata.active ?? true,
  });

  if (error) {
    console.error(`[Supabase] Save error: ${error.message}`);
    throw error;
  }
}

export async function getPaperMetadata(paperId: string): Promise<PaperMetadata | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('papers')
    .select('*')
    .eq('id', paperId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error(`[Supabase] Get error: ${error.message}`);
    return null;
  }
  return data as PaperMetadata;
}

export async function getPapersByAuthor(wallet: string): Promise<PaperMetadata[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('papers')
    .select('*')
    .eq('author', wallet.toLowerCase());

  if (error) {
    console.error(`[Supabase] Author search error: ${error.message}`);
    return [];
  }

  return data || [];
}

// ── Usage trial tracking (persistent) ──────────────────────────

export type TrialKind = 'query' | 'full';

/**
 * Increments the trial counter for a given user/kind and returns the new count.
 * If Supabase is unavailable falls back to an in-memory map (local dev only).
 */
const memoryFallback = new Map<string, number>();

export async function incrementTrial(userId: string, kind: TrialKind): Promise<number> {
  const key = `${userId}:${kind}`;

  if (!supabase) {
    const next = (memoryFallback.get(key) ?? 0) + 1;
    memoryFallback.set(key, next);
    return next;
  }

  const { data, error } = await supabase.rpc('increment_trial', {
    p_user_id: userId,
    p_kind: kind,
  });

  if (error) {
    console.warn(`[Supabase] increment_trial failed, falling back to memory: ${error.message}`);
    const next = (memoryFallback.get(key) ?? 0) + 1;
    memoryFallback.set(key, next);
    return next;
  }

  return (data as number) ?? 1;
}

// ── Pending on-chain recordAccess queue ────────────────────────

export interface PendingRecord {
  paper_id: string;
  access_type: string;
  amount: string; // atomic units string (bigint serialized)
}

export async function enqueuePendingRecord(record: PendingRecord) {
  if (!supabase) return;
  const { error } = await supabase.from('pending_records').insert({
    ...record,
    created_at: new Date().toISOString(),
  });
  if (error) console.warn(`[Supabase] enqueuePendingRecord: ${error.message}`);
}
