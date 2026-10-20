import { useEffect, useRef, type MutableRefObject } from "react";
import * as THREE from "three";

type GalleryState = "IDLE" | "FLYING_IN" | "FOCUSED" | "FLYING_OUT";

interface Cosmos3DOrbitGalleryProps {
  images: string[];
  onImageClick?: (imageIndex: number) => void;
  focusedIndex: number | null;
  onFlyInComplete?: () => void;
  onFlyOutComplete?: () => void;
  // Page scroll progress, 0 (overview) to 1 (immersed). The page owns the scroll; the scene only reads it.
  scrollProgressRef?: MutableRefObject<number>;
}

export function Cosmos3DOrbitGallery({
  images,
  onImageClick,
  focusedIndex,
  onFlyInComplete,
  onFlyOutComplete,
  scrollProgressRef,
}: Cosmos3DOrbitGalleryProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onImageClickRef = useRef(onImageClick);
  onImageClickRef.current = onImageClick;
  const onFlyInCompleteRef = useRef(onFlyInComplete);
  onFlyInCompleteRef.current = onFlyInComplete;
  const onFlyOutCompleteRef = useRef(onFlyOutComplete);
  onFlyOutCompleteRef.current = onFlyOutComplete;
  const focusedIndexRef = useRef(focusedIndex);
  const prevFocusedIndexRef = useRef<number | null>(null);

  // Communicate focusedIndex changes into the Three.js loop
  const stateCommandRef = useRef<{
    type: "FLY_IN" | "FLY_OUT";
    index?: number;
  } | null>(null);

  useEffect(() => {
    const prev = prevFocusedIndexRef.current;
    const curr = focusedIndex;
    focusedIndexRef.current = curr;

    if (prev === null && curr !== null) {
      // Start fly-in
      stateCommandRef.current = { type: "FLY_IN", index: curr };
    } else if (prev !== null && curr === null) {
      // Start fly-out
      stateCommandRef.current = { type: "FLY_OUT" };
    }
    prevFocusedIndexRef.current = curr;
  }, [focusedIndex]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // ── Scene setup ──
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    const HOME_POS = new THREE.Vector3(-7, 1, 7);
    const HOME_LOOK = new THREE.Vector3(0, 0, 0);
    // Scroll moves the camera between these two distances from the centre.
    const HOME_DISTANCE = HOME_POS.length();
    const IMMERSED_DISTANCE = 6.2;
    let appliedProgress = -1;
    camera.position.copy(HOME_POS);
    camera.lookAt(HOME_LOOK);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    // ── Lights ──
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const p1 = new THREE.PointLight(0xffffff, 1);
    p1.position.set(10, 10, 10);
    scene.add(p1);
    const p2 = new THREE.PointLight(0x06b6d4, 0.3);
    p2.position.set(-10, -5, -10);
    scene.add(p2);

    const group = new THREE.Group();
    scene.add(group);

    const PARTICLE_COUNT = 1500;
    const SPHERE_RADIUS = 5;
    const POSITION_RANDOMNESS = 2.5;
    // A3 proportions: 297mm × 420mm → width:height = 1:√2
    const IMAGE_W = 1.6;
    const IMAGE_H = IMAGE_W * Math.SQRT2;

    // ── Particles ──
    const particleGeo = new THREE.SphereGeometry(1, 8, 6);
    const instancedMesh = new THREE.InstancedMesh(
      particleGeo,
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8 }),
      PARTICLE_COUNT
    );
    (instancedMesh.material as THREE.MeshBasicMaterial).color.setHSL(
      0.52,
      0.6,
      0.6
    );
    const dummy = new THREE.Object3D();

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const phi = Math.acos(-1 + (2 * i) / PARTICLE_COUNT);
      const theta = Math.sqrt(PARTICLE_COUNT * Math.PI) * phi;
      const rv =
        SPHERE_RADIUS + (Math.random() - 0.5) * POSITION_RANDOMNESS;
      dummy.position.set(
        rv * Math.cos(theta) * Math.sin(phi),
        rv * Math.cos(phi),
        rv * Math.sin(theta) * Math.sin(phi)
      );
      dummy.scale.setScalar(Math.random() * 0.005 + 0.005);
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
    }
    instancedMesh.instanceMatrix.needsUpdate = true;
    group.add(instancedMesh);

    // ── Image planes ──
    const imageMeshes: THREE.Mesh[] = [];
    const meshToIndex = new Map<THREE.Mesh, number>();
    const textureLoader = new THREE.TextureLoader();
    textureLoader.crossOrigin = "anonymous";

    images.forEach((url, i) => {
      textureLoader.load(url, (texture) => {
        const angle = (i / images.length) * Math.PI * 2;
        const x = SPHERE_RADIUS * Math.cos(angle);
        const y = Math.sin(i * 1.7) * 1.2;
        const z = SPHERE_RADIUS * Math.sin(angle);

        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(IMAGE_W, IMAGE_H),
          new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 0.95,
            side: THREE.DoubleSide,
          })
        );
        mesh.position.set(x, y, z);
        const outward = new THREE.Vector3(x, y, z).normalize();
        mesh.lookAt(mesh.position.clone().add(outward));

        group.add(mesh);
        imageMeshes.push(mesh);
        meshToIndex.set(mesh, i);
      });
    });

    // ── Vignette overlay (fullscreen quad in front of camera) ──
    const vignetteMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
    });
    const vignetteQuad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      vignetteMat
    );
    vignetteQuad.frustumCulled = false;
    vignetteQuad.renderOrder = 999;
    // We'll position it in front of camera each frame
    scene.add(vignetteQuad);

    // ── Interaction state ──
    const MIN_CAMERA_DISTANCE = 5;
    const MAX_CAMERA_DISTANCE = 25;
    const PINCH_ZOOM_SENSITIVITY = 1.15;
    let isDragging = false;
    let dragDistance = 0;
    let prevMousePos = { x: 0, y: 0 };
    let rotVelX = 0;
    let rotVelY = 0.001;
    let hadMultiPointerGesture = false;
    let pinchStartDistance = 0;
    let pinchStartCameraDistance = camera.position.length();
    const activePointers = new Map<number, { x: number; y: number }>();

    // ── Camera fly state ──
    let state: GalleryState = "IDLE";
    let targetCamPos = HOME_POS.clone();
    let targetLookAt = HOME_LOOK.clone();
    let targetRotVel = 0.001;
    let vignetteTarget = 0;
    let flyProgress = 0;
    let flyTargetMeshIdx: number | null = null;
    let frozenGroupRotY = 0;
    let frozenGroupRotX = 0;
    let flyInNotified = false; // whether we've already called onFlyInComplete

    // Helper camera for computing target quaternion
    const helperCam = new THREE.PerspectiveCamera();

    const APPROACH_DISTANCE = 3.8;

    const computeFlyTarget = (idx: number) => {
      const mesh = imageMeshes.find(
        (m) => meshToIndex.get(m) === idx
      );
      if (!mesh) return null;

      // Get world position & orientation of the image (accounts for current group rotation)
      const worldPos = new THREE.Vector3();
      mesh.getWorldPosition(worldPos);

      // The mesh faces outward from sphere center — its local +Z in world space
      const worldNormal = new THREE.Vector3(0, 0, 1);
      const worldQuat = new THREE.Quaternion();
      mesh.getWorldQuaternion(worldQuat);
      worldNormal.applyQuaternion(worldQuat);

      // Camera target: in front of the image, facing it
      const camPos = worldPos.clone().add(worldNormal.multiplyScalar(APPROACH_DISTANCE));
      return { camPos, lookAt: worldPos };
    };

    // ── Raycaster ──
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const getPinchDistance = () => {
      const pointers = Array.from(activePointers.values());
      if (pointers.length < 2) return 0;
      const [a, b] = pointers;
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    const zoomCameraToDistance = (distance: number) => {
      const nextDistance = THREE.MathUtils.clamp(
        distance,
        MIN_CAMERA_DISTANCE,
        MAX_CAMERA_DISTANCE
      );
      camera.position.normalize().multiplyScalar(nextDistance);
      camera.lookAt(HOME_LOOK);
    };

    const beginPinchGesture = () => {
      pinchStartDistance = getPinchDistance();
      pinchStartCameraDistance = camera.position.length();
      hadMultiPointerGesture = true;
      isDragging = false;
      dragDistance = 8;
      rotVelX = 0;
      rotVelY = 0;
    };

    const updatePinchZoom = () => {
      if (pinchStartDistance <= 0) return;
      const currentDistance = getPinchDistance();
      if (currentDistance <= 0) return;
      const zoomRatio = pinchStartDistance / currentDistance;
      zoomCameraToDistance(
        pinchStartCameraDistance * Math.pow(zoomRatio, PINCH_ZOOM_SENSITIVITY)
      );
    };

    const onPointerDown = (e: PointerEvent) => {
      if (state !== "IDLE") return;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // Pointer capture can fail if the browser has already cancelled the gesture.
      }

      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (activePointers.size >= 2) {
        beginPinchGesture();
        return;
      }

      hadMultiPointerGesture = false;
      isDragging = true;
      dragDistance = 0;
      prevMousePos = { x: e.clientX, y: e.clientY };
    };

    const onPointerMove = (e: PointerEvent) => {
      if (state !== "IDLE") return;

      if (activePointers.has(e.pointerId)) {
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      if (activePointers.size >= 2) {
        updatePinchZoom();
        return;
      }

      if (!isDragging || activePointers.size !== 1) return;
      const dx = e.clientX - prevMousePos.x;
      const dy = e.clientY - prevMousePos.y;
      dragDistance += Math.abs(dx) + Math.abs(dy);
      rotVelY = dx * 0.003;
      rotVelX = dy * 0.003;
      prevMousePos = { x: e.clientX, y: e.clientY };
    };

    const finishPointer = (e: PointerEvent, allowClick: boolean) => {
      const wasClick =
        allowClick &&
        !hadMultiPointerGesture &&
        activePointers.size === 1 &&
        dragDistance < 6;

      activePointers.delete(e.pointerId);
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        // It is fine if capture was already released by the browser.
      }

      isDragging = false;

      if (
        wasClick &&
        state === "IDLE" &&
        onImageClickRef.current &&
        imageMeshes.length > 0
      ) {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObjects(imageMeshes, false);
        if (hits.length > 0) {
          const idx = meshToIndex.get(hits[0].object as THREE.Mesh);
          if (idx !== undefined) onImageClickRef.current(idx);
        }
      }

      if (activePointers.size === 0) {
        hadMultiPointerGesture = false;
        pinchStartDistance = 0;
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      finishPointer(e, true);
    };

    const onPointerCancel = (e: PointerEvent) => {
      finishPointer(e, false);
    };

    const onPointerLeave = (e: PointerEvent) => {
      if (e.pointerType === "mouse") finishPointer(e, false);
    };

    // The page owns vertical scrolling. The wheel and touch drags are not captured here.
    const el = renderer.domElement;
    el.style.cursor = "grab";
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerCancel);
    el.addEventListener("pointerleave", onPointerLeave);

    // ── Resize ──
    const onResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener("resize", onResize);

    // ── Hover cursor ──
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
      const rect = el.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(imageMeshes, false);
      el.style.cursor = hits.length > 0 ? "pointer" : "grab";
    };
    el.addEventListener("pointermove", onHoverMove);

    // ── Clock for delta time ──
    const clock = new THREE.Clock();

    // ── Spring lerp helper ──
    // Exponential decay: approaches target with no linear segments
    const springLerp = (
      current: number,
      target: number,
      speed: number,
      dt: number
    ) => {
      return current + (target - current) * (1 - Math.exp(-speed * dt));
    };

    let animId = 0;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05); // cap to prevent jumps

      // ── Scroll dolly: the page scroll decides how far the camera has moved into the galaxy ──
      const progress = scrollProgressRef?.current ?? 0;
      if (state === "IDLE" && progress !== appliedProgress) {
        appliedProgress = progress;
        const eased = progress * progress * (3 - 2 * progress);
        zoomCameraToDistance(THREE.MathUtils.lerp(HOME_DISTANCE, IMMERSED_DISTANCE, eased));
      }

      // ── Process commands from React ──
      const cmd = stateCommandRef.current;
      if (cmd) {
        stateCommandRef.current = null;
        if (cmd.type === "FLY_IN" && cmd.index !== undefined && state === "IDLE") {
          const target = computeFlyTarget(cmd.index);
          if (target) {
            state = "FLYING_IN";
            flyTargetMeshIdx = cmd.index;
            targetCamPos = target.camPos;
            targetLookAt = target.lookAt;
            rotVelY = 0;
            rotVelX = 0;
            targetRotVel = 0;
            frozenGroupRotY = group.rotation.y;
            frozenGroupRotX = group.rotation.x;
            // DON'T set vignette yet — it starts later based on progress
            vignetteTarget = 0;
            flyProgress = 0;
            flyInNotified = false;
          }
        } else if (cmd.type === "FLY_OUT" && (state === "FOCUSED" || state === "FLYING_IN")) {
          state = "FLYING_OUT";
          flyTargetMeshIdx = null;
          flyInNotified = false;
          targetCamPos = HOME_POS.clone();
          targetLookAt = HOME_LOOK.clone();
          targetRotVel = 0.001;
          vignetteTarget = 0;
          flyProgress = 0;
        }
      }

      // ── Rotation ──
      if (state === "IDLE" && !isDragging) {
        rotVelY += (0.001 - rotVelY) * 0.02;
        rotVelX *= 0.95;
      } else if (state === "FLYING_IN" || state === "FOCUSED") {
        group.rotation.y = springLerp(group.rotation.y, frozenGroupRotY, 8, dt);
        group.rotation.x = springLerp(group.rotation.x, frozenGroupRotX, 8, dt);
        rotVelY = 0;
        rotVelX = 0;
      } else if (state === "FLYING_OUT") {
        rotVelY = springLerp(rotVelY, targetRotVel, 2, dt);
        rotVelX = springLerp(rotVelX, 0, 2, dt);
        group.rotation.y += rotVelY;
        group.rotation.x += rotVelX;
      }
      if (state === "IDLE") {
        group.rotation.y += rotVelY;
        group.rotation.x += rotVelX;
      }

      // ── Camera fly-in ──
      if (state === "FLYING_IN") {
        // Recompute target every frame from live mesh position
        if (flyTargetMeshIdx !== null) {
          const liveTarget = computeFlyTarget(flyTargetMeshIdx);
          if (liveTarget) {
            targetCamPos = liveTarget.camPos;
            targetLookAt = liveTarget.lookAt;
          }
        }

        // Slow, graceful spring — speed 1.8 gives a ~3s approach
        const flySpeed = 1.8;
        camera.position.x = springLerp(camera.position.x, targetCamPos.x, flySpeed, dt);
        camera.position.y = springLerp(camera.position.y, targetCamPos.y, flySpeed, dt);
        camera.position.z = springLerp(camera.position.z, targetCamPos.z, flySpeed, dt);

        helperCam.position.copy(camera.position);
        helperCam.lookAt(targetLookAt);
        camera.quaternion.slerp(helperCam.quaternion, 1 - Math.exp(-2.5 * dt));

        flyProgress = springLerp(flyProgress, 1, flySpeed, dt);

        // ── Phase 1 (progress < 0.55): no vignette, just camera moving
        // ── Phase 2 (progress 0.55–0.85): vignette fades in
        // ── Phase 3 (progress > 0.85): vignette is opaque → notify React
        if (flyProgress < 0.55) {
          vignetteTarget = 0;
        } else {
          vignetteTarget = 1.0;
        }

        // When vignette is nearly opaque, the screen is black → open the viewer
        if (vignetteMat.opacity > 0.92 && !flyInNotified) {
          flyInNotified = true;
          state = "FOCUSED";
          // Snap to exact position
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
        const dist = camera.position.distanceTo(targetCamPos);

        if (dist < 0.15 && flyProgress > 0.92) {
          state = "IDLE";
          appliedProgress = -1; // re-apply the scroll position on the next frame
          camera.position.copy(HOME_POS);
          camera.lookAt(HOME_LOOK);
          flyTargetMeshIdx = null;
          onFlyOutCompleteRef.current?.();
        }
      }

      // ── Focused: keep camera locked ──
      if (state === "FOCUSED") {
        if (flyTargetMeshIdx !== null) {
          const liveTarget = computeFlyTarget(flyTargetMeshIdx);
          if (liveTarget) {
            camera.position.lerp(liveTarget.camPos, 1 - Math.exp(-6 * dt));
            helperCam.position.copy(camera.position);
            helperCam.lookAt(liveTarget.lookAt);
            camera.quaternion.slerp(helperCam.quaternion, 1 - Math.exp(-6 * dt));
          }
        }
      }

      // ── Vignette ──
      const vigSpeed = state === "FLYING_IN" ? 3.5 : 5;
      vignetteMat.opacity = springLerp(vignetteMat.opacity, vignetteTarget, vigSpeed, dt);
      // Position vignette quad right in front of camera
      const vigForward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      vignetteQuad.position.copy(camera.position).add(vigForward.multiplyScalar(0.11));
      vignetteQuad.quaternion.copy(camera.quaternion);

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerCancel);
      el.removeEventListener("pointerleave", onPointerLeave);
      el.removeEventListener("pointermove", onHoverMove);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (container.contains(el)) container.removeChild(el);
    };
  }, [images]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ touchAction: "pan-y" }}
    />
  );
}
