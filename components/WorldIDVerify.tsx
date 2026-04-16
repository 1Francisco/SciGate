import { useState, useEffect } from 'react';
import { IDKitWidget, ISuccessResult } from '@worldcoin/idkit';

interface WorldIDVerifyProps {
  appId: string;
  action: string;
  signal: string;
  onSuccess: (proof: ISuccessResult) => void;
  onError?: (err: any) => void;
}

/**
 * WorldIDVerify (Headless v1.2.2)
 * Final restoration of the World ID modal. Using v1.2.2 avoids signature complexities,
 * and the headless approach avoids React 19 UI conflicts.
 */
export default function WorldIDVerify({ appId, action, signal, onSuccess, onError }: WorldIDVerifyProps) {
  const [isClient, setIsClient] = useState(false);

  // Ensure we only render the Worldcoin logic on the client to avoid hydration issues
  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!appId || appId === 'app_staging_placeholder') {
    return (
      <div className="card" style={{ textAlign: 'center', opacity: 0.6 }}>
        <p>⚠️ Configuration missing: NEXT_PUBLIC_WORLD_APP_ID</p>
      </div>
    );
  }

  if (!isClient) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-secondary)' }}>⏳ Initializing bridge...</p>
      </div>
    );
  }

  return (
    <div style={{ 
      padding: '24px', 
      textAlign: 'center', 
      background: 'rgba(255,255,255,0.02)', 
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border)',
      marginTop: 24 
    }}>
      <div className="animate-pulse" style={{ fontSize: 40, marginBottom: 16 }}>🛡️</div>
      <h3 style={{ marginBottom: 8 }}>World ID Verification</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 }}>
        Securely prove your humanity via the official World ID modal.
      </p>

      <IDKitWidget
        app_id={appId as `app_${string}`}
        action={action}
        signal={signal}
        onSuccess={(result) => {
          console.log('[WorldID] Proof generated:', result);
          onSuccess(result);
        }}
        onError={(err) => {
          console.error('[WorldID] Modal error:', err);
          onError?.(err);
        }}
      >
        {({ open }) => (
          <button 
            className="btn-primary" 
            onClick={open}
            style={{ width: '100%', padding: '14px' }}
          >
            Verify Identity Now →
          </button>
        )}
      </IDKitWidget>
    </div>
  );
}
