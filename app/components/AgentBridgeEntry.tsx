import React from "react";
import { Link, useLocation } from "react-router";
import { ArrowRight, ArrowUpRight } from "lucide-react";

export const AGENTBRIDGE_URL = "https://agentbridge.victor.ceo";

export function AgentBridgeMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <path d="M19 11a8 8 0 1 0 0 14l7-4a8 8 0 1 0-8-14l-8 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="m13 21 10-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function AgentBridgeEntry({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const current = pathname === "/agentbridge" || pathname.startsWith("/agentbridge/");

  if (mobile) {
    return (
      <div className={`agentbridge-menu-card ${current ? "is-current" : ""}`}>
        <Link to="/agentbridge" aria-label="AGENTBRIDGE" aria-current={current ? "page" : undefined} onClick={onNavigate} className="agentbridge-menu-product">
          <span className="agentbridge-menu-mark"><AgentBridgeMark size={29} /></span>
          <span><strong>AgentBridge</strong><small>Connect agents worldwide.</small></span>
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
        <a className="agentbridge-menu-studio" href={`${AGENTBRIDGE_URL}/studio/`} target="_blank" rel="noopener noreferrer" onClick={onNavigate}>
          Open studio <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </div>
    );
  }

  return (
    <Link to="/agentbridge" aria-label="AGENTBRIDGE" aria-current={current ? "page" : undefined} onClick={onNavigate} title="AgentBridge · Connect agents worldwide" className={`agentbridge-nav-entry ${current ? "is-current" : ""}`}>
      <AgentBridgeMark size={19} /><span>AGENTBRIDGE</span><ArrowRight size={12} aria-hidden="true" />
    </Link>
  );
}
