import { useState, useEffect, useRef } from 'react';

interface WorldIDVerifyProps {
  appId: string;
  action: string;
  signal: string;
  onSuccess: (proof: any) => void;
  onError?: (err: any) => void;
}

/**
 * WorldIDVerify (Native Bridge Multi-Architecture)
 * Bypasses all IDKit libraries to prevent React 19 / WebView crashes.
 * Talk directly to the World App bridge protocol.
 */
export default function WorldIDVerify({ appId, action, signal, onSuccess, onError }: WorldIDVerifyProps) {
  const [status, setStatus] = useState<'initializing' | 'waiting' | 'error'>('initializing');
  const triggerRef = useRef(false);

  useEffect(() => {
    // 1. Prepare Listener
    const handleBridgeMessage = (event: MessageEvent) => {
      try {
        let data = event.data;
        if (typeof data === 'string') {
          try { data = JSON.parse(data); } catch { return; }
        }

        console.log('[NativeBridge] Event received:', data);

        // Standard World ID response format in bridge
        if (data.event === 'miniapp-verify' || data.command === 'verify') {
          if (data.status === 'success' || data.payload?.status === 'success') {
            const proof = data.payload || data;
            console.log('[NativeBridge] SUCCESS:', proof);
            onSuccess(proof);
          } else if (data.status === 'error' || data.payload?.status === 'error') {
            console.error('[NativeBridge] ERROR:', data);
            setStatus('error');
            onError?.(data);
          }
        }
      } catch (err) {
        console.error('[NativeBridge] Parse error:', err);
      }
    };

    window.addEventListener('message', handleBridgeMessage);

    // 2. Trigger Modal Automatically (Strictly once)
    const triggerModal = () => {
      if (triggerRef.current) return;
      triggerRef.current = true;
      setStatus('waiting');

      const message = {
        command: 'verify',
        version: 1,
        payload: {
          action: action,
          signal: signal,
          verification_level: 'orb',
          app_id: appId
        }
      };

      try {
        console.log('[NativeBridge] Triggering verify command...', message);
        
        // Android Bridge
        if ((window as any).Android) {
          (window as any).Android.postMessage(JSON.stringify(message));
        } 
        // iOS / WebKit Bridge
        else if ((window as any).webkit?.messageHandlers?.minikit) {
          (window as any).webkit.messageHandlers.minikit.postMessage(message);
        }
        else {
          console.warn('[NativeBridge] No bridge found. Are you in World App?');
          // If no bridge, we might be in web. Failsafe to error after 3s.
          setTimeout(() => setStatus('error'), 3000);
        }
      } catch (err) {
        console.error('[NativeBridge] Trigger failed:', err);
        setStatus('error');
      }
    };

    // Small delay to ensure bridge is ready
    const timer = setTimeout(triggerModal, 500);

    return () => {
      window.removeEventListener('message', handleBridgeMessage);
      clearTimeout(timer);
    };
  }, [appId, action, signal, onSuccess, onError]);

  if (!appId || appId === 'app_staging_placeholder') {
    return (
      <div style={{ padding: '24px', textAlign: 'center', opacity: 0.6 }}>
        <p>⚠️ Configuration missing: NEXT_PUBLIC_WORLD_APP_ID</p>
      </div>
    );
  }

  return (
    <div style={{ 
      padding: '32px', 
      textAlign: 'center', 
      background: 'rgba(255,255,255,0.03)', 
      borderRadius: '20px',
      border: '1px solid var(--border)',
      marginTop: 24,
      boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      backdropFilter: 'blur(10px)'
    }}>
      <div className="animate-pulse" style={{ fontSize: 48, marginBottom: 20 }}>🛡️</div>
      <h3 style={{ marginBottom: 12, fontSize: 20, fontWeight: 700 }}>
        {status === 'initializing' ? 'Cargando Puente...' : 
         status === 'waiting' ? 'Verificando en World App' : 'Error de Conexión'}
      </h3>
      
      <p style={{ color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.6 }}>
        {status === 'waiting' 
          ? 'Por favor, confirma la verificación en tu World App emergente.' 
          : status === 'error' 
          ? 'No se pudo abrir el modal nativo. Asegúrate de estar dentro de World App.'
          : 'Preparando entorno seguro...'}
      </p>

      {status === 'error' && (
        <button 
          className="btn-primary" 
          onClick={() => { triggerRef.current = false; window.location.reload(); }}
          style={{ marginTop: 24, width: '100%' }}
        >
          Reintentar Todo →
        </button>
      )}

      {status === 'waiting' && (
        <div style={{ marginTop: 24 }}>
          <div className="spinner" style={{ margin: '0 auto' }}></div>
          <p style={{ marginTop: 12, fontSize: 12, opacity: 0.5 }}>ESPERANDO RESPUESTA NATIVA...</p>
        </div>
      )}
    </div>
  );
}
