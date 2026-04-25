'use client';

import { useEffect, ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { config } from '@/config/wagmi';
import { MiniKit } from '@worldcoin/minikit-js';

const queryClient = new QueryClient();

export default function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    const appId = process.env.NEXT_PUBLIC_WORLD_APP_ID ?? 'app_8d3e4ef96e0ef911d19e2e42107b16fb';
    MiniKit.install(appId);
    console.log('[MiniKit] Installed with appId:', appId);
  }, []);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
