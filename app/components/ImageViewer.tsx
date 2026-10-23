import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { X, Maximize, Minimize, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { pictureSrc } from "../exhibition/data/pictures";
import { GestureHint } from "../exhibition/ui/GestureHint";

interface ImageViewerProps {
  src: string;
  index: number;
  onClose: () => void;
  title?: string; // artwork title
}

export function ImageViewer({ src, index, onClose, title }: ImageViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  // High-res version: the same Cloudinary picture, sized for the focus view.
  const hiResSrc = pictureSrc(src, "focus");

  // Clamp pan so image always stays partially visible
  const clampPan = useCallback((px: number, py: number, z: number) => {
    const img = imgRef.current;
    const viewport = viewportRef.current;
    if (!img || !viewport) return { x: px, y: py };

    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const baseW = img.clientWidth;
    const baseH = img.clientHeight;
    const scaledW = baseW * z;
    const scaledH = baseH * z;

    // Allow panning so at least 30% of the image stays visible
    const margin = 0.3;
    const maxX = Math.max(0, (scaledW - vw) / 2 + vw * margin);
    const maxY = Math.max(0, (scaledH - vh) / 2 + vh * margin);

    return {
      x: Math.min(maxX, Math.max(-maxX, px)),
      y: Math.min(maxY, Math.max(-maxY, py)),
    };
  }, []);

  // Re-clamp pan whenever zoom changes
  useEffect(() => {
    if (zoom <= 1) {
      setPan({ x: 0, y: 0 });
    } else {
      setPan((p) => clampPan(p.x, p.y, zoom));
    }
  }, [zoom, clampPan]);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  // Listen for fullscreen exit via Escape
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // Close on Escape (when not fullscreen)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.fullscreenElement) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Scroll to zoom
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation();
    setZoom((z) => Math.min(Math.max(z - e.deltaY * 0.002, 0.8), 8));
  }, []);

  // Pan handlers
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (zoom <= 1) return;
    isPanning.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [zoom]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setPan((p) => clampPan(p.x + dx, p.y + dy, zoom));
  }, [zoom, clampPan]);

  const onPointerUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  // Double-click to toggle zoom
  const onDoubleClick = useCallback(() => {
    if (zoom > 1) {
      resetView();
    } else {
      setZoom(3);
    }
  }, [zoom, resetView]);

  // Entrance timings.
  const entranceDuration = 0.4;
  const entranceDelay = 0.15;
  const imageDelay = 0.1;
  const imageDuration = 0.5;

  return createPortal(
    <AnimatePresence>
      <motion.div
        ref={containerRef}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: entranceDuration, ease: [0.22, 1, 0.36, 1] }}
        className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-3xl flex flex-col"
      >
        {/* ── Top bar ── */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: entranceDelay, duration: entranceDuration }}
          className="relative z-10 flex items-center justify-between px-5 py-4 bg-white/[0.04] border-b border-white/[0.08] backdrop-blur-xl"
        >
          {/* Left: piece info */}
          <div className="flex items-center gap-4">
            <span className="text-xs font-mono text-cyan-300 tracking-widest uppercase">
              {title || `Piece ${String(index + 1).padStart(2, "0")}`}
            </span>
            <span className="text-xs font-mono text-white/60">
              {Math.round(zoom * 100)}%
            </span>
          </div>

          {/* Right: controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setZoom((z) => Math.max(z - 0.5, 0.8))}
              className="p-2.5 rounded-xl text-white/70 hover:text-white hover:bg-white/[0.06] transition-all"
              title="Zoom out"
            >
              <ZoomOut size={16} />
            </button>
            <button
              onClick={() => setZoom((z) => Math.min(z + 0.5, 8))}
              className="p-2.5 rounded-xl text-white/70 hover:text-white hover:bg-white/[0.06] transition-all"
              title="Zoom in"
            >
              <ZoomIn size={16} />
            </button>
            <button
              onClick={resetView}
              className="p-2.5 rounded-xl text-white/70 hover:text-white hover:bg-white/[0.06] transition-all"
              title="Reset view"
            >
              <RotateCcw size={16} />
            </button>

            <div className="w-px h-5 bg-white/10 mx-1" />

            <button
              onClick={toggleFullscreen}
              className="p-2.5 rounded-xl text-white/70 hover:text-white hover:bg-white/[0.06] transition-all"
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
            </button>

            <button
              onClick={onClose}
              className="p-2.5 rounded-xl text-white/70 hover:text-white hover:bg-white/[0.06] transition-all"
              title="Close (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </motion.div>

        {/* ── Image viewport ── */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: imageDelay, duration: imageDuration, ease: [0.22, 1, 0.36, 1] }}
          className="flex-1 overflow-hidden flex items-center justify-center p-6 md:p-12"
          ref={viewportRef}
          style={{ cursor: zoom > 1 ? "grab" : "zoom-in" }}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={onDoubleClick}
        >
          <img
            src={hiResSrc}
            alt={`Gallery piece ${index + 1}`}
            draggable={false}
            ref={imgRef}
            className="max-h-full max-w-full object-contain select-none transition-transform duration-150 ease-out rounded-2xl shadow-2xl shadow-black/60 ring-1 ring-white/[0.08]"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              willChange: "transform",
            }}
          />
        </motion.div>

        {/* On the first piece of a session, the three gestures are shown once, without words. */}
        <GestureHint />
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}