import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MutableRefObject } from "react";
import * as THREE from "three";
import { GalaxyScene } from "./scene/GalaxyScene";
import { pictureTabOrder } from "./scene/layout";
import { EXIT_DURATION, FOCUS_DURATION, FocusMove, fitDistance, framedPose, type Pose } from "./camera/focus";

type FlyState = "IDLE" | "FLYING_IN" | "FOCUSED" | "FLYING_OUT";

export interface GalaxyHeroProps {
  /** The pictures at the size the disc shows. */
  images: string[];
  /** The same pictures at the size a focused view needs. */
  focusImages: string[];
  /** The title of each picture, in the same order as `images`. */
  titles: string[];
  /** The pieces this visitor has opened. The disc marks them. */
  visited: ReadonlySet<number>;
  focusedIndex: number | null;
  onImageClick?: (imageIndex: number) => void;
  /** A picture has arrived and is in focus. */
  onArrive?: (imageIndex: number) => void;
  /** The camera has returned to the overview. */
  onFlyOutComplete?: () => void;
  /** The visitor asked to leave the focused view: Esc, or a swipe down on a phone. */
  onRequestClose?: () => void;
  /** The visitor stepped to the previous (-1) or next (+1) piece with the arrow keys. */
  onStep?: (direction: -1 | 1) => void;
  /** The sharp picture is loading, or has finished. */
  onHiResState?: (imageIndex: number, state: "loading" | "ready") => void;
  /** WebGL could not start. The page then offers the flat viewer instead. */
  onUnsupported?: () => void;
  /** Page scroll progress, 0 (overview) to 1 (immersed). The page owns the scroll; the galaxy only reads it. */
  scrollProgressRef?: MutableRefObject<number>;
  /** Opens the overview from further out, pulling in over a few seconds. Read once, when the galaxy mounts. */
  intro?: boolean;
  /** The visitor asked for reduced motion: no idle turn, no arcing flights, a still nebula. */
  reducedMotion?: boolean;
}

const MIN_CAMERA_DISTANCE = 5;
const MAX_CAMERA_DISTANCE = 25;
/** The camera's distance once the visitor has entered: just outside the pictures that orbit the globe. */
const IMMERSED_DISTANCE = 9.5;
/** Idle spin of the globe in radians per second, about 3° a second: a full turn in about two minutes. */
const BASE_SPIN = 0.05;
const DRAG_RADIANS_PER_PIXEL = 0.0035;
const PINCH_ZOOM_SENSITIVITY = 1.15;
/** Pinch zoom in the overview is kept within this range of the scroll position's distance. */
const MIN_ZOOM = 0.8;
const MAX_ZOOM = 1.3;
/** Zoom inside a focused picture: from the framed view to three times closer. */
const MAX_FOCUS_ZOOM = 3;
/** The focus move narrows the lens to this share of the overview lens, for a closer, more cinematic view. */
const FOCUS_LENS = 0.85;
const FOCUS_BULGE = 2.0;
const EXIT_BULGE = 1.6;
/** At the framed view, a downward swipe of this many pixels leaves, and a sideways one steps to a neighbour. */
const SWIPE_CLOSE_PX = 110;
const SWIPE_STEP_PX = 80;
const RECENTER_RATE = 2.4;
/** The opening pulls the camera in from this much further out, over INTRO_SECONDS. */
const INTRO_PULL = 0.6;
const INTRO_SECONDS = 3.2;
/** With reduced motion, a flight is a short glide with no arc, and the disc does not turn on its own. */
const REDUCED_FLIGHT_SECONDS = 0.35;
const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);

function springLerp(current: number, target: number, speed: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-speed * dt));
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function headerHeight(): number {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 0;
}

