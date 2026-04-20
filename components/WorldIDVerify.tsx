'use client';

import { useState } from 'react';
import { IDKitRequestWidget, orbLegacy, IDKitResult, IDKitErrorCodes } from '@worldcoin/idkit';

interface WorldIDVerifyProps {
  appId: string;
  action: string;
  signal: string;
  onSuccess: (result: IDKitResult) => void;
  onError?: (err: any) => void;
}

/**
 * WorldIDVerify (Opción A: Verificación Humana Pro - Restaurado a Mainnet)
 * Utiliza IDKitRequestWidget en modo controlado para máxima compatibilidad con v4.1.1.
 * Requiere que el backend firme la solicitud (rp_context).
 */
export default function WorldIDVerify({ appId, action, signal, onSuccess, onError }: WorldIDVerifyProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [rpContext, setRpContext] = useState<any>(null);
  const [status, setStatus] = useState<'idle' | 'fetching_signature' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Asegúrate de que esta URL sea la de tu servidor Hono
  const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';

  const handleStartVerification = async () => {
    try {
      setStatus('fetching_signature');
      setErrorMsg(null);

      console.log('[WorldID] Solicitando firma para Mainnet...', { appId, action, signal });

      const response = await fetch(`${SERVER_URL}/api/world-id/rp-context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: appId, action, signal }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Configuración de RP pendiente en el servidor');
      }

      const context = await response.json();
      console.log('[WorldID] Firma de RP recibida');
      
      setRpContext(context);
      setStatus('idle');
      
      // Abrimos el modal nativo ahora que tenemos el rp_context firmado
      setIsOpen(true);

    } catch (err: any) {
      console.error('[WorldID] Error de Preparación:', err);
      setStatus('error');
      setErrorMsg(err.message || 'Error de conexión con el backend');
      onError?.(err);
    }
  };

  const handleSuccess = (result: IDKitResult) => {
    console.log('[WorldID] Verificación Exitosa en Mainnet:', result);
    setStatus('success');
    onSuccess(result);
  };

  const handleError = (errorCode: IDKitErrorCodes) => {
    console.error('[WorldID] Error de World ID:', errorCode);
    setStatus('error');
    setErrorMsg(`Error de World ID: ${errorCode}`);
    onError?.({ code: errorCode });
  };

  return (
    <div className="mt-6">
      {/* 
          IDKitRequestWidget es un componente invisible que se activa cuando open={true}.
          Al estar en Mainnet (Production), el rp_context es MANDATORIO para el bridge nativo.
      */}
      <IDKitRequestWidget
        app_id={appId as `app_${string}`}
        action={action}
        preset={orbLegacy({ signal })}
        rp_context={rpContext}
        open={isOpen}
        onOpenChange={setIsOpen}
        onSuccess={handleSuccess}
        onError={handleError}
        autoClose
        allow_legacy_proofs
      />

      {/* Interfaz de Usuario Premium SciGate */}
      <div className="p-8 text-center bg-white/5 border border-white/10 rounded-[32px] backdrop-blur-xl relative transition-all hover:bg-white/[0.08] shadow-2xl">
        {status === 'fetching_signature' && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm rounded-[32px] flex items-center justify-center z-10">
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-indigo-400 font-bold text-xs uppercase tracking-widest">Firmando Request...</p>
            </div>
          </div>
        )}

        <div className="mb-6 flex justify-center">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl shadow-2xl transition-all duration-500 ${
            status === 'success' ? 'bg-green-500 shadow-green-500/30 scale-110' : 
            status === 'error' ? 'bg-red-500 shadow-red-500/30' : 
            'bg-gradient-to-br from-indigo-500 to-purple-600 shadow-indigo-500/20'
          }`}>
            {status === 'success' ? '✓' : status === 'error' ? '!' : '👤'}
          </div>
        </div>

        <h3 className="text-xl font-bold mb-2 tracking-tight text-white">
          {status === 'success' ? 'Identidad Confirmada' : 
           status === 'error' ? 'Fallo en Verificación' : 
           'Prueba de Humanidad'}
        </h3>

        <p className="text-white/50 text-sm mb-8 px-4 leading-relaxed max-w-xs mx-auto">
          {status === 'success' ? 'Identidad verificada nivel Orb en World Chain.' :
           status === 'error' ? errorMsg : 
           'Para publicar investigación original, debes demostrar que eres humano usando tu World ID.'}
        </p>

        {status !== 'success' && (
          <button
            onClick={handleStartVerification}
            disabled={status === 'fetching_signature'}
            className="w-full py-4 px-6 h-14 bg-white text-black font-black rounded-2xl transition-all transform active:scale-95 shadow-xl flex items-center justify-center gap-3 hover:bg-gray-100"
          >
            {status === 'fetching_signature' ? 'Segurizando...' : 'Verificar con World ID'}
            <img src="https://worldcoin.org/icons/logo-black.svg" alt="W" className="w-5 h-5" />
          </button>
        )}

        {status === 'success' && (
          <div className="py-2 px-4 bg-green-500/20 border border-green-500/30 rounded-xl text-green-400 text-xs font-bold animate-pulse inline-block">
            CONEXIÓN MAINNET ESTABLECIDA
          </div>
        )}

        <div className="mt-8 flex items-center justify-center gap-2 opacity-30 hover:opacity-100 transition-opacity">
          <span className="text-[9px] uppercase tracking-[4px] font-black">Powered by World ID 4.1.1 (Native)</span>
        </div>
      </div>
    </div>
  );
}
