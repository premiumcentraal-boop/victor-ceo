import * as THREE from "three";
import { DISC_LAYERS, discLayerPoints, homeDirection, placePictures, type DiscLayer } from "./layout";
import { fullscreenVertex, nebulaFragment, pointFragment, pointVertex } from "./shaders";

/** How much detail the scene draws. Steps down when a device cannot hold its frame rate. */
export type QualityTier = "high" | "medium" | "low";

const TIERS: Record<QualityTier, { pixelRatio: number; nebula: number; density: number }> = {
  high: { pixelRatio: 2, nebula: 1, density: 1 },
  medium: { pixelRatio: 1.5, nebula: 0.5, density: 0.7 },
  low: { pixelRatio: 1, nebula: 0, density: 0.4 },
};
const TIER_ORDER: QualityTier[] = ["high", "medium", "low"];

/** Average frame time (ms) above which the scene steps down a tier. */
const SLOW_FRAME_MS = 26;

const FOV_LANDSCAPE = 40;
/** On a portrait screen the disc is framed by its width, so this is the half-width kept in view. */
const PHONE_HALF_WIDTH = 3.4;
const BASE_HOME_DISTANCE = 12.5;
const MAX_HOME_DISTANCE = 22;

export const PICTURE_WIDTH = 1.35;
const SQRT2 = Math.SQRT2;
/** How far a hovered picture lifts towards the visitor, in world units. */
const HOVER_LIFT = 0.3;
/** Largest tilt, in radians, a hovered picture turns towards the pointer. */
const HOVER_TILT = 0.12;
/** How quickly the high-resolution picture dissolves in, per second. */
const FADE_RATE = 2.2;
const CYAN = new THREE.Color(0x67e8f9);
const AMBER = new THREE.Color(0xffd6aa);

export interface ScenePicture {
  index: number;
  /** Positions the picture on the disc and carries its lift. Its facing is set by `lookAt`. */
  anchor: THREE.Group;
  mesh: THREE.Mesh;
  halo: THREE.Mesh;
  /** Width divided by height. Stays at 1 : √2 until the picture's own texture has loaded. */
  aspect: number;
  /** Where the picture rests on the disc, and the direction it faces. */
  base: THREE.Vector3;
  normal: THREE.Vector3;
  /** 0 at rest, 1 when hovered or focused. Eased every frame. */
  hover: number;
  /** 0 normally, 1 when another picture is in focus. Eased every frame. */
  dim: number;
  /** 0 when not visited this session, 1 once opened. Eased every frame. */
  visited: number;
  /** The high-resolution picture, while it dissolves in over the preview. */
  fade: THREE.Mesh | null;
  fadeProgress: number;
  onFadeDone: (() => void) | null;
}

export interface GalaxySceneOptions {
  /** Called every frame, before rendering. `dt` is the simulated time since the last frame, in seconds. */
  onFrame?: (dt: number, elapsed: number) => void;
  /** Called when a picture's texture has loaded and its shape is known. */
  onPictureReady?: (index: number) => void;
}

interface NebulaPass {
  target: THREE.WebGLRenderTarget;
  uniforms: { uTime: { value: number }; uResolution: { value: THREE.Vector2 }; uIntensity: { value: number } };
  scene: THREE.Scene;
  present: THREE.Scene;
  camera: THREE.OrthographicCamera;
}

function makeHaloTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255,255,255,0.9)");
    gradient.addColorStop(0.45, "rgba(255,255,255,0.22)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
  }
  return new THREE.CanvasTexture(canvas);
}