export function GalaxyHero({
  images,
  focusImages,
  titles,
  visited,
  focusedIndex,
  onImageClick,
  onArrive,
  onFlyOutComplete,
  onRequestClose,
  onStep,
  onHiResState,
  onUnsupported,
  scrollProgressRef,
  intro = false,
  reducedMotion = false,
}: GalaxyHeroProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const introRef = useRef(intro);
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;
  const labelRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const highlightRef = useRef<(index: number | null, tilt?: { x: number; y: number }, ring?: boolean) => void>(() => {});
  const onImageClickRef = useRef(onImageClick);
  onImageClickRef.current = onImageClick;
  const onArriveRef = useRef(onArrive);
  onArriveRef.current = onArrive;
  const onFlyOutCompleteRef = useRef(onFlyOutComplete);
  onFlyOutCompleteRef.current = onFlyOutComplete;
  const onRequestCloseRef = useRef(onRequestClose);
  onRequestCloseRef.current = onRequestClose;
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;
  const onHiResStateRef = useRef(onHiResState);
  onHiResStateRef.current = onHiResState;
  const onUnsupportedRef = useRef(onUnsupported);
  onUnsupportedRef.current = onUnsupported;
  const focusImagesRef = useRef(focusImages);
  focusImagesRef.current = focusImages;
  const visitedRef = useRef(visited);
  visitedRef.current = visited;
  const prevFocusedIndexRef = useRef<number | null>(null);
  // Commands from React to the frame loop.
  const stateCommandRef = useRef<{ type: "FLY_IN" | "FLY_OUT" | "FLY_TO"; index?: number } | null>(null);
  const activeRef = useRef<number | null>(null);

  // The picture being pointed at or focused on, for the label and the screen reader list.
  const [active, setActive] = useState<number | null>(null);
  // Circular order, so Tab and the arrow keys follow the galaxy's own sweep.
  const order = useMemo(() => pictureTabOrder(images.length), [images.length]);

  useEffect(() => {
    const prev = prevFocusedIndexRef.current;
    const curr = focusedIndex;
    if (prev === null && curr !== null) {
      stateCommandRef.current = { type: "FLY_IN", index: curr };
    } else if (prev !== null && curr === null) {
      stateCommandRef.current = { type: "FLY_OUT" };
      // Focus goes back to the piece just viewed, so a keyboard user is not dropped on the page's top.
      buttonRefs.current[prev]?.focus({ preventScroll: true });
    } else if (prev !== null && curr !== null && prev !== curr) {
      stateCommandRef.current = { type: "FLY_TO", index: curr };
    }
    prevFocusedIndexRef.current = curr;
  }, [focusedIndex]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let galaxy!: GalaxyScene;

    // The frame loop and the input handlers share this state.
    let state: FlyState = "IDLE";
    let rotVelY = BASE_SPIN;
    let frozenRotY = 0;
    let recenterRotY = 0;
    let isDragging = false;
    let dragDistance = 0;
    let prevX = 0;
    let prevY = 0;
    // Where the current gesture began, so a swipe is measured as a whole, not event by event.
    let startX = 0;
    let startY = 0;
    let lastMoveTime = 0;
    let hadMultiPointer = false;
    let pinchStartDistance = 0;
    let pinchStartZoom = 1;
    let zoom = 1;
    let focusZoom = 1;
    const focusPan = { x: 0, y: 0 };
    let focusPicture: number | null = null;
    let move: FocusMove | null = null;
    // 0 at the start of the opening, 1 once the camera has settled into the overview.
    let introT = introRef.current ? 0 : 1;
    let shiftApplied = 0;
    const activePointers = new Map<number, { x: number; y: number }>();
    const homeLook = new THREE.Vector3(0, 0, 0);

    const setState = (next: FlyState) => {
      state = next;
      container.dataset.focusState = next === "IDLE" ? "overview" : next.toLowerCase().replace("_", "-");
      // The page scrolls in the overview. Once a picture is in view, the galaxy takes every gesture,
      // so a swipe is never handed to the browser to scroll the page.
      container.style.touchAction = next === "IDLE" ? "pan-y" : "none";
    };
    setState("IDLE");

    // Highlights one picture. Keeps the scene, the label and React in step.
    const highlight = (index: number | null, nextTilt = { x: 0, y: 0 }, ring = false) => {
      galaxy.setHover(index, nextTilt, ring);
      if (activeRef.current !== index) {
        activeRef.current = index;
        setActive(index);
      }
    };

    const applyPose = (pose: Pose) => {
      const camera = galaxy.camera;
      camera.position.copy(pose.position);
      camera.quaternion.copy(pose.quaternion);
      if (camera.fov !== pose.fov) {
        camera.fov = pose.fov;
        camera.updateProjectionMatrix();
      }
    };

    const setShift = (pixels: number) => {
      if (Math.abs(pixels - shiftApplied) < 0.01) return;
      shiftApplied = pixels;
      galaxy.setViewShift(pixels);
    };

    const currentPose = (): Pose => ({
      position: galaxy.camera.position.clone(),
      quaternion: galaxy.camera.quaternion.clone(),
      fov: galaxy.camera.fov,
    });

    // Where the scroll position puts the camera in the overview.
    const dollyPose = (): Pose => {
      const progress = scrollProgressRef?.current ?? 0;
      const eased = progress * progress * (3 - 2 * progress);
      const pull = 1 + INTRO_PULL * (1 - easeOutCubic(introT));
      const distance = THREE.MathUtils.clamp(
        THREE.MathUtils.lerp(galaxy.framingDistance, IMMERSED_DISTANCE, eased) * zoom * pull,
        MIN_CAMERA_DISTANCE,
        MAX_CAMERA_DISTANCE
      );
      const position = galaxy.homePosition().normalize().multiplyScalar(distance);
      const matrix = new THREE.Matrix4().lookAt(position, homeLook, UP);
      return {
        position,
        quaternion: new THREE.Quaternion().setFromRotationMatrix(matrix),
        fov: galaxy.baseFov,
      };
    };

    const focusLens = () => galaxy.baseFov * FOCUS_LENS;

    const endDrag = (pointerId: number) => {
      isDragging = false;
      activePointers.delete(pointerId);
    };

    // The distance that frames a picture at zoom 1, on this screen.
    const framedDistance = (picture: { width: number; height: number; quaternion: THREE.Quaternion }) => {
      const viewportW = Math.max(1, container.clientWidth);
      const viewportH = Math.max(1, container.clientHeight);
      return fitDistance({
        width: picture.width,
        height: picture.height,
        viewportAspect: viewportW / viewportH,
        fovDeg: focusLens(),
        usableHeightFraction: (viewportH - headerHeight()) / viewportH,
      });
    };

    // The pose that frames a picture: it fills most of the usable screen, level, straight on. Zoom
    // brings the camera closer, and the pan moves it across the picture, never past its edges.
    const focusPose = (index: number): Pose | null => {
      const picture = galaxy.pictureWorldPose(index);
      if (!picture) return null;
      const fov = focusLens();
      const distance = framedDistance(picture) / focusZoom;
      const halfTan = Math.tan(THREE.MathUtils.degToRad(fov / 2));
      const visibleHalfH = distance * halfTan;
      const visibleHalfW = visibleHalfH * (container.clientWidth / Math.max(1, container.clientHeight));
      const maxX = Math.max(0, picture.width / 2 - visibleHalfW);
      const maxY = Math.max(0, picture.height / 2 - visibleHalfH);
      focusPan.x = THREE.MathUtils.clamp(focusPan.x, -maxX, maxX);
      focusPan.y = THREE.MathUtils.clamp(focusPan.y, -maxY, maxY);

      const up = UP.clone().applyQuaternion(picture.quaternion);
      const right = RIGHT.clone().applyQuaternion(picture.quaternion);
      const center = picture.position.clone().addScaledVector(right, focusPan.x).addScaledVector(up, focusPan.y);
      return framedPose({ center, normal: picture.normal, up, distance, fovDeg: fov });
    };

    // World units per screen pixel at the current focus zoom, for dragging the view across the picture.
    const worldPerPixel = (): number => {
      const index = focusPicture;
      const picture = index !== null ? galaxy.pictureWorldPose(index) : null;
      if (!picture) return 0;
      const distance = framedDistance(picture) / focusZoom;
      const visibleH = 2 * distance * Math.tan(THREE.MathUtils.degToRad(focusLens() / 2));
      return visibleH / Math.max(1, container.clientHeight);
    };

    const homePose = (): Pose => dollyPose();

    const beginFocus = (index: number, from: Pose) => {
      focusPicture = index;
      focusZoom = 1;
      focusPan.x = 0;
      focusPan.y = 0;
      galaxy.setFocus(index);
      move = reducedRef.current
        ? new FocusMove(from, REDUCED_FLIGHT_SECONDS, 0)
        : new FocusMove(from, FOCUS_DURATION, FOCUS_BULGE);
      onHiResStateRef.current?.(index, "loading");
      const url = focusImagesRef.current[index];
      if (url) {
        galaxy.loadFocusTexture(index, url).then(() => onHiResStateRef.current?.(index, "ready"));
      }
    };

    const onFrame = (dt: number) => {
      const group = galaxy.group;
      const reduced = reducedRef.current;
      galaxy.setReducedMotion(reduced);
      const spin = reduced ? 0 : BASE_SPIN;

      // ── Commands from React ──
      const cmd = stateCommandRef.current;
      if (cmd) {
        stateCommandRef.current = null;
        if (cmd.type === "FLY_IN" && cmd.index !== undefined && (state === "IDLE" || state === "FLYING_OUT")) {
          // A new picture can be chosen while the camera is still returning. The move starts from where it is.
          frozenRotY = group.rotation.y;
          rotVelY = 0;
          beginFocus(cmd.index, currentPose());
          setState("FLYING_IN");
        } else if (cmd.type === "FLY_TO" && cmd.index !== undefined && (state === "FOCUSED" || state === "FLYING_IN")) {
          // Stepping to a neighbour: the same move, from where the camera is now.
          beginFocus(cmd.index, currentPose());
          setState("FLYING_IN");
        } else if (cmd.type === "FLY_OUT" && (state === "FLYING_IN" || state === "FOCUSED")) {
          galaxy.setFocus(null);
          focusZoom = 1;
          focusPan.x = 0;
          focusPan.y = 0;
          // The disc turns to bring the picture just viewed to the front, as the camera leaves.
          if (focusPicture !== null) recenterRotY = galaxy.recenterRotation(focusPicture, group.rotation.y);
          move = reducedRef.current
            ? new FocusMove(currentPose(), REDUCED_FLIGHT_SECONDS, 0)
            : new FocusMove(currentPose(), EXIT_DURATION, EXIT_BULGE);
          setState("FLYING_OUT");
        }
      }

      // ── Rotation: horizontal drags turn the disc, with momentum. Vertical movement stays with the page. ──
      if (state === "IDLE" && !isDragging) {
        rotVelY = springLerp(rotVelY, spin, 1.2, dt);
        group.rotation.y += rotVelY * dt;
      } else if (state === "FLYING_IN" || state === "FOCUSED") {
        group.rotation.y = springLerp(group.rotation.y, frozenRotY, 8, dt);
        rotVelY = 0;
      } else if (state === "FLYING_OUT") {
        group.rotation.y = springLerp(group.rotation.y, recenterRotY, RECENTER_RATE, dt);
        rotVelY = 0;
      }
      group.rotation.x = springLerp(group.rotation.x, 0, 6, dt);

      // ── The camera ──
      const header = headerHeight();
      if (introT < 1) introT = Math.min(1, introT + dt / INTRO_SECONDS);
      if (state === "IDLE") {
        applyPose(dollyPose());
        setShift(0);
      } else if (state === "FLYING_IN" && move && focusPicture !== null) {
        const target = focusPose(focusPicture);
        if (!target) {
          setState("IDLE");
        } else {
          const { pose, done } = move.step(dt, target);
          applyPose(pose);
          setShift((header / 2) * move.progress);
          if (done) {
            applyPose(target);
            setShift(header / 2);
            setState("FOCUSED");
            // Recorded for the tests: where the picture landed on screen.
            container.dataset.focusRect = JSON.stringify(galaxy.screenRect(focusPicture));
            move = null;
            onArriveRef.current?.(focusPicture);
          }
        }
      } else if (state === "FOCUSED" && focusPicture !== null) {
        const target = focusPose(focusPicture);
        if (target) applyPose(target);
        setShift(header / 2);
      } else if (state === "FLYING_OUT" && move) {
        const { pose, done } = move.step(dt, homePose());
        applyPose(pose);
        setShift((header / 2) * (1 - move.progress));
        if (done) {
          focusPicture = null;
          move = null;
          delete container.dataset.focusRect;
          setShift(0);
          rotVelY = spin;
          setState("IDLE");
          onFlyOutCompleteRef.current?.();
        }
      }

      // ── Visited marks ──
      galaxy.setVisited(visitedRef.current);

      // ── Label: follows the highlighted picture on screen ──
      const label = labelRef.current;
      if (label) {
        const index = activeRef.current;
        const point = index !== null && state === "IDLE" ? galaxy.projectPicture(index) : null;
        if (point && !point.behind) {
          label.style.transform = `translate(${point.x}px, ${point.y}px)`;
          label.style.opacity = "1";
        } else {
          label.style.opacity = "0";
        }
      }
    };

    try {
      galaxy = new GalaxyScene(container, images, { onFrame });
    } catch {
      // No WebGL: the page shows the flat gallery instead.
      onUnsupportedRef.current?.();
      return;
    }
    highlightRef.current = highlight;
    galaxy.camera.position.copy(galaxy.homePosition());
    galaxy.camera.lookAt(homeLook);
    galaxy.setVisited(visitedRef.current);

    // ── Input ──
    // In the overview, these handlers turn the disc sideways, pinch, pick and highlight.
    // Once a picture is focused, they zoom and pan it, and a swipe down leaves.
    const el = galaxy.domElement;
    el.style.cursor = "grab";

    const pinchDistance = () => {
      const [a, b] = Array.from(activePointers.values());
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };

    const beginPinch = () => {
      pinchStartDistance = pinchDistance();
      pinchStartZoom = state === "FOCUSED" ? focusZoom : zoom;
      hadMultiPointer = true;
      isDragging = false;
      dragDistance = 8;
      rotVelY = 0;
      highlight(null);
    };

    const updatePinch = () => {
      const current = pinchDistance();
      if (current <= 0 || pinchStartDistance <= 0) return;
      const ratio = pinchStartDistance / current;
      if (state === "FOCUSED") {
        focusZoom = THREE.MathUtils.clamp(pinchStartZoom * Math.pow(ratio, -PINCH_ZOOM_SENSITIVITY), 1, MAX_FOCUS_ZOOM);
      } else {
        zoom = THREE.MathUtils.clamp(pinchStartZoom * Math.pow(ratio, PINCH_ZOOM_SENSITIVITY), MIN_ZOOM, MAX_ZOOM);
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (state !== "IDLE" && state !== "FOCUSED") return;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // Capture can fail if the browser has already cancelled the gesture.
      }
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activePointers.size >= 2) {
        beginPinch();
        return;
      }
      hadMultiPointer = false;
      isDragging = true;
      dragDistance = 0;
      prevX = e.clientX;
      prevY = e.clientY;
      startX = e.clientX;
      startY = e.clientY;
      lastMoveTime = performance.now();
      highlight(null);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (state !== "IDLE" && state !== "FOCUSED") return;
      if (activePointers.has(e.pointerId)) {
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      if (activePointers.size >= 2) {
        updatePinch();
        return;
      }
      if (!isDragging || activePointers.size !== 1) return;

      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      dragDistance += Math.abs(dx) + Math.abs(dy);

      if (state === "FOCUSED") {
        // Zoomed in, a drag pans across the picture. At the framed view, a sideways swipe steps to a
        // neighbour and a downward swipe leaves.
        if (focusZoom <= 1.02) {
          const totalX = e.clientX - startX;
          const totalY = e.clientY - startY;
          const sideways = Math.abs(totalX) > Math.abs(totalY) * 1.5;
          if (sideways && Math.abs(totalX) > SWIPE_STEP_PX) {
            endDrag(e.pointerId);
            onStepRef.current?.(totalX < 0 ? 1 : -1);
          } else if (!sideways && totalY > SWIPE_CLOSE_PX) {
            endDrag(e.pointerId);
            onRequestCloseRef.current?.();
          }
        } else {
          const unit = worldPerPixel();
          focusPan.x -= dx * unit;
          focusPan.y += dy * unit;
        }
      } else {
        galaxy.group.rotation.y += dx * DRAG_RADIANS_PER_PIXEL;
        // Momentum after release comes from the speed of the last movement.
        const now = performance.now();
        const seconds = Math.max((now - lastMoveTime) / 1000, 0.008);
        rotVelY = (dx * DRAG_RADIANS_PER_PIXEL) / seconds;
        lastMoveTime = now;
      }
      prevX = e.clientX;
      prevY = e.clientY;
    };

    const finishPointer = (e: PointerEvent, allowClick: boolean) => {
      const wasClick = allowClick && !hadMultiPointer && activePointers.size === 1 && dragDistance < 6;
      activePointers.delete(e.pointerId);
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        // Capture may already be released.
      }
      isDragging = false;
      if (activePointers.size === 0) {
        hadMultiPointer = false;
        pinchStartDistance = 0;
      }
      if (wasClick && state === "IDLE" && onImageClickRef.current) {
        const index = galaxy.pick(e.clientX, e.clientY);
        if (index !== null) onImageClickRef.current(index);
      }
    };

    const onPointerUp = (e: PointerEvent) => finishPointer(e, true);
    const onPointerCancel = (e: PointerEvent) => finishPointer(e, false);
    const onPointerLeave = (e: PointerEvent) => {
      if (e.pointerType === "mouse") {
        finishPointer(e, false);
        highlight(null);
      }
    };

    // Wheel zooms a focused picture. In the overview the page keeps its scroll.
    const onWheel = (e: WheelEvent) => {
      if (state !== "FOCUSED") return;
      e.preventDefault();
      focusZoom = THREE.MathUtils.clamp(focusZoom * Math.exp(-e.deltaY * 0.0015), 1, MAX_FOCUS_ZOOM);
    };

    // Hover is for mouse pointers only. Touch has no hover, so nothing sticks after a tap.
    const onHoverMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      if (state !== "IDLE") {
        el.style.cursor = state === "FOCUSED" ? "zoom-in" : "default";
        highlight(null);
        return;
      }
      if (isDragging) {
        el.style.cursor = "grabbing";
        highlight(null);
        return;
      }
      const index = galaxy.pick(e.clientX, e.clientY);
      el.style.cursor = index !== null ? "pointer" : "grab";
      const rect = el.getBoundingClientRect();
      const nextTilt = {
        x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
        y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
      };
      highlight(index, nextTilt, false);
    };

    // Esc leaves the focused view, and the arrow keys step between pieces.
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (state !== "FOCUSED") return;
      if (e.key === "Escape") {
        e.preventDefault();
        onRequestCloseRef.current?.();
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        onStepRef.current?.(1);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        onStepRef.current?.(-1);
      }
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointermove", onHoverMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerCancel);
    el.addEventListener("pointerleave", onPointerLeave);
    el.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown);

    galaxy.start();

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointermove", onHoverMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerCancel);
      el.removeEventListener("pointerleave", onPointerLeave);
      el.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
      highlightRef.current = () => {};
      activeRef.current = null;
      galaxy.dispose();
    };
  }, [images]);

  // Keyboard: arrow keys and Home and End move through the pieces in circular order. Enter opens one.
  const onListKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const position = order.indexOf(index);
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = order[(position + 1) % order.length];
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = order[(position - 1 + order.length) % order.length];
    else if (event.key === "Home") next = order[0];
    else if (event.key === "End") next = order[order.length - 1];
    if (next !== null) {
      // The list moves focus only. The arrow keys must not also step a focused picture.
      event.preventDefault();
      event.stopPropagation();
      buttonRefs.current[next]?.focus({ preventScroll: true });
    }
  };

  const activeLabel = active !== null ? titles[active] : "";
  const activeCount = active !== null ? `${pad(active + 1)} / ${pad(titles.length)}` : "";

  return (
    <div ref={containerRef} className="absolute inset-0">
      {/* The label follows the highlighted picture. It is decoration; the list below carries the names. */}
      <div ref={labelRef} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 z-30 opacity-0 transition-opacity duration-300">
        <div className="-translate-x-1/2 -translate-y-full -mt-5 flex flex-col items-center gap-1 whitespace-nowrap">
          <span className="text-xs font-mono text-cyan-300 tracking-widest uppercase">{activeCount}</span>
          <span className="text-xl text-white" style={{ fontFamily: "'Instrument Serif', serif" }}>{activeLabel}</span>
        </div>
      </div>

      {/* The pieces, for screen readers and the keyboard. Visually hidden; the highlight on the galaxy shows focus. */}
      <ul aria-label="The pieces" className="sr-only">
        {order.map((index) => (
          <li key={index}>
            <button
              ref={(el) => {
                buttonRefs.current[index] = el;
              }}
              type="button"
              onFocus={() => highlightRef.current(index, { x: 0, y: 0 }, true)}
              onBlur={() => highlightRef.current(null)}
              onKeyDown={(event) => onListKeyDown(event, index)}
              onClick={() => onImageClickRef.current?.(index)}
            >
              {`${pad(index + 1)} of ${pad(titles.length)}: ${titles[index]}${visited.has(index) ? ", opened" : ""}`}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
