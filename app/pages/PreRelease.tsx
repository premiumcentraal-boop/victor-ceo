import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Sparkles, Send } from "lucide-react";
import { LiquidGlassEffect } from "../components/LiquidGlassEffect";

export function PreRelease() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      setSubmitted(true);
      // Actual submission logic would go here
    }
  };

  return (
    <>
      <LiquidGlassEffect />
      <main className="relative z-10 flex-1 w-full max-w-4xl mx-auto px-4 lg:px-8 py-32 flex flex-col items-center justify-center pointer-events-none">
        {/* Main Glass Panel mimicking the Active Topic Panel */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full relative bg-white/[0.03] backdrop-blur-xl border border-white/20 shadow-2xl rounded-[3rem] p-8 lg:p-10 pointer-events-auto"
        >
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none rounded-[3rem]" />

        <div className="flex flex-col gap-6 relative z-10">
          <div className="flex-1 w-full">
            <div className="flex items-center justify-between mb-3">
              <h1 className="text-cyan-400 font-mono text-xs uppercase tracking-[0.2em] flex items-center gap-2">
                <Sparkles size={14} />
                Exclusive access
              </h1>
            </div>
            
            <h2 className="text-3xl md:text-4xl font-light text-white mb-3">Exclusive access to new AI builds and art</h2>
            <p className="text-white/50 text-sm md:text-base font-light mb-8 max-w-xl">
              Be first to explore experimental AI builds, private releases, and new artwork before they are shared publicly.
            </p>
            
            <AnimatePresence mode="wait">
              {!submitted ? (
                <motion.form 
                  key="form"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onSubmit={handleSubmit}
                  className="relative mt-6 group flex flex-col md:flex-row gap-4"
                >
                  <div className="relative flex-1">
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email..."
                      className="w-full bg-black/20 backdrop-blur-2xl border border-cyan-500/30 rounded-2xl py-4 pl-12 pr-6 text-white outline-none focus:border-cyan-400 focus:shadow-[0_0_30px_rgba(34,211,238,0.2)] transition-all font-light placeholder:text-white/30"
                    />
                    <div className="absolute left-4 top-1/2 -translate-y-1/2">
                      <motion.div 
                        animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="w-3 h-3 rounded-full bg-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.8)]"
                      />
                    </div>
                  </div>
                  <button 
                    type="submit"
                    className="w-full md:w-auto px-8 py-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/50 text-cyan-400 text-base font-medium hover:bg-cyan-500/20 hover:shadow-[0_0_20px_rgba(34,211,238,0.4)] transition-all flex items-center justify-center gap-3 whitespace-nowrap"
                  >
                    <Send size={20} />
                    Request access
                  </button>
                </motion.form>
              ) : (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-12 flex justify-center w-full"
                >
                  <div className="group flex flex-col md:flex-row relative drop-shadow-[0_0_30px_rgba(255,255,255,0.05)] hover:gap-6 active:gap-6 transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] cursor-grab active:cursor-grabbing max-w-full">
                    
                    {/* Main Ticket */}
                    <div className="relative w-full md:w-[380px] h-[270px] bg-white/[0.08] backdrop-blur-2xl border border-white/20 border-b-transparent group-hover:border-b-white/20 active:border-b-white/20 md:border-b-white/20 md:border-r-transparent md:group-hover:border-r-white/20 md:active:border-r-white/20 p-8 rounded-t-[1.5rem] rounded-b-none md:rounded-[1.5rem_0_0_1.5rem] flex flex-col justify-between overflow-hidden shadow-xl z-10 transition-colors duration-700">
                      <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none" />
                      
                      <header className="relative flex justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-white/50">
                        <span>A/W 2026</span>
                        <span className="text-cyan-400">No. {Math.floor(100000 + Math.random() * 900000)}</span>
                      </header>

                      <div className="relative">
                        <h1 className="font-sans font-light text-4xl leading-none text-white tracking-tight mb-3">AI &amp;<br/>ART</h1>
                        <p className="font-mono text-[10px] tracking-widest text-cyan-400/80 uppercase">Exclusive access</p>
                      </div>

                      <footer className="relative flex justify-between gap-4 border-t border-white/10 pt-4">
                        <div className="flex flex-col gap-1">
                          <span className="font-mono text-[8px] uppercase tracking-widest text-white/40">Release date</span>
                          <span className="font-mono text-sm text-white">7 April</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="font-mono text-[8px] uppercase tracking-widest text-white/40">Time</span>
                          <span className="font-mono text-sm text-white">11:07</span>
                        </div>
                        <div className="flex flex-col gap-1 text-right">
                          <span className="font-mono text-[8px] uppercase tracking-widest text-white/40">Admit</span>
                          <span className="font-mono text-sm text-white">ONE</span>
                        </div>
                      </footer>

                      {/* Perforation Line (only visual here) */}
                      <div className="hidden md:block absolute right-[0px] top-10 bottom-10 w-[2px] bg-[linear-gradient(to_bottom,transparent_50%,rgba(255,255,255,0.4)_50%)] bg-[length:100%_12px] opacity-100 group-hover:opacity-0 transition-opacity duration-300" />
                      <div className="md:hidden absolute bottom-[0px] left-10 right-10 h-[2px] bg-[linear-gradient(to_right,transparent_50%,rgba(255,255,255,0.4)_50%)] bg-[length:12px_100%] opacity-100 group-hover:opacity-0 transition-opacity duration-300" />
                    </div>

                    {/* Ticket Stub */}
                    <div className="relative w-full md:w-[140px] h-[100px] md:h-[270px] bg-white/[0.08] backdrop-blur-2xl border border-white/20 border-t-transparent group-hover:border-t-white/20 active:border-t-white/20 md:border-t-white/20 md:border-l-transparent md:group-hover:border-l-white/20 md:active:border-l-white/20 px-4 md:px-6 py-4 md:py-6 rounded-b-[1.5rem] rounded-t-none md:rounded-[0_1.5rem_1.5rem_0] flex flex-row md:flex-col items-center justify-between gap-3 overflow-hidden shadow-xl transition-colors duration-700">
                      <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none" />
                      
                      {/* Foil Seal / Holographic Star equivalent */}
                      <div className="relative min-w-[32px] min-h-[32px] md:min-w-[40px] md:min-h-[40px] rounded-full bg-gradient-to-tr from-white/40 via-cyan-400/20 to-white/10 border border-white/30 shadow-[0_0_15px_rgba(255,255,255,0.2)] flex items-center justify-center overflow-hidden shrink-0">
                        <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent_0%,rgba(255,255,255,0.8)_50%,transparent_100%)] opacity-50 [background-size:200%_200%] animate-[shimmer_3s_infinite_linear]" />
                        <div className="w-4 h-4 md:w-5 md:h-5 rounded-full border border-white/40 flex items-center justify-center backdrop-blur-md">
                          <div className="w-1 h-1 md:w-1.5 md:h-1.5 bg-cyan-300 rounded-full shadow-[0_0_8px_rgba(103,232,249,0.8)]" />
                        </div>
                      </div>

                      {/* Procedural Barcode */}
                      <div className="relative w-[80px] md:w-[32px] h-[24px] md:h-[60px] opacity-60 mix-blend-overlay shrink-0" style={{ background: "repeating-linear-gradient(90deg, rgba(255,255,255,0.9), rgba(255,255,255,0.9) 2px, transparent 2px, transparent 4px, rgba(255,255,255,0.9) 4px, rgba(255,255,255,0.9) 5px, transparent 5px, transparent 8px)" }} />

                      <p className="font-mono text-[10px] font-bold tracking-[0.2em] md:tracking-[0.25em] text-cyan-400 [writing-mode:horizontal-tb] md:[writing-mode:vertical-rl] md:rotate-180 whitespace-nowrap shrink-0 overflow-visible z-10">
                        VIP ACCESS
                      </p>
                    </div>
                  </div>
                  
                  <style dangerouslySetInnerHTML={{__html: `
                    @keyframes shimmer {
                      0% { background-position: 200% 0; }
                      100% { background-position: -200% 0; }
                    }
                  `}} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
      </main>
    </>
  );
}
