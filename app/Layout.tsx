import React, { useLayoutEffect, useRef, useState } from "react";
import { Outlet, Link, useLocation } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { Menu, X, Clock, Paintbrush, Radar, Bookmark } from "lucide-react";
import { BackgroundEffect } from "./components/BackgroundEffect";

export function Layout() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  // The exhibition lives at "/", so the exhibition tab is current on the homepage.
  const onExhibition = pathname === "/";

  // Publish the header's real height, so the hero always starts underneath it at every width.
  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const root = document.documentElement;
    const sync = () => root.style.setProperty("--header-h", `${header.offsetHeight}px`);
    sync();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : null;
    observer?.observe(header);
    window.addEventListener("resize", sync);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#010101] text-white font-sans overflow-x-hidden selection:bg-cyan-500/30 flex flex-col relative">
      <BackgroundEffect />

      {/* Top Navigation / App Title */}
      <header
        ref={headerRef}
        className="sticky top-0 z-50 w-full border-b border-white/20 bg-white/[0.03] backdrop-blur-xl shadow-2xl"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="flex justify-between items-center max-w-[1400px] mx-auto px-4 lg:px-8 py-4">
          <Link to="/" className="flex flex-col gap-0.5 group">
             <h1 className="text-white/40 font-mono text-[10px] tracking-[0.3em] uppercase group-hover:text-cyan-400/80 transition-colors">VICTOR.CEO</h1>
             <div className="flex items-center gap-2">
               <div className="w-1.5 h-1.5 bg-green-500 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.8)] animate-pulse" />
               <span className="text-white/80 font-mono text-[11px] tracking-widest">SYSTEM ONLINE</span>
             </div>
          </Link>

          <div className="hidden md:flex gap-4">
            <Link to="/radar" className="px-5 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-md text-[10px] font-mono text-white/30 hover:text-white/40 hover:bg-white/10 hover:border-white/20 transition-all flex items-center gap-2 tracking-widest uppercase shadow-[0_4px_14px_rgba(0,0,0,0.1)]">
              <Radar size={12} className="text-cyan-400/40" /> RADAR
            </Link>
            <Link to="/watchlist" className="px-5 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-md text-[10px] font-mono text-white/30 hover:text-white/40 hover:bg-white/10 hover:border-white/20 transition-all flex items-center gap-2 tracking-widest uppercase shadow-[0_4px_14px_rgba(0,0,0,0.1)]">
              <Bookmark size={12} className="text-cyan-400/40" /> WATCHLIST
            </Link>
            <Link to="/" aria-current={onExhibition ? "page" : undefined} className="px-5 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-md text-[10px] font-mono text-white/60 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all flex items-center gap-2 tracking-widest uppercase shadow-[0_4px_14px_rgba(0,0,0,0.1)]">
              <Paintbrush size={12} className="text-cyan-400" /> THE EXHIBITION
            </Link>
            <Link to="/pre-release" className="px-5 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-md text-[10px] font-mono text-white/60 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all flex items-center gap-2 tracking-widest uppercase shadow-[0_4px_14px_rgba(0,0,0,0.1)]">
              <Clock size={12} className="text-orange-500" /> PRE-RELEASE
            </Link>
            <Link to="/lab" className="px-5 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-md text-[10px] font-mono text-white/30 hover:text-white/40 hover:bg-white/10 hover:border-white/20 transition-all flex items-center gap-2 tracking-widest uppercase shadow-[0_4px_14px_rgba(0,0,0,0.1)]">
              <span className="text-cyan-400/40">{"<"}</span> BACK TO LAB
            </Link>
          </div>

          <button
            className="md:hidden p-2 text-white/70 hover:text-white transition-colors"
            onClick={() => setIsMenuOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={24} />
          </button>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm md:hidden"
              onClick={() => setIsMenuOpen(false)}
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 w-64 z-[70] bg-white/[0.03] backdrop-blur-xl border-l border-white/20 shadow-2xl md:hidden flex flex-col p-6"
            >
              <div className="flex justify-end mb-8">
                <button
                  onClick={() => setIsMenuOpen(false)}
                  className="p-2 text-white/70 hover:text-white rounded-full bg-white/5 border border-white/10 transition-all"
                  aria-label="Close menu"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="flex flex-col gap-4">
                <Link to="/radar" onClick={() => setIsMenuOpen(false)} className="w-full px-5 py-3 rounded-xl border border-white/10 bg-white/5 text-[11px] font-mono text-white/40 hover:text-white/50 hover:bg-white/10 transition-all flex items-center gap-3 tracking-widest uppercase text-left">
                  <Radar size={14} className="text-cyan-400/40 shrink-0" /> RADAR
                </Link>
                <Link to="/watchlist" onClick={() => setIsMenuOpen(false)} className="w-full px-5 py-3 rounded-xl border border-white/10 bg-white/5 text-[11px] font-mono text-white/40 hover:text-white/50 hover:bg-white/10 transition-all flex items-center gap-3 tracking-widest uppercase text-left">
                  <Bookmark size={14} className="text-cyan-400/40 shrink-0" /> WATCHLIST
                </Link>
                <Link to="/" onClick={() => setIsMenuOpen(false)} aria-current={onExhibition ? "page" : undefined} className="w-full px-5 py-3 rounded-xl border border-white/10 bg-white/5 text-[11px] font-mono text-white/80 hover:text-white hover:bg-white/10 transition-all flex items-center gap-3 tracking-widest uppercase text-left">
                  <Paintbrush size={14} className="text-cyan-400 shrink-0" /> THE EXHIBITION
                </Link>
                <Link to="/pre-release" onClick={() => setIsMenuOpen(false)} className="w-full px-5 py-3 rounded-xl border border-white/10 bg-white/5 text-[11px] font-mono text-white/80 hover:text-white hover:bg-white/10 transition-all flex items-center gap-3 tracking-widest uppercase text-left">
                  <Clock size={14} className="text-orange-500" /> PRE-RELEASE
                </Link>
                <Link to="/lab" onClick={() => setIsMenuOpen(false)} className="w-full px-5 py-3 rounded-xl border border-white/10 bg-white/5 text-[11px] font-mono text-white/40 hover:text-white/50 hover:bg-white/10 transition-all flex items-center gap-3 tracking-widest uppercase text-left">
                  <span className="text-cyan-400/40">{"<"}</span> BACK TO LAB
                </Link>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <Outlet />
    </div>
  );
}
