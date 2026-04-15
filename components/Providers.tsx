'use client';

import { MiniKit } from '@worldcoin/minikit-js';
import { useEffect, ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { config } from '@/config/wagmi';

const queryClient = new QueryClient();

// Instalación inmediata para evitar condiciones de carrera
if (typeof window !== 'undefined') {
  MiniKit.install();
}

export default function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    console.log('--- [MINIKIT READY] ---');
  }, []);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
