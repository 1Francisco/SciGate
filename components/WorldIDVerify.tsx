import { useEffect, useRef, useState } from 'react';
import { IDKitWidget, VerificationLevel, ISuccessResult } from '@worldcoin/idkit';

interface WorldIDVerifyProps {
  appId: string;
  action: string;
  signal: string;
  onSuccess: (proof: ISuccessResult) => void;
  onError?: (err: any) => void;
}

/**
 * WorldIDVerify Component (v2 compliant + Automatic Trigger)
 * Automatically triggers the World ID modal when the component mounts.
 */
export default function WorldIDVerify({ appId, action, signal, onSuccess, onError }: WorldIDVerifyProps) {
  const [verifying, setVerifying] = useState(false);
  const openIdKit = useRef<(() => void) | null>(null);
  const autoTriggered = useRef(false);

  // Automatic Trigger on mount
  useEffect(() => {
    if (!autoTriggered.current && openIdKit.current && appId !== 'app_staging_placeholder') {
      console.log('🚀 Automatically triggering World ID verification...');
      autoTriggered.current = true;
      setVerifying(true);
      openIdKit.current();
    }
    // We poll briefly because the render prop callback might happen slightly after first mount
    const timer = setInterval(() => {
      if (!autoTriggered.current && openIdKit.current && appId !== 'app_staging_placeholder') {
        autoTriggered.current = true;
        setVerifying(true);
        openIdKit.current();
        clearInterval(timer);
      }
    }, 100);

    return () => clearInterval(timer);
  }, [appId]);

  if (!appId || appId === 'app_staging_placeholder') {
    return (
      <div className="card" style={{ textAlign: 'center', opacity: 0.6 }}>
        <p>⚠️ Configuration missing: NEXT_PUBLIC_WORLD_APP_ID</p>
      </div>
    );
  }

  return (
    <div style={{ 
      padding: '24px', 
      textAlign: 'center', 
      background: 'rgba(255,255,255,0.03)', 
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border)',
      marginTop: 24 
    }}>
      <div style={{ fontSize: 32, marginBottom: 16 }}>🛡️</div>
      <h3 style={{ marginBottom: 8 }}>Verifying Humanity</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 }}>
        Check your World App for the verification prompt.
      </p>

      <IDKitWidget
        app_id={appId as `app_${string}`}
        action={action}
        signal={signal}
        verification_level={VerificationLevel.Orb}
        onSuccess={(proof) => {
          console.log('IDKit Verification Success:', proof);
          onSuccess(proof);
        }}
        handleVerify={(proof) => {
          console.log('IDKit proof received:', proof);
        }}
      >
        {({ open }) => {
          openIdKit.current = open;
          return (
            <button 
              className="btn-primary" 
              onClick={open}
              style={{ width: '100%', padding: '14px', opacity: verifying ? 0.7 : 1 }}
              disabled={verifying}
            >
              {verifying ? '⏳ Waiting for World App...' : 'Verify with World ID'}
            </button>
          );
        }}
      </IDKitWidget>
    </div>
  );
}