function initialTier(): QualityTier {
  const forced = new URLSearchParams(window.location.search).get("quality");
  if (forced === "high" || forced === "medium" || forced === "low") return forced;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const constrained = (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4;
  const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  if (constrained) return "low";
  return mobile ? "medium" : "high";
}

/**
 * The galaxy: one WebGL context, one render loop and no input handling. The caller turns the disc,
 * moves the camera, decides what a click means, and says which picture is highlighted. This class
 * draws what it is told to draw.
 */
export class GalaxyScene {
  readonly camera: THREE.PerspectiveCamera;
  /** The disc and its pictures. The caller turns it. */
  readonly group = new THREE.Group();
  readonly pictures: ScenePicture[] = [];
  readonly domElement: HTMLCanvasElement;

  private readonly options: GalaxySceneOptions;
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly raycaster = new THREE.Raycaster();
  private readonly clock = new THREE.Clock(false);
  private readonly loader = new THREE.TextureLoader();
  private readonly haloTexture: THREE.CanvasTexture;
  private readonly textures: THREE.Texture[] = [];
  /** Each picture sharpens once. A second visit reuses the sharp texture, instead of adding another. */
  private readonly focusLoads = new Map<number, Promise<void>>();
  private readonly layers: { points: THREE.Points; material: THREE.ShaderMaterial; count: number; spin: number }[] = [];
  private readonly nebula: NebulaPass;
  private readonly fixedStep: boolean;
  private readonly forcedTier: boolean;

  private tier: QualityTier;
  private width = 1;
  private height = 1;
  private homeDistance = BASE_HOME_DISTANCE;
  private elapsed = 0;
  private frameId = 0;
  private running = false;
  private onscreen = true;
  private disposed = false;
  private warmupFrames = 0;
  private sampledFrames = 0;
  private sampledMs = 0;
  private hoveredIndex: number | null = null;
  private hoverTilt = { x: 0, y: 0 };
  private hoverRing = false;
  private focusedIndex: number | null = null;
  private visitedSet: ReadonlySet<number> = new Set();
  private lensFov = FOV_LANDSCAPE;
  private resizeObserver: ResizeObserver | null = null;
  private visibilityObserver: IntersectionObserver | null = null;

  constructor(container: HTMLElement, images: string[], options: GalaxySceneOptions = {}) {
    this.options = options;
    this.container = container;
    const params = new URLSearchParams(window.location.search);
    this.fixedStep = params.has("fixedstep");
    this.forcedTier = params.has("quality");
    this.tier = initialTier();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.autoClear = false;
    this.renderer.setClearColor(0x010101, 1);
    this.domElement = this.renderer.domElement;
    this.domElement.style.display = "block";
    container.appendChild(this.domElement);

    this.camera = new THREE.PerspectiveCamera(FOV_LANDSCAPE, 1, 0.1, 100);
    this.scene.add(this.group);
    this.haloTexture = makeHaloTexture();

    this.buildDisc();
    this.buildPictures(images);
    this.nebula = this.buildNebula();

    this.resetSampling();
    this.observe();
  }

  /** The lens for the overview on this screen, in degrees. The focus move narrows from it. */
  get baseFov(): number {
    return this.lensFov;
  }

  /** Distance from the centre at which the disc is framed on this screen. */
  get framingDistance(): number {
    return this.homeDistance;
  }

  /** The camera's home position, on the screen's framing distance. */
  homePosition(): THREE.Vector3 {
    const d = this.homeDistance;
    const [x, y, z] = homeDirection();
    return new THREE.Vector3(x * d, y * d, z * d);
  }

  get quality(): QualityTier {
    return this.tier;
  }

  /** Runs `onFrame` and renders on every frame, until `stop` or `dispose`. */
  start(): void {
    if (this.disposed || this.running) return;
    this.running = true;
    this.clock.start();
    this.frameId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frameId);
    this.clock.stop();
  }

  /**
   * Marks one picture as the one in focus. It stays lit, and the others dim, so the eye goes to it.
   * Pass null to bring the whole disc back.
   */
  setFocus(index: number | null): void {
    this.focusedIndex = index;
  }

  /**
   * Shifts the view down by `pixels`, so the picture centres in the visible area below the header
   * rather than in the middle of the whole screen. Pass 0 to clear it.
   */
  setViewShift(pixels: number): void {
    if (pixels === 0) {
      this.camera.clearViewOffset();
    } else {
      this.camera.setViewOffset(this.width, this.height, 0, -pixels, this.width, this.height);
    }
    this.camera.updateProjectionMatrix();
  }

  /** The picture's rectangle on screen, in CSS pixels, as the camera sees it right now. */
  screenRect(index: number): { x: number; y: number; width: number; height: number } | null {
    const picture = this.pictures[index];
    if (!picture) return null;
    this.group.updateMatrixWorld(true);
    const halfW = PICTURE_WIDTH / 2;
    const halfH = PICTURE_WIDTH / picture.aspect / 2;
    const corners = [
      new THREE.Vector3(-halfW, -halfH, 0),
      new THREE.Vector3(halfW, -halfH, 0),
      new THREE.Vector3(halfW, halfH, 0),
      new THREE.Vector3(-halfW, halfH, 0),
    ].map((c) => c.applyMatrix4(picture.anchor.matrixWorld).project(this.camera));
    const xs = corners.map((c) => ((c.x + 1) / 2) * this.width);
    const ys = corners.map((c) => ((1 - c.y) / 2) * this.height);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
  }

  /**
   * Highlights one picture. It lifts, tilts towards `tilt` (normalised pointer position, -1 to 1),
   * and glows brighter when `ring` is set, which is how keyboard focus shows.
   */
  setHover(index: number | null, tilt: { x: number; y: number } = { x: 0, y: 0 }, ring = false): void {
    this.hoveredIndex = index;
    this.hoverTilt = tilt;
    this.hoverRing = ring;
  }

  /** Marks the pieces this visitor has opened, so the galaxy remembers them. */
  setVisited(visited: ReadonlySet<number>): void {
    this.visitedSet = visited;
  }

  /**
   * Loads the high-resolution picture and dissolves it in over the preview. Resolves when the swap
   * is complete, or straight away if it cannot load: the preview stays in that case.
   */
  loadFocusTexture(index: number, url: string): Promise<void> {
    const loaded = this.focusLoads.get(index);
    if (loaded) return loaded;
    const promise = new Promise<void>((resolve) => {
      const picture = this.pictures[index];
      if (this.disposed || !picture) return resolve();
      this.loader.load(
        url,
        (texture) => {
          if (this.disposed) {
            texture.dispose();
            return resolve();
          }
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
          this.textures.push(texture);
          const overlay = new THREE.Mesh(
            picture.mesh.geometry,
            new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
          );
          // A hair in front of the preview, so the dissolve reads as the same picture sharpening.
          overlay.position.z = 0.006;
          picture.mesh.add(overlay);
          picture.fade = overlay;
          picture.fadeProgress = 0;
          picture.onFadeDone = resolve;
        },
        undefined,
        () => resolve()
      );
    });
    this.focusLoads.set(index, promise);
    return promise;
  }

  /**
   * The disc's rotation that turns this picture to face the visitor's home view, choosing the
   * equivalent turn nearest to `current`, so the disc never spins the long way round.
   */
  recenterRotation(index: number, current: number): number {
    const picture = this.pictures[index];
    if (!picture) return current;
    const [hx, , hz] = homeDirection();
    const pictureAngle = Math.atan2(picture.base.z, picture.base.x);
    const homeAngle = Math.atan2(hz, hx);
    // A rotation of r turns a point's angle by -r, so r = pictureAngle - homeAngle brings it to the camera.
    const target = pictureAngle - homeAngle;
    const turns = Math.round((current - target) / (2 * Math.PI));
    return target + turns * 2 * Math.PI;
  }

  /** The picture under a pointer, or null. */
  pick(clientX: number, clientY: number): number | null {
    const rect = this.domElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const ndc = this.toNdc(clientX, clientY);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.pictures.map((p) => p.mesh), false)[0];
    if (!hit) return null;
    return this.pictures.find((p) => p.mesh === hit.object)?.index ?? null;
  }

  /** Where a picture is on the screen, in CSS pixels from the top-left of the canvas. */
  projectPicture(index: number): { x: number; y: number; behind: boolean } | null {
    const picture = this.pictures[index];
    if (!picture) return null;
    const point = picture.anchor.getWorldPosition(new THREE.Vector3()).project(this.camera);
    return {
      x: ((point.x + 1) / 2) * this.width,
      y: ((1 - point.y) / 2) * this.height,
      behind: point.z > 1,
    };
  }

  /** Where a picture sits in the world right now, with its facing and size. */
  pictureWorldPose(index: number): { position: THREE.Vector3; normal: THREE.Vector3; quaternion: THREE.Quaternion; width: number; height: number } | null {
    const picture = this.pictures[index];
    if (!picture) return null;
    this.group.updateMatrixWorld(true);
    const quaternion = picture.anchor.getWorldQuaternion(new THREE.Quaternion());
    return {
      position: picture.anchor.getWorldPosition(new THREE.Vector3()),
      normal: new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion),
      quaternion,
      width: PICTURE_WIDTH,
      height: PICTURE_WIDTH / picture.aspect,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    this.resizeObserver?.disconnect();
    this.visibilityObserver?.disconnect();
    document.removeEventListener("visibilitychange", this.updateRunning);

    for (const layer of this.layers) {
      layer.points.geometry.dispose();
      layer.material.dispose();
    }
    for (const picture of this.pictures) {
      if (picture.fade) (picture.fade.material as THREE.Material).dispose();
      picture.mesh.geometry.dispose();
      (picture.mesh.material as THREE.Material).dispose();
      picture.halo.geometry.dispose();
      (picture.halo.material as THREE.Material).dispose();
    }
    this.textures.forEach((t) => t.dispose());
    this.haloTexture.dispose();
    this.nebula.target.dispose();

    this.renderer.dispose();
    this.renderer.forceContextLoss();
    if (this.domElement.parentElement === this.container) this.container.removeChild(this.domElement);
  }

  private toNdc(clientX: number, clientY: number): THREE.Vector2 {
    const rect = this.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
  }

  // ── Construction ─────────────────────────────────────────────────────────

  private buildDisc(): void {
    const layerOrder: DiscLayer[] = ["dust", "stars", "core"];
    const brightness: Record<DiscLayer, number> = { dust: 0.55, stars: 1.1, core: 1.35 };
    const scale: Record<DiscLayer, number> = { dust: 2.2, stars: 2.8, core: 3.4 };
    // The dust turns slowly against the disc. The difference reads as depth.
    const spin: Record<DiscLayer, number> = { dust: -0.035, stars: 0, core: 0 };

    for (const name of layerOrder) {
      const data = discLayerPoints(name);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
      geometry.setAttribute("aColor", new THREE.BufferAttribute(data.colors, 3));
      geometry.setAttribute("aSize", new THREE.BufferAttribute(data.sizes, 1));
      geometry.setAttribute("aSeed", new THREE.BufferAttribute(data.seeds, 1));
      const material = new THREE.ShaderMaterial({
        vertexShader: pointVertex,
        fragmentShader: pointFragment,
        uniforms: {
          uPixelRatio: { value: this.renderer.getPixelRatio() },
          uScale: { value: scale[name] },
          uTime: { value: 0 },
          uBrightness: { value: brightness[name] },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const points = new THREE.Points(geometry, material);
      this.group.add(points);
      this.layers.push({ points, material, count: DISC_LAYERS[name].count, spin: spin[name] });
    }
  }

  private buildPictures(images: string[]): void {
    const [fx, fy, fz] = homeDirection();
    const placements = placePictures(images.length, [fx, fy, fz]);
    images.forEach((url, index) => {
      const placement = placements[index];
      const [px, py, pz] = placement.position;
      const [nx, ny, nz] = placement.normal;

      // The anchor carries the position and facing. The mesh and halo turn within it, so hover tilt
      // never disturbs the picture's orientation.
      const anchor = new THREE.Group();
      anchor.position.set(px, py, pz);
      anchor.lookAt(px + nx, py + ny, pz + nz);

      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(PICTURE_WIDTH, PICTURE_WIDTH * SQRT2),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.96, side: THREE.DoubleSide })
      );
      const halo = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          map: this.haloTexture,
          color: 0x67e8f9,
          transparent: true,
          opacity: 0.3,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        })
      );
      halo.position.set(0, 0, -0.04);
      halo.scale.set(PICTURE_WIDTH * 2.2, PICTURE_WIDTH * SQRT2 * 2.2, 1);
      anchor.add(halo);
      anchor.add(mesh);
      this.group.add(anchor);

      this.pictures.push({
        index,
        anchor,
        mesh,
        halo,
        aspect: 1 / SQRT2,
        base: new THREE.Vector3(px, py, pz),
        normal: new THREE.Vector3(nx, ny, nz),
        hover: 0,
        dim: 0,
        visited: 0,
        fade: null,
        fadeProgress: 0,
        onFadeDone: null,
      });

      this.loader.crossOrigin = "anonymous";
      this.loader.load(
        url,
        (texture) => this.onPictureTexture(index, texture),
        undefined,
        () => {
          // A picture that fails to load keeps its place as a dark frame.
        }
      );
    });
  }

  private onPictureTexture(index: number, texture: THREE.Texture): void {
    if (this.disposed) {
      texture.dispose();
      return;
    }
    const picture = this.pictures[index];
    const image = texture.image as HTMLImageElement | undefined;
    const aspect = image && image.height ? image.width / image.height : 1 / SQRT2;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    this.textures.push(texture);

    picture.aspect = aspect;
    const height = PICTURE_WIDTH / aspect;
    picture.mesh.geometry.dispose();
    picture.mesh.geometry = new THREE.PlaneGeometry(PICTURE_WIDTH, height);
    picture.halo.scale.set(PICTURE_WIDTH * 2.2, height * 2.2, 1);
    (picture.mesh.material as THREE.MeshBasicMaterial).map = texture;
    (picture.mesh.material as THREE.MeshBasicMaterial).needsUpdate = true;
    this.options.onPictureReady?.(index);
  }

  private buildNebula(): NebulaPass {
    const target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
    const uniforms = {
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uIntensity: { value: 1.7 },
    };
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const scene = new THREE.Scene();
    scene.add(
      new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        new THREE.ShaderMaterial({ vertexShader: fullscreenVertex, fragmentShader: nebulaFragment, uniforms, depthTest: false, depthWrite: false })
      )
    );

    const present = new THREE.Scene();
    present.add(
      new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        new THREE.ShaderMaterial({
          vertexShader: fullscreenVertex,
          fragmentShader: /* glsl */ `
            uniform sampler2D tNebula;
            varying vec2 vUv;
            void main() { gl_FragColor = texture2D(tNebula, vUv); }
          `,
          uniforms: { tNebula: { value: target.texture } },
          depthTest: false,
          depthWrite: false,
        })
      )
    );
    return { target, uniforms, scene, present, camera };
  }

  // ── Frame, size and quality ──────────────────────────────────────────────

  private observe(): void {
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.container);
    }
    if (typeof IntersectionObserver !== "undefined") {
      this.visibilityObserver = new IntersectionObserver(([entry]) => {
        this.onscreen = entry ? entry.isIntersecting : true;
        this.updateRunning();
      });
      this.visibilityObserver.observe(this.container);
    }
    document.addEventListener("visibilitychange", this.updateRunning);
    this.resize();
  }

  /** Draws only while the hero is on screen and the tab is visible. */
  private updateRunning = (): void => {
    if (this.disposed) return;
    const shouldRun = this.onscreen && !document.hidden;
    if (shouldRun) this.start();
    else this.stop();
  };

  private resize(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;

    const aspect = width / height;
    this.camera.aspect = aspect;
    this.lensFov = aspect >= 1 ? FOV_LANDSCAPE : Math.min(66, FOV_LANDSCAPE + (1 - aspect) * 34);
    this.camera.fov = this.lensFov;
    this.camera.updateProjectionMatrix();
    const halfWidthPerUnit = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * aspect;
    this.homeDistance = THREE.MathUtils.clamp(
      Math.max(BASE_HOME_DISTANCE, PHONE_HALF_WIDTH / halfWidthPerUnit),
      BASE_HOME_DISTANCE,
      MAX_HOME_DISTANCE
    );
    this.camera.position.copy(this.homePosition());
    this.camera.lookAt(0, 0, 0);
    this.applyTier(this.tier);
  }

  private applyTier(tier: QualityTier): void {
    this.tier = tier;
    const settings = TIERS[tier];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, settings.pixelRatio));
    this.renderer.setSize(this.width, this.height);
    for (const layer of this.layers) {
      layer.points.geometry.setDrawRange(0, Math.floor(layer.count * settings.density));
      layer.material.uniforms.uPixelRatio.value = this.renderer.getPixelRatio();
    }
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const nebulaW = Math.max(1, Math.floor(size.x * settings.nebula));
    const nebulaH = Math.max(1, Math.floor(size.y * settings.nebula));
    this.nebula.target.setSize(nebulaW, nebulaH);
    this.nebula.uniforms.uResolution.value.set(nebulaW, nebulaH);
  }

  private resetSampling(): void {
    this.warmupFrames = 0;
    this.sampledFrames = 0;
    this.sampledMs = 0;
  }

  /** Steps the quality down when the average frame is too slow. Never steps back up, so it cannot oscillate. */
  private sample(realSeconds: number): void {
    // A long gap is the tab waking or the hero returning to view, not a slow frame.
    if (this.forcedTier || this.tier === "low" || realSeconds > 0.25) return;
    this.warmupFrames++;
    if (this.warmupFrames <= 45) return;
    this.sampledFrames++;
    this.sampledMs += realSeconds * 1000;
    if (this.sampledFrames < 60) return;
    const average = this.sampledMs / this.sampledFrames;
    this.sampledFrames = 0;
    this.sampledMs = 0;
    if (average > SLOW_FRAME_MS) {
      const next = TIER_ORDER[TIER_ORDER.indexOf(this.tier) + 1];
      if (next) this.applyTier(next);
    }
  }

  /** Eases each picture's lift, tilt and glow towards its hover state. */
  private updateHover(dt: number): void {
    const ease = 1 - Math.exp(-9 * dt);
    const focusing = this.focusedIndex !== null;
    for (const picture of this.pictures) {
      const lit = picture.index === this.hoveredIndex || picture.index === this.focusedIndex;
      picture.hover += ((lit ? 1 : 0) - picture.hover) * ease;
      picture.dim += ((focusing && picture.index !== this.focusedIndex ? 1 : 0) - picture.dim) * ease;
      const h = picture.hover;

      picture.anchor.position.copy(picture.base).addScaledVector(picture.normal, HOVER_LIFT * h);
      picture.mesh.rotation.set(-this.hoverTilt.y * HOVER_TILT * h, this.hoverTilt.x * HOVER_TILT * h, 0);

      picture.visited += ((this.visitedSet.has(picture.index) ? 1 : 0) - picture.visited) * ease;
      const dimmed = 1 - 0.65 * picture.dim;
      (picture.mesh.material as THREE.MeshBasicMaterial).opacity = 0.96 * dimmed;
      const halo = picture.halo.material as THREE.MeshBasicMaterial;
      const ring = picture.index === this.hoveredIndex && this.hoverRing ? 0.55 : 0;
      halo.color.lerpColors(CYAN, AMBER, picture.visited * 0.85);
      halo.opacity = (0.3 + 0.35 * h + ring * h + 0.1 * picture.visited) * dimmed;

      if (picture.fade) {
        picture.fadeProgress = Math.min(1, picture.fadeProgress + dt * FADE_RATE);
        const fade = picture.fade;
        const fadeMaterial = fade.material as THREE.MeshBasicMaterial;
        fadeMaterial.opacity = picture.fadeProgress * dimmed;
        if (picture.fadeProgress >= 1) {
          // The sharp picture takes over the mesh, and the overlay is removed.
          const sharp = fadeMaterial.map;
          (picture.mesh.material as THREE.MeshBasicMaterial).map = sharp;
          (picture.mesh.material as THREE.MeshBasicMaterial).needsUpdate = true;
          picture.mesh.remove(fade);
          fadeMaterial.dispose();
          picture.fade = null;
          const done = picture.onFadeDone;
          picture.onFadeDone = null;
          done?.();
        }
      }
    }
  }

  private tick = (): void => {
    if (!this.running) return;
    this.frameId = requestAnimationFrame(this.tick);
    const realSeconds = this.clock.getDelta();
    const dt = this.fixedStep ? 1 / 60 : Math.min(realSeconds, 0.05);
    this.elapsed += dt;

    for (const layer of this.layers) {
      layer.material.uniforms.uTime.value = this.elapsed;
      layer.points.rotation.y += layer.spin * dt;
    }
    this.nebula.uniforms.uTime.value = this.elapsed;

    this.options.onFrame?.(dt, this.elapsed);
    this.updateHover(dt);
    this.sample(realSeconds);
    this.render();
  };

  private render(): void {
    const renderer = this.renderer;
    if (TIERS[this.tier].nebula > 0) {
      renderer.setRenderTarget(this.nebula.target);
      renderer.clear();
      renderer.render(this.nebula.scene, this.nebula.camera);
      renderer.setRenderTarget(null);
      renderer.clear();
      renderer.render(this.nebula.present, this.nebula.camera);
    } else {
      renderer.clear();
    }
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }
}

