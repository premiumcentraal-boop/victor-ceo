import React from "react";
import { ExternalLink } from "lucide-react";

/** Meridian is its own app, hosted on its own subdomain. This page frames it under the site's header. */
const MERIDIAN_URL = "https://meridian.victor.ceo";

export function Meridian() {
  return (
    <main className="relative z-10 flex-1 w-full flex flex-col bg-[#010101]">
      {/* The bar always offers the plain link, so Meridian stays reachable when a browser refuses the frame. */}
      <div className="flex items-center justify-between gap-4 border-b border-white/10 px-4 lg:px-8 py-2">
        <span className="text-white/70 font-mono text-xs tracking-[0.3em] uppercase">MERIDIAN</span>
        <a
          href={MERIDIAN_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-mono text-white/80 tracking-widest uppercase hover:text-white hover:border-white/20 transition-colors"
        >
          Open Meridian <ExternalLink size={12} aria-hidden="true" />
        </a>
      </div>
      <iframe
        title="Meridian"
        src={MERIDIAN_URL}
        className="block w-full border-0 bg-[#010101]"
        style={{ height: "calc(100dvh - var(--header-h))" }}
      />
    </main>
  );
}
