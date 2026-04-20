'use client';

import { useState } from 'react';
import { IDKitRequestWidget, orbLegacy, deviceLegacy, IDKitResult, IDKitErrorCodes } from '@worldcoin/idkit';

interface WorldIDVerifyProps {
  appId: string;
  action: string;
  signal: string;
  onSuccess: (result: IDKitResult) => void;
  onError?: (err: any) => void;
}

/**
 * WorldIDVerify (IDKit v4.1.1 Nativo)
 * Esta versión utiliza el puente nativo de la World App (Mini App Bridge).
 * Evita la apertura de nuevas pestañas y utiliza el modal nativo.
 */
export default function WorldIDVerify({ appId, action, signal, onSuccess, onError }: WorldIDVerifyProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isProduction = appId.startsWith('app_') && !appId.startsWith('app_staging_');

  const handleSuccess = (result: IDKitResult) => {
    console.log('[WorldID] Verificación Exitosa (Nativa):', result);
    setStatus('success');
    onSuccess(result);
  };

  const handleError = (errorCode: IDKitErrorCodes) => {
    console.error('[WorldID] Error Nativo:', errorCode);
    setErrorMsg(`Error: ${errorCode}`);
    setStatus('error');
    onError?.({ code: errorCode });
  };

  if (!appId || appId === 'app_staging_placeholder') {
    return <div className="p-4 bg-red-500/20 text-red-400 rounded-xl text-center text-xs">App ID faltante</div>;
  }

  return (
    <div className="mt-6">
      {/* 
          El IDKitRequestWidget en v4 detecta automáticamente si está en la World App.
          Usamos 'preset' con orbLegacy/deviceLegacy para simplificar la configuración v4.
      */}
      <IDKitRequestWidget
        app_id={appId as `app_${string}`}
        action={action}
        // Configuración nativa v4
        preset={isProduction 
          ? orbLegacy({ signal: signal.trim() }) 
          : deviceLegacy({ signal: signal.trim() })
        }
        // @ts-ignore - Bypass temporal para rp_context en hackathon si el preset no lo cubre todo
        rp_context={null} 
        allow_legacy_proofs={true}
        open={isOpen}
        onOpenChange={setIsOpen}
        onSuccess={handleSuccess}
        onError={handleError}
        autoClose
      >
        {({ open }: { open: () => void }) => (
          <div className="p-8 text-center bg-white/5 border border-white/10 rounded-[32px] backdrop-blur-xl relative transition-all hover:bg-white/[0.07]">
            <div className="mb-6 flex justify-center">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl shadow-2xl transition-all duration-500 ${
                status === 'success' ? 'bg-green-500 shadow-green-500/20' : 
                status === 'error' ? 'bg-red-500 shadow-red-500/20' : 
                'bg-[#00c8ff] shadow-[#00c8ff]/20'
              }`}>
                {status === 'success' ? '✓' : status === 'error' ? '!' : '🛡️'}
              </div>
            </div>

            <h3 className="text-xl font-bold mb-2">
              {status === 'success' ? '¡Verificado!' : 
               status === 'error' ? 'Reintentar' : 
               'Verificación Author'}
            </h3>

            <p className="text-white/50 text-sm mb-8 px-4 leading-relaxed">
              {status === 'success' ? 'Tu identidad humana ha sido confirmada.' :
               status === 'error' ? errorMsg : 
               'Publica de forma oficial usando tu World ID. El proceso es 100% nativo y seguro.'}
            </p>

            {status !== 'success' && (
              <button
                onClick={open}
                className="w-full py-4 px-6 bg-gradient-to-r from-[#00c8ff] to-[#0072ff] h-14 text-white font-bold rounded-2xl transition-all transform active:scale-95 shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-3"
              >
                {status === 'error' ? 'Intentar de Nuevo' : 'Verificar Ahora'}
              </button>
            )}

            {status === 'success' && (
              <div className="text-green-400 text-sm font-medium animate-pulse">
                Identidad confirmada. Procediendo...
              </div>
            )}
          </div>
        )}
      </IDKitRequestWidget>
    </div>
  );
}
