import React, { useState, useCallback, useMemo, useRef } from "react";
import { GalaxyHero } from "../exhibition/GalaxyHero";
import { galleryPictures as galleryImages, pictureSrc } from "../exhibition/data/pictures";
import { AnimatePresence, motion, useMotionValueEvent, useScroll, useTransform } from "motion/react";
import { ImageViewer } from "../components/ImageViewer";
import { useReducedMotion } from "../hooks/useReducedMotion";

export function TheExhibition() {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [showViewer, setShowViewer] = useState(false);
  const [immersed, setImmersed] = useState(false);

  // Stable reference — prevents Three.js scene from remounting on every render
  const imageUrls = useMemo(() => galleryImages.map(g => pictureSrc(g.url, "scene")), []);

  // ── Scroll scene ──
  // The hero is a scene the page scrolls through. The stage stays pinned while the scroll moves the camera.
  const sceneRef = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();
  // Read by the galaxy's render loop every frame. A ref, so scrolling never re-renders React.
  const scrollProgressRef = useRef(0);
  const immersedRef = useRef(false);
  const { scrollYProgress } = useScroll({ target: sceneRef, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (value) => {
    scrollProgressRef.current = value;
    // React only hears about the switch between the two states, not every scroll frame.
    const next = value > 0.9;
    if (next !== immersedRef.current) {
      immersedRef.current = next;
      setImmersed(next);
    }
  });
  const headlineOpacity = useTransform(scrollYProgress, [0, 0.45], [1, 0]);
  const headlineY = useTransform(scrollYProgress, [0, 0.45], [0, -48]);
  const cueOpacity = useTransform(scrollYProgress, [0, 0.12], [1, 0]);

  // Tap in / tap out: scroll the page to the end or the top of the scene.
  const toggleGalaxy = useCallback(() => {
    const scene = sceneRef.current;
    const stage = scene?.firstElementChild as HTMLElement | null | undefined;
    if (!scene || !stage) return;
    const sceneTop = scene.getBoundingClientRect().top + window.scrollY;
    const travel = scene.offsetHeight - stage.offsetHeight;
    const target = immersedRef.current ? sceneTop : sceneTop + travel;
    window.scrollTo({ top: Math.max(0, target), behavior: reducedMotion ? "auto" : "smooth" });
  }, [reducedMotion]);

  // 3D sphere click → fly camera in, then open viewer
  const handleSphereClick = useCallback((i: number) => {
    setFocusedIndex(i);
    setViewerIndex(i);
  }, []);

  // Gallery grid click → open viewer directly (no fly-in)
  const handleGridClick = useCallback((i: number) => {
    setViewerIndex(i);
    setShowViewer(true);
  }, []);

  // Three.js fly-in complete → show the 2D viewer overlay
  const handleFlyInComplete = useCallback(() => {
    setShowViewer(true);
  }, []);

  // User closes the viewer → hide overlay, start fly-out if we flew in
  const handleViewerClose = useCallback(() => {
    setShowViewer(false);
    if (focusedIndex !== null) {
      // Was a 3D fly-in — trigger fly-out
      setFocusedIndex(null);
    } else {
      // Was a grid click — just close
      setViewerIndex(null);
    }
  }, [focusedIndex]);

  // Three.js fly-out complete → reset everything
  const handleFlyOutComplete = useCallback(() => {
    setViewerIndex(null);
  }, []);

  return (
    <main className="relative z-10 flex-1 w-full flex flex-col">
      {/* ═══ HERO: THE GALAXY. The page scrolls through this scene while the stage stays pinned. ═══ */}
      <section ref={sceneRef} aria-label="The galaxy" className="relative w-full h-[260svh] -mt-[var(--header-h)]">
        <div className="sticky top-0 w-full h-[100svh] overflow-hidden">
          {/* Overlay text */}
          <motion.div
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

          {/* Subtle vignette */}
          <div
            className="absolute inset-0 z-[5] pointer-events-none"
            style={{ background: "radial-gradient(ellipse at center, transparent 40%, rgba(1,1,1,0.7) 100%)" }}
          />

          {/* The galaxy: its own nebula, disc and pictures */}
          <div className="absolute inset-0 z-[3]">
            <GalaxyHero
              images={imageUrls}
              onImageClick={handleSphereClick}
              focusedIndex={focusedIndex}
              onFlyInComplete={handleFlyInComplete}
              onFlyOutComplete={handleFlyOutComplete}
              scrollProgressRef={scrollProgressRef}
            />
          </div>

          {/* Scroll indicator */}
          <motion.div
            style={{ opacity: cueOpacity }}
            className="absolute bottom-[16%] left-1/2 -translate-x-1/2 z-20 pointer-events-none"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: focusedIndex !== null ? 0 : 1 }}
              transition={{ delay: focusedIndex !== null ? 0 : 2, duration: focusedIndex !== null ? 0.5 : 1 }}
              className="flex flex-col items-center gap-2"
            >
              <span className="text-[9px] font-mono text-white/20 tracking-widest uppercase">Scroll to explore</span>
              <motion.div
                animate={reducedMotion ? undefined : { y: [0, 6, 0] }}
                transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
                className="w-4 h-7 rounded-full border border-white/15 flex items-start justify-center p-1"
              >
                <div className="w-1 h-1.5 rounded-full bg-white/30" />
              </motion.div>
            </motion.div>
          </motion.div>

          {/* Tap in / tap out */}
          <div className="absolute bottom-[7%] left-0 right-0 z-30 flex justify-center pointer-events-none">
            <motion.button
              type="button"
              onClick={toggleGalaxy}
              initial={{ opacity: 0 }}
              animate={{ opacity: focusedIndex !== null ? 0 : 1 }}
              transition={{ delay: focusedIndex !== null ? 0 : 2.2, duration: 0.8 }}
              style={{ pointerEvents: focusedIndex !== null ? "none" : "auto" }}
              className="px-5 py-2.5 rounded-full border border-white/15 bg-white/[0.04] backdrop-blur-md text-[10px] font-mono text-white/70 hover:text-white hover:border-white/30 hover:bg-white/10 transition-colors tracking-widest uppercase"
            >
              {immersed ? "Back to overview" : "Enter the galaxy"}
            </motion.button>
          </div>
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
          <p className="text-[11px] font-mono text-white/30 tracking-[0.2em] uppercase">
            A curated collection of experiences
          </p>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {galleryImages.map((img, i) => (
            <motion.div
              key={img.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.6, delay: i * 0.08 }}
              className="group relative aspect-[1754/2481] overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] cursor-pointer"
              onClick={() => handleGridClick(i)}
            >
              <img
                src={img.url}
                alt={img.title}
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                loading="lazy"
                crossOrigin="anonymous"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="absolute bottom-3 left-3 right-3 opacity-0 group-hover:opacity-100 transition-all duration-500 translate-y-2 group-hover:translate-y-0">
                <span className="text-[9px] font-mono text-white/60 tracking-widest uppercase">
                  {img.title}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ═══ FULLSCREEN IMAGE VIEWER ══════════════════════════════ */}
      <AnimatePresence>
        {showViewer && viewerIndex !== null && (
          <ImageViewer
            key={viewerIndex}
            src={galleryImages[viewerIndex].url}
            index={viewerIndex}
            title={galleryImages[viewerIndex].title}
            onClose={handleViewerClose}
            skipEntrance={focusedIndex !== null}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
