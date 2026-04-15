'use client';

import { http, createConfig, injected } from 'wagmi';
import { walletConnect } from 'wagmi/connectors';

export const worldChain = {
  id: 480,
  name: 'World Chain',
  network: 'world-chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.worldchain.dev'] },
    public: { http: ['https://rpc.worldchain.dev'] },
  },
  blockExplorers: {
    default: { name: 'WorldScan', url: 'https://worldscan.org' },
  },
  testnet: false,
} as const;

// Using a public placeholder projectId for the hackathon demo resilient connection
const projectId = 'b43d41f12d2110c710d29d33adcf4d6d';

export const config = createConfig({
  chains: [worldChain],
  connectors: [
    injected(),
    walletConnect({ projectId }),
  ],
  transports: {
    [worldChain.id]: http(),
  },
});
