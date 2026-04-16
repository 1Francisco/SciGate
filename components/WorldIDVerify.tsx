import { useState, useCallback, useEffect, useRef } from 'react';
import { IDKitRequestWidget, orbLegacy, IDKitResult, IDKitErrorCodes } from '@worldcoin/idkit';

interface WorldIDVerifyProps {
  appId: string;
  action: string;
  signal: string;
  onSuccess: (proof: IDKitResult) => void;
  onError?: (err: any) => void;
}

/**
 * WorldIDVerify (v4 / Cycle Fix)
 * Ensures the modal only mounts once the server signature is ready.
 */
export default function WorldIDVerify({ appId, action, signal, onSuccess, onError }: WorldIDVerifyProps) {
  const [loading, setLoading] = useState(false);
  const [rpContext, setRpContext] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  
  const inFlight = useRef(false);

  // Fetch the signature from backend
  const prepareVerification = useCallback(async () => {
    if (inFlight.current || rpContext) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);

    try {
      console.log(`[WorldID] Getting signature for appId: ${appId}, action: ${action}`);
      const response = await fetch('/api/auth/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, signal, app_id: appId })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Failed to sign request');

      console.log('[WorldID] Signature received, mounting modal...', data.rp_context);
      setRpContext(data.rp_context);
      setIsOpen(true);
    } catch (err: any) {
      console.error('[WorldID] Preparation failed:', err);
      setError(err.message || 'Verification setup failed');
      onError?.(err);
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, [appId, action, signal, rpContext, onError]);

  // Trigger on mount
  useEffect(() => {
    if (!rpContext && !loading && appId && appId !== 'app_staging_placeholder') {
      prepareVerification();
    }
  }, [appId, rpContext, loading, prepareVerification]);

  if (!appId || appId === 'app_staging_placeholder') {
    return (
      <div className="card" style={{ textAlign: 'center', opacity: 0.6 }}>
        <p>⚠️ Missing Credentials: NEXT_PUBLIC_WORLD_APP_ID</p>
      </div>
    );
  }

  return (
    <div style={{ 
      padding: '28px', 
      textAlign: 'center', 
      background: 'rgba(255,255,255,0.02)', 
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border)',
      marginTop: 24 
    }}>
      <div className="animate-pulse" style={{ fontSize: 40, marginBottom: 16 }}>🛡️</div>
      <h3 style={{ marginBottom: 8 }}>Verifying Identity</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 }}>
        {loading ? 'Requesting secure signature...' : 'Connecting to World App...'}
      </p>

      {error && (
        <div style={{ padding: '14px', background: 'rgba(239,68,68,0.08)', borderRadius: 'var(--radius-sm)', marginBottom: 16, border: '1px solid rgba(239,68,68,0.2)' }}>
          <p style={{ color: '#f87171', fontSize: 13, marginBottom: 10 }}>⚠️ {error}</p>
          <button 
            className="btn-primary" 
            onClick={() => { setRpContext(null); prepareVerification(); }} 
            style={{ fontSize: 12, padding: '10px 20px' }}
          >
            Retry Verification
          </button>
        </div>
      )}

      {loading && (
        <div style={{ color: 'var(--accent-indigo)', fontSize: 12, fontWeight: 600, letterSpacing: '0.05em' }}>
          ⏳ INITIALIZING...
        </div>
      )}

      {/* RENDERIZADO CONDICIONAL: El widget solo existe cuando el contexto está listo */}
      {rpContext && (
        <IDKitRequestWidget
          app_id={appId as `app_${string}`}
          action={action}
          open={isOpen}
          onOpenChange={(open) => {
            setIsOpen(open);
            if (!open) setRpContext(null); // Limpiar para permitir re-intentos si se cierra
          }}
          rp_context={rpContext}
          allow_legacy_proofs={true}
          preset={orbLegacy({ signal: signal.toLowerCase() })}
          onSuccess={(result) => {
            console.log('[WorldID] Success Payload:', result);
            onSuccess(result);
          }}
          onError={(err: IDKitErrorCodes) => {
            console.error('[WorldID] Modal error:', err);
            if (err !== IDKitErrorCodes.UserRejected) {
               setError(`Modal Error: ${err}. Check portal logs.`);
            }
            setIsOpen(false);
            setRpContext(null);
          }}
        />
      )}
    </div>
  );
}
