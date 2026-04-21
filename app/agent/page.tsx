'use client';

import { useEffect, useState } from 'react';
import PayLinkCard from '@/components/PayLinkCard';
import AgentControl from '@/components/AgentControl';

interface AgentMetadata {
  id: string;
  title: string;
  author: string;
  priceUsdc: string;
  description: string;
}

/**
 * Global Agent Portal (Search-First Redesign)
 * A premium autonomous research interface with tiered access.
 */
export default function AgentGatePage() {
  const [query, setQuery] = useState('');
  const [isSearched, setIsSearched] = useState(false);
  const [tiers, setTiers] = useState<AgentMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);

  const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    try {
      // Fetch metadata for both tiers
      const [resBasic, resFull] = await Promise.all([
        fetch(`${SERVER_URL}/papers/agent-query/metadata`),
        fetch(`${SERVER_URL}/papers/agent-full/metadata`)
      ]);

      const [basic, full] = await Promise.all([resBasic.json(), resFull.json()]);

      setTiers([
        {
          id: 'agent-query',
          title: 'Quick Inquiry',
          author: basic.author,
          priceUsdc: (Number(basic.pricePerFull) / 1e6).toFixed(2),
          description: 'Get a direct, synthesized answer to your specific prompt.'
        },
        {
          id: 'agent-full',
          title: 'Alpha Researcher',
          author: full.author,
          priceUsdc: (Number(full.pricePerFull) / 1e6).toFixed(2),
          description: 'Unlock the full autonomous agent loop with multi-source synthesis.'
        }
      ]);
      setIsSearched(true);
    } catch (err) {
      console.error('Failed to fetch agent tiers:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#080b14] flex flex-col items-center justify-start p-6 selection:bg-indigo-500/30 overflow-x-hidden relative">
      {/* Background Decorative Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[60%] bg-indigo-500/5 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-20%] left-[-10%] w-[50%] h-[50%] bg-emerald-500/5 rounded-full blur-[120px]"></div>
      </div>

      <div className="w-full max-w-6xl flex flex-col items-center relative z-10 pt-20">
        {!unlocked ? (
          <div className="w-full max-w-4xl flex flex-col items-center">
            {/* Header Section */}
            <div className="text-center mb-16 animate-in fade-in slide-in-from-top-4 duration-1000">
               <span className="text-indigo-400 text-[10px] font-black uppercase tracking-[8px] mb-4 block">SciGate Autonomous Hub</span>
               <h1 className="text-5xl md:text-7xl font-black text-white tracking-tighter mb-6 font-['Space_Grotesk']">
                 Meet <span className="bg-gradient-to-r from-indigo-400 to-emerald-400 bg-clip-text text-transparent">NanoClaw</span>
               </h1>
               <p className="text-white/30 text-lg max-w-xl mx-auto leading-relaxed">
                 The world's first agentic research node secured by x402. High-precision intelligence at the edge.
               </p>
            </div>

            {/* Stage 1: Search Bar */}
            {!isSearched ? (
              <form onSubmit={handleSearch} className="w-full max-w-2xl relative group animate-in fade-in zoom-in duration-700">
                <input 
                   value={query}
                   onChange={(e) => setQuery(e.target.value)}
                   placeholder="Ask anything (e.g. LLM hardware requirements...)"
                   className="w-full h-20 bg-white/[0.03] border border-white/10 rounded-[24px] px-8 text-xl text-white outline-none focus:border-indigo-500/50 focus:bg-white/[0.05] transition-all font-medium placeholder:text-white/10 shadow-2xl"
                />
                <button 
                  type="submit"
                  disabled={loading || !query.trim()}
                  className="absolute right-4 top-4 bottom-4 px-8 bg-white text-black font-black rounded-xl hover:bg-indigo-500 hover:text-white transition-all disabled:opacity-20 text-xs tracking-widest font-['Space_Grotesk']"
                >
                  {loading ? 'SYNCING...' : 'INITIATE'}
                </button>
              </form>
            ) : (
              <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
                 {/* Stage 2: Selection Cards */}
                 {tiers.map((tier) => (
                   <div key={tier.id} className="flex flex-col gap-6">
                      <div className="px-6 py-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                         <h3 className="text-white font-bold font-['Space_Grotesk'] text-sm uppercase tracking-wider">{tier.title}</h3>
                         <p className="text-white/30 text-[11px] mt-1">{tier.description}</p>
                      </div>
                      <PayLinkCard 
                        paperId={tier.id}
                        title={tier.title}
                        author={tier.author}
                        priceUsdc={tier.priceUsdc}
                        serverUrl={SERVER_URL}
                        onUnlock={(sig) => {
                          setSignature(sig);
                          setUnlocked(true);
                        }}
                      />
                   </div>
                 ))}
              </div>
            )}
          </div>
        ) : (
          <div className="w-full animate-in fade-in slide-in-from-bottom-8 duration-1000">
             <div className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/5 pb-12">
                <div>
                   <span className="badge badge-verified mb-4">Secured Session: {signature?.slice(0,10)}...</span>
                   <h2 className="text-4xl font-black text-white font-['Space_Grotesk'] tracking-tight">Investigating: <span className="text-indigo-400">"{query}"</span></h2>
                </div>
                <button onClick={() => window.location.reload()} className="text-[10px] text-white/20 uppercase tracking-[2px] hover:text-white transition-colors">Terminate Session</button>
             </div>
             
             <div className="w-full bg-white/[0.01] border border-white/5 rounded-[40px] p-8 backdrop-blur-3xl shadow-2xl">
                <AgentControl 
                  paymentSignature={signature!} 
                  serverUrl={SERVER_URL} 
                />
             </div>
          </div>
        )}
      </div>

      {/* Footer Branding */}
      <div className="mt-20 py-12 border-t border-white/5 w-full flex flex-col items-center gap-4 opacity-20">
         <span className="text-[10px] font-black tracking-[10px] text-white font-['Space_Grotesk'] uppercase">SciGate x402 Protocol</span>
         <p className="text-[9px] text-white/40 uppercase">Edge AI Node Active in Northern Mexico</p>
      </div>
    </main>
  );
}
