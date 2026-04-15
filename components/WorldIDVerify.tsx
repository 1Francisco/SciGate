import { MiniKit } from '@worldcoin/minikit-js';
import { useEffect, useState, useRef } from 'react';

interface WorldIDVerifyProps {
  appId: string;
  action: string;
  signal: string;
  onSuccess: (proof: any) => void;
  onError?: (err: any) => void;
}

export default function WorldIDVerify({ appId, action, signal, onSuccess, onError }: WorldIDVerifyProps) {
  const [verifying, setVerifying] = useState(false);
  const lock = useRef(false);

  useEffect(() => {
    const triggerVerify = async (retries = 0) => {
      if (!appId || appId === 'app_staging_placeholder') return;
      
      try {
        if (!MiniKit.isInstalled()) {
          console.warn(`[WorldID] MiniKit not ready (Attempt ${retries + 1}). Wait...`);
          if (retries < 5) {
            setTimeout(() => triggerVerify(retries + 1), 1000);
            return;
          }
          throw new Error('MiniKit environment not detected after multiple retries.');
        }

        lock.current = true;
        setVerifying(true);
        
        console.log('Triggering World ID verification...');
        
        // El error de getActiveMiniKit ocurre DENTRO de esta llamada si el bridge falla
        const minikitAny = MiniKit as any;
        const response = await (minikitAny.verify || minikitAny.walletAuth)({
          app_id: appId,
          action: action,
          signal: signal,
          verification_level: 'orb',
        });

        const payload = response.data || response.finalPayload || response;

        if (payload.status === 'success') {
          console.log('MiniKit Verify Success:', payload);
          onSuccess(payload);
        } else {
          console.error('MiniKit Verify Error:', payload);
          onError?.(payload);
        }
      } catch (err: any) {
        console.error('MiniKit Verify Exception:', err);
        // If it was already in flight, don't show a scary error to user
        if (!err.message?.includes('already in flight')) {
          onError?.(err);
        }
      } finally {
        setVerifying(false);
        // We don't unlock here immediately to prevent re-triggers if onSuccess hasn't finished
        // But for this simple flow, we can unlock after a short delay
        setTimeout(() => { lock.current = false; }, 2000);
      }
    };

    triggerVerify();
  }, [appId, action, signal]);

  return (
    <div style={{ 
      padding: '24px', 
      textAlign: 'center', 
      background: 'rgba(255,255,255,0.03)', 
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border)',
      marginTop: 24 
    }}>
      <div className="animate-pulse" style={{ fontSize: 32, marginBottom: 16 }}>🛡️</div>
      <h3 style={{ marginBottom: 8 }}>Verifying Humanity</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
        Please follow the prompt in your World App to continue.
      </p>
      {verifying && (
        <div style={{ marginTop: 16, color: 'var(--accent-indigo)', fontSize: 12, fontWeight: 600 }}>
          ⏳ WAITING FOR WORLD ID...
        </div>
      )}
    </div>
  );
}
