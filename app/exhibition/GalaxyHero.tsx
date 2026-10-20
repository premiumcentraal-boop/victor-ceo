import { useEffect, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { GalaxyScene } from "./scene/GalaxyScene";

type FlyState = "IDLE" | "FLYING_IN" | "FOCUSED" | "FLYING_OUT";

export interface GalaxyHeroProps {
  images: string[];
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
const SPIN_LIMIT_X = 0.5;
const DRAG_RADIANS_PER_PIXEL = 0.0035;
const PINCH_ZOOM_SENSITIVITY = 1.15;
/** Temporary approach distance for the picture fly-in. Step 5 replaces this with the framed focus move. */
const APPROACH_DISTANCE = 3.8;

function springLerp(current: number, target: number, speed: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-speed * dt));
}

export function GalaxyHero({
  images,
  onImageClick,
  focusedIndex,
  onFlyInComplete,
  onFlyOutComplete,
  scrollProgressRef,
}: GalaxyHeroProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onImageClickRef = useRef(onImageClick);
  onImageClickRef.current = onImageClick;
  const onFlyInCompleteRef = useRef(onFlyInComplete);
  onFlyInCompleteRef.current = onFlyInComplete;
  const onFlyOutCompleteRef = useRef(onFlyOutComplete);
  onFlyOutCompleteRef.current = onFlyOutComplete;
  const prevFocusedIndexRef = useRef<number | null>(null);
  // Commands from React to the frame loop.
  const stateCommandRef = useRef<{ type: "FLY_IN" | "FLY_OUT"; index?: number } | null>(null);

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
    let frozenRotX = 0;
    let flyInNotified = false;
    let rotVelY = BASE_SPIN;
    let rotVelX = 0;
    let appliedProgress = -1;
    let isDragging = false;
    let dragDistance = 0;
    let prevMouse = { x: 0, y: 0 };
    let lastMoveTime = 0;
    let hadMultiPointer = false;
    let pinchStartDistance = 0;
    let pinchStartCameraDistance = 0;
    const activePointers = new Map<number, { x: number; y: number }>();
    const helperCam = new THREE.PerspectiveCamera();
    const homeLook = new THREE.Vector3(0, 0, 0);

    let galaxy!: GalaxyScene;

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
            rotVelX = 0;
            targetRotVel = 0;
            frozenRotY = group.rotation.y;
            frozenRotX = group.rotation.x;
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

      // ── Rotation ──
      if (state === "IDLE" && !isDragging) {
        rotVelY = springLerp(rotVelY, BASE_SPIN, 1.2, dt);
        rotVelX *= Math.exp(-3 * dt);
        group.rotation.y += rotVelY * dt;
        group.rotation.x = THREE.MathUtils.clamp(group.rotation.x + rotVelX * dt, -SPIN_LIMIT_X, SPIN_LIMIT_X);
      } else if (state === "FLYING_IN" || state === "FOCUSED") {
        group.rotation.y = springLerp(group.rotation.y, frozenRotY, 8, dt);
        group.rotation.x = springLerp(group.rotation.x, frozenRotX, 8, dt);
        rotVelY = 0;
        rotVelX = 0;
      } else if (state === "FLYING_OUT") {
        rotVelY = springLerp(rotVelY, targetRotVel, 2, dt);
        rotVelX = springLerp(rotVelX, 0, 2, dt);
        group.rotation.y += rotVelY * dt;
        group.rotation.x = THREE.MathUtils.clamp(group.rotation.x + rotVelX * dt, -SPIN_LIMIT_X, SPIN_LIMIT_X);
      }

      // ── Scroll: the page decides how far the camera has moved into the galaxy ──
      const progress = scrollProgressRef?.current ?? 0;
      if (state === "IDLE" && progress !== appliedProgress) {
        appliedProgress = progress;
        const eased = progress * progress * (3 - 2 * progress);
        zoomCameraToDistance(THREE.MathUtils.lerp(galaxy.framingDistance, IMMERSED_DISTANCE, eased));
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
          appliedProgress = -1;
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
    };

    galaxy = new GalaxyScene(container, images, { onFrame });
    galaxy.camera.position.copy(galaxy.homePosition());
    galaxy.camera.lookAt(homeLook);

    // ── Input: the page owns vertical scroll. Pointers only turn the galaxy, pinch, and pick. ──
    const el = galaxy.domElement;
    el.style.cursor = "grab";

    const beginPinch = () => {
      const [a, b] = Array.from(activePointers.values());
      pinchStartDistance = a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
      pinchStartCameraDistance = galaxy.camera.position.length();
      hadMultiPointer = true;
      isDragging = false;
      dragDistance = 8;
      rotVelX = 0;
      rotVelY = 0;
    };

    const updatePinch = () => {
      const [a, b] = Array.from(activePointers.values());
      if (!a || !b || pinchStartDistance <= 0) return;
      const current = Math.hypot(a.x - b.x, a.y - b.y);
      if (current <= 0) return;
      const ratio = pinchStartDistance / current;
      zoomCameraToDistance(pinchStartCameraDistance * Math.pow(ratio, PINCH_ZOOM_SENSITIVITY));
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
      prevMouse = { x: e.clientX, y: e.clientY };
      lastMoveTime = performance.now();
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

      const dx = e.clientX - prevMouse.x;
      const dy = e.clientY - prevMouse.y;
      dragDistance += Math.abs(dx) + Math.abs(dy);
      const group = galaxy.group;
      group.rotation.y += dx * DRAG_RADIANS_PER_PIXEL;
      group.rotation.x = THREE.MathUtils.clamp(group.rotation.x + dy * DRAG_RADIANS_PER_PIXEL, -SPIN_LIMIT_X, SPIN_LIMIT_X);

      // Momentum after release comes from the speed of the last movement.
      const now = performance.now();
      const seconds = Math.max((now - lastMoveTime) / 1000, 0.008);
      rotVelY = (dx * DRAG_RADIANS_PER_PIXEL) / seconds;
      rotVelX = (dy * DRAG_RADIANS_PER_PIXEL) / seconds;
      lastMoveTime = now;
      prevMouse = { x: e.clientX, y: e.clientY };
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
      if (e.pointerType === "mouse") finishPointer(e, false);
    };
    const onHoverMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      if (state !== "IDLE") {
        el.style.cursor = "default";
        return;
      }
      if (isDragging) {
        el.style.cursor = "grabbing";
        return;
      }
      el.style.cursor = galaxy.pick(e.clientX, e.clientY) !== null ? "pointer" : "grab";
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
      galaxy.dispose();
    };
  }, [images]);

  return <div ref={containerRef} className="absolute inset-0" style={{ touchAction: "pan-y" }} />;
}
