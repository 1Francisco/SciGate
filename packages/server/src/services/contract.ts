import { createPublicClient, createWalletClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  WORLD_CHAIN_RPC,
  PAPER_REGISTRY_ADDRESS,
  RECORDER_PRIVATE_KEY,
} from '../config.js';
import { enqueuePendingRecord } from './supabase.js';

const PAPER_REGISTRY_ABI = parseAbi([
  'function papers(bytes32 hash) view returns (address author, uint64 priceQuery, uint64 priceFull, uint64 priceTraining, bool active, uint40 createdAt, string metadataURI, uint256 totalEarnings, uint256 totalAccesses)',
  'function getAuthorPapers(address author) view returns (bytes32[])',
  'function isPaperActive(bytes32 hash) view returns (bool)',
  'function getPaperStats(bytes32 hash) view returns (uint256 totalEarnings, uint256 totalAccesses)',
  'function recordAccess(bytes32 hash, uint256 amount)',
]);

const worldChain = {
  id: 480,
  name: 'World Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [WORLD_CHAIN_RPC] } },
} as const;

const publicClient = createPublicClient({
  chain: worldChain as any,
  transport: http(WORLD_CHAIN_RPC),
});

const recorderAccount =
  RECORDER_PRIVATE_KEY && RECORDER_PRIVATE_KEY.length >= 64
    ? privateKeyToAccount(
        (RECORDER_PRIVATE_KEY.startsWith('0x')
          ? RECORDER_PRIVATE_KEY
          : `0x${RECORDER_PRIVATE_KEY}`) as `0x${string}`
      )
    : null;

const walletClient = recorderAccount
  ? createWalletClient({
      account: recorderAccount,
      chain: worldChain as any,
      transport: http(WORLD_CHAIN_RPC),
    })
  : null;

export interface PaperOnChain {
  author: string;
  priceQuery: bigint;
  priceFull: bigint;
  priceTraining: bigint;
  active: boolean;
  createdAt: number;
  metadataURI: string;
  totalEarnings: bigint;
  totalAccesses: bigint;
}

function hasRegistry(): boolean {
  return !!PAPER_REGISTRY_ADDRESS && PAPER_REGISTRY_ADDRESS !== '0x0000000000000000000000000000000000000000';
}

export async function getPaperFromChain(contentHash: `0x${string}`): Promise<PaperOnChain | null> {
  if (!hasRegistry()) return null;
  try {
    const [author, pQuery, pFull, pTraining, active, createdAt, metadataURI, earnings, accesses] = await publicClient.readContract({
      address: PAPER_REGISTRY_ADDRESS as `0x${string}`,
      abi: PAPER_REGISTRY_ABI,
      functionName: 'papers',
      args: [contentHash],
    });
    
    if (author === '0x0000000000000000000000000000000000000000') return null;

    return {
      author,
      priceQuery: pQuery,
      priceFull: pFull,
      priceTraining: pTraining,
      active,
      createdAt,
      metadataURI,
      totalEarnings: earnings,
      totalAccesses: accesses
    };
  } catch {
    return null;
  }
}

export async function getAuthorPapersFromChain(address: `0x${string}`): Promise<`0x${string}`[]> {
  if (!hasRegistry()) return [];
  try {
    const hashes = await publicClient.readContract({
      address: PAPER_REGISTRY_ADDRESS as `0x${string}`,
      abi: PAPER_REGISTRY_ABI,
      functionName: 'getAuthorPapers',
      args: [address],
    });
    return hashes as `0x${string}`[];
  } catch {
    return [];
  }
}

export async function isPaperActive(contentHash: `0x${string}`): Promise<boolean> {
  if (!hasRegistry()) return false;
  try {
    return (await publicClient.readContract({
      address: PAPER_REGISTRY_ADDRESS as `0x${string}`,
      abi: PAPER_REGISTRY_ABI,
      functionName: 'isPaperActive',
      args: [contentHash],
    })) as boolean;
  } catch {
    return false;
  }
}

export async function getPaperStats(
  contentHash: `0x${string}`
): Promise<{ totalEarnings: bigint; totalAccesses: bigint } | null> {
  if (!hasRegistry()) return null;
  try {
    const [totalEarnings, totalAccesses] = (await publicClient.readContract({
      address: PAPER_REGISTRY_ADDRESS as `0x${string}`,
      abi: PAPER_REGISTRY_ABI,
      functionName: 'getPaperStats',
      args: [contentHash],
    })) as [bigint, bigint];
    return { totalEarnings, totalAccesses };
  } catch {
    return null;
  }
}

/**
 * Records a paid access on-chain.
 * Non-blocking: if the on-chain call fails, the record is enqueued to pending_records
 * for later retry, and the function resolves successfully so the HTTP response isn't blocked.
 */
export async function recordAccess(
  contentHash: `0x${string}`,
  accessType: 'query' | 'full' | 'section' | 'citations' | 'data',
  amount: bigint
): Promise<{ ok: boolean; txHash?: string; reason?: string }> {
  if (!hasRegistry()) {
    return { ok: false, reason: 'no-registry-configured' };
  }
  if (!walletClient || !recorderAccount) {
    console.warn('[recordAccess] RECORDER_PRIVATE_KEY not set — enqueuing for later.');
    await enqueuePendingRecord({
      paper_id: contentHash,
      access_type: accessType,
      amount: amount.toString(),
    });
    return { ok: false, reason: 'no-recorder-key' };
  }

  try {
    const txHash = await walletClient.writeContract({
      address: PAPER_REGISTRY_ADDRESS as `0x${string}`,
      abi: PAPER_REGISTRY_ABI,
      functionName: 'recordAccess',
      args: [contentHash, amount],
      chain: worldChain as any,
      account: recorderAccount,
    });
    console.log(`[recordAccess] ${accessType} on ${contentHash.slice(0, 10)}… → ${txHash}`);
    return { ok: true, txHash };
  } catch (err: any) {
    console.warn(`[recordAccess] on-chain call failed, enqueuing: ${err.message}`);
    await enqueuePendingRecord({
      paper_id: contentHash,
      access_type: accessType,
      amount: amount.toString(),
    });
    return { ok: false, reason: err.message };
  }
}
