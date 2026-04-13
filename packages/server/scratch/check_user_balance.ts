
import { createPublicClient, http, formatUnits, formatEther } from 'viem';
import { defineChain } from 'viem';

const worldChainSepolia = defineChain({
  id: 4801,
  name: 'World Chain Sepolia',
  network: 'world-chain-sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://worldchain-sepolia.g.alchemy.com/public'] },
    public: { http: ['https://worldchain-sepolia.g.alchemy.com/public'] },
  },
});

const USDC_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
  },
];

async function main() {
  const targetWallet = '0x2eb655c6828d633e70c82b3b7eccac731d9b8ba7';
  const usdcAddress = '0x66145f38cBAC35Ca6F1Dfb4914dF98F1614aeA88';
  
  const publicClient = createPublicClient({
    chain: worldChainSepolia,
    transport: http()
  });

  try {
    const ethBalance = await publicClient.getBalance({ address: targetWallet });
    const usdcBalance = await publicClient.readContract({
      address: usdcAddress,
      abi: USDC_ABI,
      functionName: 'balanceOf',
      args: [targetWallet],
    }) as bigint;

    console.log(`--- Wallet Balance Check (World Chain Sepolia) ---`);
    console.log(`Wallet: ${targetWallet}`);
    console.log(`ETH Balance: ${formatEther(ethBalance)} ETH`);
    console.log(`USDC Balance: ${formatUnits(usdcBalance, 6)} USDC`);
    
    if (usdcBalance === 0n) {
      console.log(`\n⚠️ Warning: USDC balance is ZERO. The Circle faucet might still be processing.`);
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

main();
