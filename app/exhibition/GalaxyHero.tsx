import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MutableRefObject } from "react";
import * as THREE from "three";
import { GalaxyScene } from "./scene/GalaxyScene";
import { pictureTabOrder } from "./scene/layout";

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
/** Temporary approach distance for the picture fly-in. Step 5 replaces this with the framed focus move. */
const APPROACH_DISTANCE = 3.8;

function springLerp(current: number, target: number, speed: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-speed * dt));
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
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
    let targetCamPos = new THREE.Vector3();
    let targetLookAt = new THREE.Vector3();
    let targetRotVel = BASE_SPIN;
    let vignetteTarget = 0;
    let flyProgress = 0;
    let flyTargetIdx: number | null = null;
    let frozenRotY = 0;
    let flyInNotified = false;
    let rotVelY = BASE_SPIN;
    let isDragging = false;
    let dragDistance = 0;
    let prevX = 0;
    let lastMoveTime = 0;
    let hadMultiPointer = false;
    let pinchStartDistance = 0;
    let pinchStartZoom = 1;
    let zoom = 1;
    const activePointers = new Map<number, { x: number; y: number }>();
    const helperCam = new THREE.PerspectiveCamera();
    const homeLook = new THREE.Vector3(0, 0, 0);

    let galaxy!: GalaxyScene;

    // Highlights one picture. Keeps the scene, the label and React in step.
    const highlight = (index: number | null, nextTilt = { x: 0, y: 0 }, ring = false) => {
      galaxy.setHover(index, nextTilt, ring);
      if (activeRef.current !== index) {
        activeRef.current = index;
        setActive(index);
      }
    };
    highlightRef.current = highlight;

    const zoomCameraToDistance = (distance: number) => {
      const next = THREE.MathUtils.clamp(distance, MIN_CAMERA_DISTANCE, MAX_CAMERA_DISTANCE);
      galaxy.camera.position.normalize().multiplyScalar(next);
      galaxy.camera.lookAt(homeLook);
    };

    const computeFlyTarget = (idx: number) => {
      const pose = galaxy.pictureWorldPose(idx);
      if (!pose) return null;
      return {
        camPos: pose.position.clone().add(pose.normal.clone().multiplyScalar(APPROACH_DISTANCE)),
        lookAt: pose.position,
      };
    };

    const onFrame = (dt: number) => {
      const camera = galaxy.camera;
      const group = galaxy.group;

      // ── Commands from React ──
      const cmd = stateCommandRef.current;
      if (cmd) {
        stateCommandRef.current = null;
        if (cmd.type === "FLY_IN" && cmd.index !== undefined && state === "IDLE") {
          const target = computeFlyTarget(cmd.index);
          if (target) {
            state = "FLYING_IN";
            flyTargetIdx = cmd.index;
            targetCamPos = target.camPos;
            targetLookAt = target.lookAt;
            rotVelY = 0;
            targetRotVel = 0;
            frozenRotY = group.rotation.y;
            vignetteTarget = 0;
            flyProgress = 0;
            flyInNotified = false;
          }
        } else if (cmd.type === "FLY_OUT" && (state === "FOCUSED" || state === "FLYING_IN")) {
          state = "FLYING_OUT";
          flyTargetIdx = null;
          flyInNotified = false;
          targetCamPos = galaxy.homePosition();
          targetLookAt = homeLook.clone();
          targetRotVel = BASE_SPIN;
          vignetteTarget = 0;
          flyProgress = 0;
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
        rotVelY = springLerp(rotVelY, targetRotVel, 2, dt);
        group.rotation.y += rotVelY * dt;
      }
      group.rotation.x = springLerp(group.rotation.x, 0, 6, dt);

      // ── Scroll and pinch: the page scroll sets the distance, and pinch scales it within limits ──
      if (state === "IDLE") {
        const progress = scrollProgressRef?.current ?? 0;
        const eased = progress * progress * (3 - 2 * progress);
        const base = THREE.MathUtils.lerp(galaxy.framingDistance, IMMERSED_DISTANCE, eased);
        zoomCameraToDistance(base * zoom);
      }

      // ── Camera fly-in ──
      if (state === "FLYING_IN") {
        if (flyTargetIdx !== null) {
          const live = computeFlyTarget(flyTargetIdx);
          if (live) {
            targetCamPos = live.camPos;
            targetLookAt = live.lookAt;
          }
        }
        const flySpeed = 1.8;
        camera.position.x = springLerp(camera.position.x, targetCamPos.x, flySpeed, dt);
        camera.position.y = springLerp(camera.position.y, targetCamPos.y, flySpeed, dt);
        camera.position.z = springLerp(camera.position.z, targetCamPos.z, flySpeed, dt);
        helperCam.position.copy(camera.position);
        helperCam.lookAt(targetLookAt);
        camera.quaternion.slerp(helperCam.quaternion, 1 - Math.exp(-2.5 * dt));
        flyProgress = springLerp(flyProgress, 1, flySpeed, dt);
        vignetteTarget = flyProgress < 0.55 ? 0 : 1;

        const veil = galaxy.veil.material as THREE.MeshBasicMaterial;
        if (veil.opacity > 0.92 && !flyInNotified) {
          flyInNotified = true;
          state = "FOCUSED";
          camera.position.copy(targetCamPos);
          helperCam.position.copy(camera.position);
          helperCam.lookAt(targetLookAt);
          camera.quaternion.copy(helperCam.quaternion);
          onFlyInCompleteRef.current?.();
        }
      }

      // ── Camera fly-out ──
      if (state === "FLYING_OUT") {
        const flySpeed = 3.0;
        camera.position.x = springLerp(camera.position.x, targetCamPos.x, flySpeed, dt);
        camera.position.y = springLerp(camera.position.y, targetCamPos.y, flySpeed, dt);
        camera.position.z = springLerp(camera.position.z, targetCamPos.z, flySpeed, dt);
        helperCam.position.copy(camera.position);
        helperCam.lookAt(targetLookAt);
        camera.quaternion.slerp(helperCam.quaternion, 1 - Math.exp(-3.5 * dt));
        flyProgress = springLerp(flyProgress, 1, flySpeed, dt);
        if (camera.position.distanceTo(targetCamPos) < 0.15 && flyProgress > 0.92) {
          state = "IDLE";
          camera.position.copy(galaxy.homePosition());
          camera.lookAt(homeLook);
          flyTargetIdx = null;
          onFlyOutCompleteRef.current?.();
        }
      }

      // ── Focused: keep the camera on the picture ──
      if (state === "FOCUSED" && flyTargetIdx !== null) {
        const live = computeFlyTarget(flyTargetIdx);
        if (live) {
          camera.position.lerp(live.camPos, 1 - Math.exp(-6 * dt));
          helperCam.position.copy(camera.position);
          helperCam.lookAt(live.lookAt);
          camera.quaternion.slerp(helperCam.quaternion, 1 - Math.exp(-6 * dt));
        }
      }

      // ── Veil: fades the view to black during the fly-in, and back out again ──
      const veil = galaxy.veil;
      const veilMaterial = veil.material as THREE.MeshBasicMaterial;
      if (state === "FOCUSED") {
        vignetteTarget = 0;
        veilMaterial.opacity = 0;
      } else {
        const speed = state === "FLYING_IN" ? 3.5 : 5;
        veilMaterial.opacity = springLerp(veilMaterial.opacity, vignetteTarget, speed, dt);
      }
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      veil.position.copy(camera.position).add(forward.multiplyScalar(0.11));
      veil.quaternion.copy(camera.quaternion);

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
      const scaled = pinchStartZoom * Math.pow(ratio, PINCH_ZOOM_SENSITIVITY);
      zoom = THREE.MathUtils.clamp(scaled, MIN_ZOOM, MAX_ZOOM);
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
