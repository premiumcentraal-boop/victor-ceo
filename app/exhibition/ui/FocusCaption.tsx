import { forwardRef } from "react";
import { motion } from "motion/react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export interface FocusCaptionProps {
  /** The piece's number, from 1. */
  number: number;
  total: number;
  title: string;
  /** The sharp picture is still loading. */
  loading: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
}

/**
 * The caption over a focused picture. It names the piece and offers the controls. The picture itself
 * is the viewer: zoom and pan move the camera, so nothing here covers it.
 */
export const FocusCaption = forwardRef<HTMLHeadingElement, FocusCaptionProps>(function FocusCaption(
  { number, total, title, loading, onPrevious, onNext, onClose },
  titleRef
) {
  const count = `${String(number).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
  return (
    <motion.section
      aria-label="Focused piece"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="pointer-events-none absolute inset-x-0 z-40 flex justify-center px-4"
      style={{ bottom: "max(20px, env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="pointer-events-auto relative flex w-full max-w-[680px] items-center gap-2 rounded-2xl border border-white/15 bg-black/45 px-2 py-2 shadow-2xl backdrop-blur-xl sm:gap-4 sm:px-3">
        <button
          type="button"
          onClick={onPrevious}
          aria-label="Previous piece"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
        >
          <ChevronLeft size={18} />
        </button>

        <div className="flex min-w-0 flex-1 flex-col items-center text-center">
          <span className="text-[10px] font-mono tracking-widest text-cyan-300/80 uppercase">{count}</span>
          <h2
            ref={titleRef}
            tabIndex={-1}
            className="max-w-full truncate text-xl text-white outline-none sm:text-2xl"
            style={{ fontFamily: "'Instrument Serif', serif" }}
          >
            {title}
          </h2>
          <span className="mt-0.5 hidden text-[10px] font-mono tracking-widest text-white/40 uppercase sm:block">
            Scroll or pinch to zoom · Drag to pan · Esc to close
          </span>
          <span className="mt-0.5 text-[10px] font-mono tracking-widest text-white/40 uppercase sm:hidden">
            Pinch to zoom · Swipe down to close
          </span>
        </div>

        <button
          type="button"
          onClick={onNext}
          aria-label="Next piece"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
        >
          <ChevronRight size={18} />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close piece"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
        >
          <X size={18} />
        </button>

        {/* The sharp picture loads behind the preview. This line shows that it is on its way. */}
        <div
          aria-hidden="true"
          className={`absolute inset-x-6 -bottom-px h-px overflow-hidden transition-opacity duration-500 ${loading ? "opacity-100" : "opacity-0"}`}
        >
          <div className="h-full w-1/3 animate-pulse bg-cyan-300/70" />
        </div>
      </div>
    </motion.section>
  );
});
