import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MutableRefObject } from "react";
import * as THREE from "three";
import { GalaxyScene } from "./scene/GalaxyScene";
import { pictureTabOrder } from "./scene/layout";
import { FOCUS_DURATION, EXIT_DURATION, FocusMove, fitDistance, framedPose, type Pose } from "./camera/focus";

type FlyState = "IDLE" | "FLYING_IN" | "FOCUSED" | "FLYING_OUT";

export interface GalaxyHeroProps {
  images: string[];
  /** The title of each picture, in the same order as `images`. Used for labels and screen readers. */
  titles: string[];
  onImageClick?: (imageIndex: number) => void;
  focusedIndex: number | null;
  onFlyInComplete?: () => void;
  onFlyOutComplete?: () => void;
  /** Page scroll progress, 0 (overview) to 1 (immersed). The page owns the scroll; the galaxy only reads it. */
  scrollProgressRef?: MutableRefObject<number>;
}

const MIN_CAMERA_DISTANCE = 5;
const MAX_CAMERA_DISTANCE = 25;
const IMMERSED_DISTANCE = 6.2;
/** Idle spin in radians per second, about 0.6° a second. */
const BASE_SPIN = 0.0105;
const DRAG_RADIANS_PER_PIXEL = 0.0035;
const PINCH_ZOOM_SENSITIVITY = 1.15;
/** Pinch zoom is kept within this range of the scroll position's distance. */
const MIN_ZOOM = 0.8;
const MAX_ZOOM = 1.3;
/** The focus move narrows the lens to this share of the overview lens, for a closer, more cinematic view. */
const FOCUS_LENS = 0.85;
const FOCUS_BULGE = 2.0;
const EXIT_BULGE = 1.6;
const UP = new THREE.Vector3(0, 1, 0);

function springLerp(current: number, target: number, speed: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-speed * dt));
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function headerHeight(): number {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 0;
}

