import { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { GalaxyHero } from "../exhibition/GalaxyHero";
import type { OpenArea } from "../exhibition/camera/framing";
import { FocusCaption } from "../exhibition/ui/FocusCaption";
import { GestureHint } from "../exhibition/ui/GestureHint";
import { galleryPictures as galleryImages, pictureSrc } from "../exhibition/data/pictures";
import { loadVisited, saveVisited } from "../exhibition/state/visited";
import { markIntroPlayed, shouldPlayIntro } from "../exhibition/state/intro";
import { AnimatePresence, motion, useMotionValueEvent, useScroll, useTransform } from "motion/react";
import { ImageViewer } from "../components/ImageViewer";
import { useReducedMotion } from "../hooks/useReducedMotion";

/** The one scrim behind the galaxy: a vignette, and a darker top so the headline reads over any picture. */
const GALAXY_SCRIM =
  "radial-gradient(ellipse at center, transparent 40%, rgba(1,1,1,0.7) 100%), linear-gradient(to bottom, rgba(1,1,1,0.7) 0%, transparent 30%)";
/** The scrim behind a piece's caption in the grid. */
const CARD_SCRIM = "linear-gradient(to top, rgba(1,1,1,0.85) 0%, rgba(1,1,1,0.4) 45%, transparent 75%)";
const TOTAL_LABEL = (n: number) => String(n).padStart(2, "0");

export function TheExhibition() {
  // The flat viewer: the grid, and any device without WebGL.
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [showViewer, setShowViewer] = useState(false);
  // The galaxy's focused picture, and whether it has arrived.
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [arrived, setArrived] = useState(false);
  const [hiResLoading, setHiResLoading] = useState(false);
  const [flatMode, setFlatMode] = useState(false);
  const [visited, setVisited] = useState<Set<number>>(() => loadVisited());
  const captionTitleRef = useRef<HTMLHeadingElement>(null);
  // The latest focused piece, for handlers that run from the galaxy's own frame loop.
  const focusedRef = useRef<number | null>(null);
  focusedRef.current = focusedIndex;

  // Stable references: the galaxy only rebuilds when these change, never on a re-render.
  const imageUrls = useMemo(() => galleryImages.map(g => pictureSrc(g.url, "scene")), []);
  const focusUrls = useMemo(() => galleryImages.map(g => pictureSrc(g.url, "focus")), []);
  const galleryTitles = useMemo(() => galleryImages.map(g => g.title), []);
  const gridUrls = useMemo(() => galleryImages.map(g => pictureSrc(g.url, "grid")), []);

  // ── Scroll scene ──
  // The hero is a scene the page scrolls through. The stage stays pinned while the scroll moves the camera.
  const sceneRef = useRef<HTMLElement>(null);
  const headlineRef = useRef<HTMLDivElement>(null);
  const cueRef = useRef<HTMLDivElement>(null);
  // The band between the headline and the scroll cue: where a portrait galaxy rests. Measured, not guessed,
  // so a long headline on a small phone pushes the galaxy down rather than under the text.
  const [openArea, setOpenArea] = useState<OpenArea | null>(null);
  useLayoutEffect(() => {
    const stage = sceneRef.current?.firstElementChild as HTMLElement | null | undefined;
    const headline = headlineRef.current;
    const cue = cueRef.current;
    if (!stage || !headline || !cue) return;
    // offsetTop is read from the layout, so the entrance and scroll transforms do not move the measure.
    const measure = () => {
      const dock = cue.offsetParent as HTMLElement | null;
      setOpenArea({ top: headline.offsetTop + headline.offsetHeight, bottom: (dock?.offsetTop ?? 0) + cue.offsetTop });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    observer.observe(headline);
    observer.observe(cue);
    return () => observer.disconnect();
  }, []);
  const reducedMotion = useReducedMotion();
  // The first visit of a session opens with the camera pulling in. Reduced motion and repeat visits skip it.
  const [intro] = useState(() => !reducedMotion && shouldPlayIntro());
  // The veil is taken out of the page once it has faded, so it costs nothing for the rest of the visit.
  const [veiled, setVeiled] = useState(intro);
  useEffect(() => {
    if (intro) markIntroPlayed();
  }, [intro]);
  // Read by the galaxy's render loop every frame. A ref, so scrolling never re-renders React.
  const scrollProgressRef = useRef(0);
  const { scrollYProgress } = useScroll({ target: sceneRef, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (value) => {
    scrollProgressRef.current = value;
  });
  const headlineOpacity = useTransform(scrollYProgress, [0, 0.45], [1, 0]);
  const headlineY = useTransform(scrollYProgress, [0, 0.45], [0, -48]);
  const cueOpacity = useTransform(scrollYProgress, [0, 0.12], [1, 0]);

  // Brings the galaxy into view before a flight, unless it already is. Resolves when the scroll settles.
  const scrollToGalaxy = useCallback((): Promise<void> => {
    const scene = sceneRef.current;
    const stage = scene?.firstElementChild as HTMLElement | null | undefined;
    if (!scene || !stage) return Promise.resolve();
    const sceneTop = scene.getBoundingClientRect().top + window.scrollY;
    const travel = scene.offsetHeight - stage.offsetHeight;
    if (window.scrollY >= sceneTop - 1 && window.scrollY <= sceneTop + travel + 1) return Promise.resolve();
    return new Promise((resolve) => {
      const finish = () => {
        window.removeEventListener("scrollend", finish);
        window.clearTimeout(fallback);
        resolve();
      };
      // scrollend is not in every browser, so a timer settles the wait as well.
      const fallback = window.setTimeout(finish, 1400);
      window.addEventListener("scrollend", finish);
      window.scrollTo({ top: sceneTop, behavior: reducedMotion ? "auto" : "smooth" });
    });
  }, [reducedMotion]);

  // ── The galaxy's events ──
  // A tap on a picture: the galaxy flies to it, unless the flat viewer is the only option.
  const handleSphereClick = useCallback((i: number) => {
    if (flatMode) {
      setViewerIndex(i);
      setShowViewer(true);
      return;
    }
    setArrived(false);
    setFocusedIndex(i);
  }, [flatMode]);

  const handleArrive = useCallback((i: number) => {
    setArrived(true);
    setVisited(prev => {
      if (prev.has(i)) return prev;
      const next = new Set(prev).add(i);
      saveVisited(next);
      return next;
    });
  }, []);

  const handleFlyOutComplete = useCallback(() => {
    setArrived(false);
  }, []);

  const handleRequestClose = useCallback(() => {
    setArrived(false);
    setFocusedIndex(null);
  }, []);

  // Previous and next keep the same focused view and move the camera to the neighbour.
  const handleStep = useCallback((direction: -1 | 1) => {
    const current = focusedRef.current;
    if (current === null) return;
    const count = galleryImages.length;
    setArrived(false);
    setFocusedIndex((current + direction + count) % count);
  }, []);

  const handleHiResState = useCallback((_index: number, state: "loading" | "ready") => {
    setHiResLoading(state === "loading");
  }, []);

  const handleUnsupported = useCallback(() => setFlatMode(true), []);

  // When a piece arrives, the caption takes focus, so a keyboard user can use it straight away.
  useEffect(() => {
    if (arrived) captionTitleRef.current?.focus({ preventScroll: true });
  }, [arrived]);

  // A grid click takes the visitor to the galaxy, and flies the camera to that piece, as a tap in the sky does.
  const handleGridClick = useCallback((i: number) => {
    if (flatMode) {
      setViewerIndex(i);
      setShowViewer(true);
      return;
    }
    scrollToGalaxy().then(() => handleSphereClick(i));
  }, [flatMode, scrollToGalaxy, handleSphereClick]);

  // User closes the flat viewer.
  const handleViewerClose = useCallback(() => {
    setShowViewer(false);
    setViewerIndex(null);
  }, []);

  return (
    <main className="relative z-10 flex-1 w-full flex flex-col">
      {/* ═══ HERO: THE GALAXY. The page scrolls through this scene while the stage stays pinned. ═══ */}
      <section ref={sceneRef} aria-label="The galaxy" className="relative w-full h-[260svh] -mt-[var(--header-h)]">
        <div className="sticky top-0 w-full h-[100svh] overflow-hidden">
          {/* Overlay text */}
          <motion.div
            ref={headlineRef}
            style={{ opacity: headlineOpacity, y: headlineY }}
            className="absolute top-24 left-0 right-0 z-10 p-6 pointer-events-none"
          >
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={focusedIndex !== null ? { opacity: 0, y: -20 } : { opacity: 1, y: 0 }}
              transition={{ duration: focusedIndex !== null ? 0.8 : 1.2, ease: [0.22, 1, 0.36, 1] }}
              className="max-w-[750px] mx-auto text-white text-center px-6 md:text-6xl text-4xl text-balance tracking-tight font-normal leading-[1.15]"
              style={{ fontFamily: "'Instrument Serif', serif" }}
            >
              Our stories are united. They live on beyond the walls and doors of our souls. There is only one take. Capture yours.
            </motion.h1>
          </motion.div>

          {/* The scrim behind the headline and the galaxy */}
          <div className="absolute inset-0 z-[5] pointer-events-none" style={{ background: GALAXY_SCRIM }} />

          {/* The galaxy: its own nebula, disc and pictures */}
          <div className="absolute inset-0 z-[3]">
            <GalaxyHero
              images={imageUrls}
              focusImages={focusUrls}
              titles={galleryTitles}
              visited={visited}
              focusedIndex={focusedIndex}
              onImageClick={handleSphereClick}
              onArrive={handleArrive}
              onFlyOutComplete={handleFlyOutComplete}
              onRequestClose={handleRequestClose}
              onStep={handleStep}
              onHiResState={handleHiResState}
              onUnsupported={handleUnsupported}
              scrollProgressRef={scrollProgressRef}
              intro={intro}
              reducedMotion={reducedMotion}
              openArea={openArea}
            />
          </div>

          {/* The first-visit opening: the galaxy comes out of black as the camera pulls in */}
          {veiled && (
            <motion.div
              aria-hidden="true"
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              onAnimationComplete={() => setVeiled(false)}
              transition={{ duration: 2.4, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="pointer-events-none absolute inset-0 z-[6] bg-[#010101]"
            />
          )}

          {/* The bottom dock: the scroll cue. Scrolling is how the visitor moves through the galaxy. */}
          <div className="absolute inset-x-0 bottom-[4%] z-30 flex flex-col items-center gap-5 pointer-events-none">
            {/* The cue is a handle for one-finger scrolling: a touch here scrolls the scene, as it does on any page. */}
            <motion.div ref={cueRef} style={{ opacity: cueOpacity }} className="pointer-events-auto touch-pan-y -my-3 py-3">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: focusedIndex !== null ? 0 : 1 }}
                transition={{ delay: focusedIndex !== null ? 0 : 2, duration: focusedIndex !== null ? 0.5 : 1 }}
                className="flex flex-col items-center gap-2"
              >
                <span className="text-xs font-mono text-white/60 tracking-widest uppercase">Scroll to explore</span>
                <motion.div
                  animate={reducedMotion ? undefined : { y: [0, 6, 0] }}
                  transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
                  className="w-4 h-7 rounded-full border border-white/30 flex items-start justify-center p-1"
                >
                  <div className="w-1 h-1.5 rounded-full bg-white/60" />
                </motion.div>
              </motion.div>
            </motion.div>
          </div>

          {/* The focused piece's caption. The picture is the viewer; this only names it and offers the controls. */}
          <AnimatePresence>
            {focusedIndex !== null && arrived && !flatMode && (
              <FocusCaption
                key="focus-caption"
                ref={captionTitleRef}
                number={focusedIndex + 1}
                total={galleryImages.length}
                title={galleryImages[focusedIndex].title}
                loading={hiResLoading}
                onPrevious={() => handleStep(-1)}
                onNext={() => handleStep(1)}
                onClose={handleRequestClose}
              />
            )}
          </AnimatePresence>

          {/* On the first piece of a session, the three gestures are shown once, without words. */}
          {focusedIndex !== null && arrived && !flatMode && <GestureHint />}
        </div>
      </section>

      {/* ═══ GALLERY GRID ═══════════════════════════════════════════ */}
      <section className="relative w-full max-w-[1400px] mx-auto px-4 lg:px-8 py-24">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <h2
            className="text-3xl md:text-5xl text-white/90 tracking-tight mb-4"
            style={{ fontFamily: "'Instrument Serif', serif" }}
          >
            The Gallery
          </h2>
          <p className="text-xs font-mono text-white/60 tracking-[0.2em] uppercase">
            A curated collection of experiences
          </p>
        </motion.div>

        {/* Each card is a button: a tap or Enter flies the galaxy to that piece, as a tap in the sky does. */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {galleryImages.map((img, i) => (
            <motion.button
              key={img.title}
              type="button"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.6, delay: i * 0.08 }}
              onClick={() => handleGridClick(i)}
              className="group relative block w-full aspect-[1754/2481] overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02] text-left cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
            >
              {/* The caption names the piece, so the picture is decoration for screen readers. */}
              <img
                src={gridUrls[i]}
                alt=""
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                loading="lazy"
                crossOrigin="anonymous"
              />
              <span aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ background: CARD_SCRIM }} />
              <span className="absolute top-3 left-3 text-xs font-mono tracking-widest text-white/80">
                {TOTAL_LABEL(i + 1)} / {TOTAL_LABEL(galleryImages.length)}
              </span>
              {visited.has(i) && (
                <span className="absolute top-3 right-3 rounded-full border border-amber-200/40 bg-black/40 px-2.5 py-1 text-xs font-mono tracking-widest text-amber-100 uppercase backdrop-blur-md">
                  Viewed
                </span>
              )}
              <span
                className="absolute bottom-4 left-4 right-4 text-xl leading-tight text-white"
                style={{ fontFamily: "'Instrument Serif', serif" }}
              >
                {img.title}
              </span>
            </motion.button>
          ))}
        </div>
      </section>

      {/* ═══ FLAT IMAGE VIEWER: the grid, and devices without WebGL ═══════════════ */}
      <AnimatePresence>
        {showViewer && viewerIndex !== null && (
          <ImageViewer
            key={viewerIndex}
            src={galleryImages[viewerIndex].url}
            index={viewerIndex}
            title={galleryImages[viewerIndex].title}
            onClose={handleViewerClose}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
