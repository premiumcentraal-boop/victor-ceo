import React from "react";
import { ExternalLink } from "lucide-react";

const AGENTBRIDGE_URL = "https://agentbridge.victor.ceo";

/** Public product page in Victor; private studio navigation opens at the top level. */
export function AgentBridge() {
  return (
    <main className="relative z-10 flex-1 w-full flex flex-col bg-[#0a0e0c]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 lg:px-8 py-2">
        <span className="text-white/70 font-mono text-xs tracking-[0.2em] uppercase">AGENTBRIDGE</span>
        <div className="flex items-center gap-4">
          <a href={`${AGENTBRIDGE_URL}/studio/`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-xs font-mono text-lime-200/80 hover:text-lime-100 transition-colors">
            Control studio <ExternalLink size={12} aria-hidden="true" />
          </a>
          <a href={AGENTBRIDGE_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-mono text-white/80 tracking-widest uppercase hover:text-white hover:border-white/20 transition-colors">
            Open AgentBridge <ExternalLink size={12} aria-hidden="true" />
          </a>
        </div>
      </div>
      <iframe title="AgentBridge product page" src={AGENTBRIDGE_URL} className="block w-full flex-1 border-0 bg-[#0a0e0c]" style={{ minHeight: "calc(100dvh - var(--header-h) - 52px)" }} />
    </main>
  );
}