export function GalaxyHero({
  images,
  titles,
  onImageClick,
  focusedIndex,
  onFlyInComplete,
  onFlyOutComplete,
  scrollProgressRef,
}: GalaxyHeroProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const highlightRef = useRef<(index: number | null, tilt?: { x: number; y: number }, ring?: boolean) => void>(() => {});
  const onImageClickRef = useRef(onImageClick);
  onImageClickRef.current = onImageClick;
  const onFlyInCompleteRef = useRef(onFlyInComplete);
  onFlyInCompleteRef.current = onFlyInComplete;
  const onFlyOutCompleteRef = useRef(onFlyOutComplete);
  onFlyOutCompleteRef.current = onFlyOutComplete;
  const prevFocusedIndexRef = useRef<number | null>(null);
  // Commands from React to the frame loop.
  const stateCommandRef = useRef<{ type: "FLY_IN" | "FLY_OUT"; index?: number } | null>(null);
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
    }
    prevFocusedIndexRef.current = curr;
  }, [focusedIndex]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // The frame loop and the input handlers share this state.
    let state: FlyState = "IDLE";
    let rotVelY = BASE_SPIN;
    let frozenRotY = 0;
    let isDragging = false;
    let dragDistance = 0;
    let prevX = 0;
    let lastMoveTime = 0;
    let hadMultiPointer = false;
    let pinchStartDistance = 0;
    let pinchStartZoom = 1;
    let zoom = 1;
    let focusPicture: number | null = null;
    let move: FocusMove | null = null;
    let shiftApplied = 0;
    const activePointers = new Map<number, { x: number; y: number }>();
    const homeLook = new THREE.Vector3(0, 0, 0);

    let galaxy!: GalaxyScene;

    const setState = (next: FlyState) => {
      state = next;
      container.dataset.focusState = next === "IDLE" ? "overview" : next.toLowerCase().replace("_", "-");
    };

    // Highlights one picture. Keeps the scene, the label and React in step.
    const highlight = (index: number | null, nextTilt = { x: 0, y: 0 }, ring = false) => {
      galaxy.setHover(index, nextTilt, ring);
      if (activeRef.current !== index) {
        activeRef.current = index;
        setActive(index);
      }
    };
    highlightRef.current = highlight;

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
      const distance = THREE.MathUtils.clamp(
        THREE.MathUtils.lerp(galaxy.framingDistance, IMMERSED_DISTANCE, eased) * zoom,
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

    // The pose that frames a picture: it fills most of the usable screen, level, straight on.
    const focusPose = (index: number): Pose | null => {
      const picture = galaxy.pictureWorldPose(index);
      if (!picture) return null;
      const viewportW = Math.max(1, container.clientWidth);
      const viewportH = Math.max(1, container.clientHeight);
      const fov = galaxy.baseFov * FOCUS_LENS;
      const distance = fitDistance({
        width: picture.width,
        height: picture.height,
        viewportAspect: viewportW / viewportH,
        fovDeg: fov,
        usableHeightFraction: (viewportH - headerHeight()) / viewportH,
      });
      const up = UP.clone().applyQuaternion(picture.quaternion);
      return framedPose({ center: picture.position, normal: picture.normal, up, distance, fovDeg: fov });
    };

    const homePose = (): Pose => {
      const position = galaxy.homePosition();
      const matrix = new THREE.Matrix4().lookAt(position, homeLook, UP);
      return { position, quaternion: new THREE.Quaternion().setFromRotationMatrix(matrix), fov: galaxy.baseFov };
    };

    const onFrame = (dt: number) => {
      const group = galaxy.group;

      // ── Commands from React ──
      const cmd = stateCommandRef.current;
      if (cmd) {
        stateCommandRef.current = null;
        if (cmd.type === "FLY_IN" && cmd.index !== undefined && (state === "IDLE" || state === "FLYING_OUT")) {
          // A new picture can be chosen while the camera is still returning. The move starts from where it is.
          focusPicture = cmd.index;
          galaxy.setFocus(cmd.index);
          frozenRotY = group.rotation.y;
          rotVelY = 0;
          move = new FocusMove(currentPose(), FOCUS_DURATION, FOCUS_BULGE);
          setState("FLYING_IN");
        } else if (cmd.type === "FLY_OUT" && (state === "FLYING_IN" || state === "FOCUSED")) {
          galaxy.setFocus(null);
          move = new FocusMove(currentPose(), EXIT_DURATION, EXIT_BULGE);
          setState("FLYING_OUT");
        }
      }

      // ── Rotation: horizontal drags turn the disc, with momentum. Vertical movement stays with the page. ──
      if (state === "IDLE" && !isDragging) {
        rotVelY = springLerp(rotVelY, BASE_SPIN, 1.2, dt);
        group.rotation.y += rotVelY * dt;
      } else if (state === "FLYING_IN" || state === "FOCUSED") {
        group.rotation.y = springLerp(group.rotation.y, frozenRotY, 8, dt);
        rotVelY = 0;
      } else if (state === "FLYING_OUT") {
        rotVelY = springLerp(rotVelY, BASE_SPIN, 2, dt);
        group.rotation.y += rotVelY * dt;
      }
      group.rotation.x = springLerp(group.rotation.x, 0, 6, dt);

      // ── The camera ──
      const header = headerHeight();
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
            // Recorded for the tests: where the picture landed, on screen.
            container.dataset.focusRect = JSON.stringify(galaxy.screenRect(focusPicture));
            move = null;
            onFlyInCompleteRef.current?.();
          }
        }
      } else if (state === "FOCUSED" && focusPicture !== null) {
        const target = focusPose(focusPicture);
        if (target) applyPose(target);
        setShift(header / 2);
      } else if (state === "FLYING_OUT" && move) {
        const { pose, done } = move.step(dt, dollyPose());
        applyPose(pose);
        setShift((header / 2) * (1 - move.progress));
        if (done) {
          focusPicture = null;
          move = null;
          delete container.dataset.focusRect;
          setShift(0);
          setState("IDLE");
          onFlyOutCompleteRef.current?.();
        }
      }

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

    galaxy = new GalaxyScene(container, images, { onFrame });
    galaxy.camera.position.copy(galaxy.homePosition());
    galaxy.camera.lookAt(homeLook);
    setState("IDLE");

    // ── Input ──
    // Vertical movement belongs to the page. These handlers turn the disc sideways, pinch, pick and highlight.
    const el = galaxy.domElement;
    el.style.cursor = "grab";

    const pinchDistance = () => {
      const [a, b] = Array.from(activePointers.values());
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };

    const beginPinch = () => {
      pinchStartDistance = pinchDistance();
      pinchStartZoom = zoom;
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
      zoom = THREE.MathUtils.clamp(pinchStartZoom * Math.pow(ratio, PINCH_ZOOM_SENSITIVITY), MIN_ZOOM, MAX_ZOOM);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (state !== "IDLE") return;
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
      lastMoveTime = performance.now();
      highlight(null);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (state !== "IDLE") return;
      if (activePointers.has(e.pointerId)) {
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      if (activePointers.size >= 2) {
        updatePinch();
        return;
      }
      if (!isDragging || activePointers.size !== 1) return;

      const dx = e.clientX - prevX;
      dragDistance += Math.abs(dx) + Math.abs(e.movementY);
      galaxy.group.rotation.y += dx * DRAG_RADIANS_PER_PIXEL;

      // Momentum after release comes from the speed of the last movement.
      const now = performance.now();
      const seconds = Math.max((now - lastMoveTime) / 1000, 0.008);
      rotVelY = (dx * DRAG_RADIANS_PER_PIXEL) / seconds;
      lastMoveTime = now;
      prevX = e.clientX;
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

    // Hover is for mouse pointers only. Touch has no hover, so nothing sticks after a tap.
    const onHoverMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      if (state !== "IDLE") {
        el.style.cursor = "default";
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

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointermove", onHoverMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerCancel);
    el.addEventListener("pointerleave", onPointerLeave);

    galaxy.start();

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointermove", onHoverMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerCancel);
      el.removeEventListener("pointerleave", onPointerLeave);
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
      event.preventDefault();
      buttonRefs.current[next]?.focus();
    }
  };

  const activeLabel = active !== null ? titles[active] : "";
  const activeCount = active !== null ? `${pad(active + 1)} / ${pad(titles.length)}` : "";

  return (
    <div ref={containerRef} className="absolute inset-0" style={{ touchAction: "pan-y" }}>
      {/* The label follows the highlighted picture. It is decoration; the list below carries the names. */}
      <div ref={labelRef} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 z-30 opacity-0 transition-opacity duration-300">
        <div className="-translate-x-1/2 -translate-y-full -mt-5 flex flex-col items-center gap-1 whitespace-nowrap">
          <span className="text-[10px] font-mono text-cyan-300/80 tracking-widest uppercase">{activeCount}</span>
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
              {`${pad(index + 1)} of ${pad(titles.length)}: ${titles[index]}`}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
