'use client';

import { MiniKit } from '@worldcoin/minikit-js';
import { useEffect, ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { config } from '@/config/wagmi';

const queryClient = new QueryClient();

// Instalación inmediata con ID de seguridad
const APP_ID = process.env.NEXT_PUBLIC_WORLD_APP_ID || 'app_aacdf4487837b144901774135e3b0803';

if (typeof window !== 'undefined') {
  try {
    MiniKit.install(APP_ID);
    console.log('✅ MiniKit.install(id) called successfully');
  } catch (e) {
    console.error('❌ MiniKit.install failed:', e);
  }
}

export default function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    console.log('--- [MINIKIT STATUS] ---');
    console.log('Is Installed:', MiniKit.isInstalled());
    console.log('App ID:', APP_ID);
  }, []);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
