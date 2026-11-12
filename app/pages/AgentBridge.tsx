import React from "react";
import { ArrowUpRight } from "lucide-react";
import { AGENTBRIDGE_URL, AgentBridgeMark } from "../components/AgentBridgeEntry";

/** The public product lives inside Victor; the studio opens on its own domain. */
export function AgentBridge() {
  return (
    <main className="agentbridge-product-page" aria-label="AgentBridge">
      <div className="agentbridge-product-toolbar">
        <div className="agentbridge-product-identity">
          <AgentBridgeMark size={25} />
          <span>AgentBridge<small>Connect agents worldwide.</small></span>
        </div>
        <div className="agentbridge-product-actions">
          <a href={`${AGENTBRIDGE_URL}/studio/`} target="_blank" rel="noopener noreferrer">
            Control studio <ArrowUpRight size={13} aria-hidden="true" />
          </a>
          <a href={AGENTBRIDGE_URL} target="_blank" rel="noopener noreferrer" className="agentbridge-open-product">
            Open AgentBridge <ArrowUpRight size={13} aria-hidden="true" />
          </a>
        </div>
      </div>
      <iframe
        title="AgentBridge product page"
        src={AGENTBRIDGE_URL}
        referrerPolicy="no-referrer"
        allow="camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
      />
    </main>
  );
}
