import { createPublicClient, createWalletClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  WORLD_CHAIN_RPC,
  PAPER_REGISTRY_ADDRESS,
  RECORDER_PRIVATE_KEY,
} from '../config.js';
import { enqueuePendingRecord } from './supabase.js';

const PAPER_REGISTRY_ABI = parseAbi([
  'function getPaper(bytes32 contentHash) view returns (bytes32 contentHash, address author, uint256 pricePerQuery, uint256 pricePerFull, uint256 trainingPrice, string metadataURI, uint256 totalEarnings, uint256 totalAccesses, bool active, uint256 createdAt)',
  'function getAuthorPapers(address author) view returns (bytes32[])',
  'function isPaperActive(bytes32 contentHash) view returns (bool)',
  'function getPaperStats(bytes32 contentHash) view returns (uint256 totalEarnings, uint256 totalAccesses)',
  'function exists(bytes32) view returns (bool)',
  'function recordAccess(bytes32 contentHash, string accessType, uint256 amount)',
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
  contentHash: string;
  author: string;
  pricePerQuery: bigint;
  pricePerFull: bigint;
  trainingPrice: bigint;
  metadataURI: string;
  totalEarnings: bigint;
  totalAccesses: bigint;
  active: boolean;
  createdAt: bigint;
}

function hasRegistry(): boolean {
  return !!PAPER_REGISTRY_ADDRESS && PAPER_REGISTRY_ADDRESS !== '0x0000000000000000000000000000000000000000';
}

export async function getPaperFromChain(contentHash: `0x${string}`): Promise<PaperOnChain | null> {
  if (!hasRegistry()) return null;
  try {
    const paper = await publicClient.readContract({
      address: PAPER_REGISTRY_ADDRESS as `0x${string}`,
      abi: PAPER_REGISTRY_ABI,
      functionName: 'getPaper',
      args: [contentHash],
    });
    return paper as any;
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
      args: [contentHash, accessType, amount],
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
