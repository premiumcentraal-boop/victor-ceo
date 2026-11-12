import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Outlet, Link, useLocation } from "react-router";
import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X, Clock, Paintbrush, Globe } from "lucide-react";
import { BackgroundEffect } from "./components/BackgroundEffect";
import { AgentBridgeEntry } from "./components/AgentBridgeEntry";

const primaryLinks = [
  { to: "/", label: "THE EXHIBITION", Icon: Paintbrush, iconClass: "text-cyan-400" },
  { to: "/pre-release", label: "PRE-RELEASE", Icon: Clock, iconClass: "text-orange-500" },
  { to: "/meridian", label: "MERIDIAN", Icon: Globe, iconClass: "text-cyan-400" },
];

export function Layout() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const isCurrent = (path: string) => pathname === path || (path !== "/" && pathname.startsWith(`${path}/`));
  const onMeridian = isCurrent("/meridian");
  const onAgentBridge = isCurrent("/agentbridge");

  // Publish the header's real height, so product pages fit below it at every width.
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

  useEffect(() => { setIsMenuOpen(false); }, [pathname]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1280px)");
    const closeOnDesktop = () => { if (desktop.matches) setIsMenuOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  return (
    <Dialog.Root open={isMenuOpen} onOpenChange={setIsMenuOpen}>
      <div className="min-h-screen bg-[#010101] text-white font-sans overflow-x-clip selection:bg-cyan-500/30 flex flex-col relative">
        {pathname !== "/" && !onMeridian && !onAgentBridge && <BackgroundEffect />}

        <header
          ref={headerRef}
          className="sticky top-0 z-50 w-full border-b border-white/20 bg-white/[0.03] backdrop-blur-xl shadow-2xl"
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          <div className="flex justify-between items-center max-w-[1400px] mx-auto px-4 lg:px-8 py-4">
            <Link to="/" className="flex flex-col gap-0.5 group">
              <h1 className="text-white/70 font-mono text-xs tracking-[0.3em] uppercase group-hover:text-cyan-400 transition-colors">VICTOR.CEO</h1>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.8)] animate-pulse" />
                <span className="text-white/80 font-mono text-xs tracking-widest">SYSTEM ONLINE</span>
              </div>
            </Link>

            <nav aria-label="Main navigation" className="hidden xl:flex items-center gap-3">
              {primaryLinks.map(({ to, label, Icon, iconClass }) => (
                <Link key={to} to={to} aria-current={isCurrent(to) ? "page" : undefined} className={`px-5 py-2 rounded-full border bg-white/5 backdrop-blur-md text-xs font-mono hover:text-white hover:bg-white/10 hover:border-white/20 transition-all flex items-center gap-2 tracking-widest uppercase shadow-[0_4px_14px_rgba(0,0,0,0.1)] ${isCurrent(to) ? "border-white/30 text-white" : "border-white/10 text-white/70"}`}>
                  <Icon size={12} className={iconClass} aria-hidden="true" /> {label}
                </Link>
              ))}
              <AgentBridgeEntry />
            </nav>

            <Dialog.Trigger asChild>
              <button className="xl:hidden p-2 text-white/70 hover:text-white transition-colors" aria-label="Open menu">
                <Menu size={24} aria-hidden="true" />
              </button>
            </Dialog.Trigger>
          </div>
        </header>

        <Outlet />
      </div>

      <Dialog.Portal>
        <Dialog.Overlay className="victor-menu-overlay" />
        <Dialog.Content className="victor-mobile-menu" aria-describedby={undefined}>
          <div className="victor-menu-heading">
            <Dialog.Title>Explore Victor</Dialog.Title>
            <Dialog.Close asChild>
              <button className="victor-menu-close" aria-label="Close menu"><X size={20} aria-hidden="true" /></button>
            </Dialog.Close>
          </div>
          <nav aria-label="Mobile navigation" className="victor-menu-links">
            {primaryLinks.map(({ to, label, Icon, iconClass }, index) => (
              <React.Fragment key={to}>
                {index === 2 && <span className="victor-menu-section">PRODUCTS</span>}
                <Link to={to} onClick={() => setIsMenuOpen(false)} aria-current={isCurrent(to) ? "page" : undefined}>
                  <Icon size={15} className={iconClass} aria-hidden="true" /> {label}
                </Link>
              </React.Fragment>
            ))}
            <AgentBridgeEntry mobile onNavigate={() => setIsMenuOpen(false)} />
          </nav>
          <span className="victor-menu-footer">VICTOR.CEO</span>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
