import * as THREE from "three";
import {
  DEEP_FIELD,
  DRIFT,
  FLOW,
  GALAXY,
  GALAXY_LAYERS,
  STARFIELD,
  deepFieldPoints,
  driftPoints,
  flowPoints,
  galaxyLayerPoints,
  homeDirection,
  placePictures,
  starfieldPoints,
  type GalaxyLayer,
  type LayerPoints,
} from "./layout";
import { domeFragment, domeVertex, driftVertex, flowVertex, hazeFragment, hazeVertex, pointFragment, pointVertex, universeFragment, universeVertex } from "./shaders";
import { PARALLAX, UNIVERSE, bandNormal, farGalaxies, nebulaCentres } from "./universe";
import { flareAt, shockAt } from "../camera/zoom";

/** How much detail the scene draws. Steps down when a device cannot hold its frame rate. */
export type QualityTier = "high" | "medium" | "low";

/** `universe` is the size of each face of the far universe's cube texture, in pixels. It is drawn once, at the first tier. */
const TIERS: Record<QualityTier, { pixelRatio: number; universe: number; density: number }> = {
  high: { pixelRatio: 2, universe: 1024, density: 1 },
  medium: { pixelRatio: 1.5, universe: 768, density: 0.7 },
  low: { pixelRatio: 1, universe: 512, density: 0.4 },
};
const TIER_ORDER: QualityTier[] = ["high", "medium", "low"];

/** Average frame time (ms) above which the scene steps down a tier. */
const SLOW_FRAME_MS = 26;

const FOV_LANDSCAPE = 40;
/** The far plane sits beyond the far universe's dome, so the furthest sky is drawn. */
const FAR_PLANE = 300;
/** On a portrait screen the ring of pictures is framed by its width, so this is the half-width kept in view. */
const PHONE_HALF_WIDTH = 4.4;
const BASE_HOME_DISTANCE = 13;
/**
 * How far the arms swing round, in radians at the core, and less further out. The swing is bounded, so the
 * arms keep their shape however long the visitor stays, but it is large enough that the spiral reads as alive.
 */
const SWIRL = 0.5;
/** The core's brightness at the overview. The dive dims it from here. */
const CORE_BRIGHTNESS = 1.6;
/** The glow of the spiral arms, flat in the galaxy's plane. It fades out round the ring of pictures. */
const HAZE_RADIUS = GALAXY.outerRadius * 1.3;
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
/** The far universe turns on its own about this axis, tilted so its drift is never a plain spin. */
const SKY_DRIFT_AXIS = new THREE.Vector3(0.2, 1, 0.12).normalize();
const AMBER = new THREE.Color(0xffd6aa);
/** The scene drawing into each container. A container holds one galaxy, so a new scene replaces the old one. */
const activeScenes = new WeakMap<HTMLElement, GalaxyScene>();

export interface ScenePicture {
  index: number;
  /** Positions the picture on the ring and carries its lift. Its facing is set by `lookAt`. */
  anchor: THREE.Group;
  mesh: THREE.Mesh;
  halo: THREE.Mesh;
  /** Width divided by height. Stays at 1 : √2 until the picture's own texture has loaded. */
  aspect: number;
  /** Where the picture rests on the ring, and the direction it faces. */
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

/** The far universe: painted once into a cube texture, a face a frame, then shown on a dome round the camera. */
interface UniversePass {
  target: THREE.WebGLCubeRenderTarget;
  camera: THREE.CubeCamera;
  scene: THREE.Scene;
  dome: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  /** How many of the cube's six faces are painted so far. */
  faces: number;
  /** 0 until the sky is painted, then rising to 1 as it fades in. */
  fade: number;
}

/** A part of the sky that moves with the galaxy, by `share` of the galaxy's own movement. */
interface SkyLayer {
  object: THREE.Object3D;
  share: number;
}

/** A ring of soft light for the shockwave: bright on a circle, dark at its centre and its edge. */
function makeRingTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    gradient.addColorStop(0, "rgba(255, 240, 210, 0)");
    gradient.addColorStop(0.62, "rgba(255, 240, 210, 0)");
    gradient.addColorStop(0.84, "rgba(255, 236, 200, 1)");
    gradient.addColorStop(0.95, "rgba(255, 220, 170, 0)");
    gradient.addColorStop(1, "rgba(255, 220, 170, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);
  }
  return new THREE.CanvasTexture(canvas);
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
 * The galaxy: one WebGL context, one render loop and no input handling. The caller turns the galaxy,
 * moves the camera, decides what a click means, and says which picture is highlighted. This class
 * draws what it is told to draw.
 */
export class GalaxyScene {
  readonly camera: THREE.PerspectiveCamera;
  /** The galaxy and its pictures. The caller turns it. */
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
  private readonly layers: { points: THREE.Points; material: THREE.ShaderMaterial; count: number }[] = [];
  private haze: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> | null = null;
  private coreGlow: THREE.Sprite | null = null;
  private flowMaterial: THREE.ShaderMaterial | null = null;
  private coreMaterial: THREE.ShaderMaterial | null = null;
  /** How far the camera has dived into the core, 0 to 1. The core softens as the camera nears, so it glows rather than whites out. */
  private coreTravel = 0;
  /** How far the camera has passed through the core, past the gallery's arrival, 0 to 1. Drives the flare and the shockwave. */
  private reveal = 0;
  private shock: THREE.Sprite | null = null;
  private flowDistance = 0;
  private flowStrength = 0;
  private readonly universe: UniversePass;
  private readonly skyLayers: SkyLayer[] = [];
  /** Which way the camera looks from at home. The sky follows the camera's swing away from it. */
  private readonly homeDir = new THREE.Vector3(...homeDirection()).normalize();
  private readonly orbit = new THREE.Quaternion();
  private readonly skyTurn = new THREE.Quaternion();
  private readonly skyFollow = new THREE.Quaternion();
  private readonly skyDrift = new THREE.Quaternion();
  private readonly skyEuler = new THREE.Euler();
  private readonly cameraDir = new THREE.Vector3();
  private readonly fixedStep: boolean;
  private readonly forcedTier: boolean;

  private tier: QualityTier;
  private width = 1;
  private height = 1;
  private homeDistance = BASE_HOME_DISTANCE;
  private elapsed = 0;
  /** When set, the twinkle and the sky's own drift hold still. Read every frame, so it follows the visitor's setting. */
  private motionReduced = false;
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
    // Free the old galaxy first, so two WebGL contexts never draw into one container.
    activeScenes.get(container)?.dispose();
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
    // Backstop: no other canvas may stay in the container beside this one.
    for (const child of Array.from(container.children)) {
      if (child instanceof HTMLCanvasElement && child !== this.domElement) container.removeChild(child);
    }
    container.appendChild(this.domElement);
    activeScenes.set(container, this);

    this.camera = new THREE.PerspectiveCamera(FOV_LANDSCAPE, 1, 0.1, FAR_PLANE);
    this.scene.add(this.group);
    this.haloTexture = makeHaloTexture();

    this.buildGalaxy();
    this.buildSky();
    this.buildDrift();
    this.buildFlow();
    this.buildPictures(images);
    this.universe = this.buildUniverse(TIERS[this.tier].universe);

    this.resetSampling();
    this.observe();
  }

  /** The lens for the overview on this screen, in degrees. The focus move narrows from it. */
  get baseFov(): number {
    return this.lensFov;
  }

  /** Distance from the centre at which the galaxy and its ring are framed on this screen. */
  get framingDistance(): number {
    return this.homeDistance;
  }

  /** The camera's home position, on the screen's framing distance. A pitch lifts or lowers the camera. */
  homePosition(pitch?: number): THREE.Vector3 {
    const d = this.homeDistance;
    const [x, y, z] = homeDirection(pitch);
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
   * Sets how far the stars that rush past the visitor have travelled, and how strongly they show. The caller
   * drives both from the page's scroll, so scrolling carries the visitor through the sky. Zero hides them.
   */
  setFlow(distance: number, strength: number): void {
    this.flowDistance = distance;
    this.flowStrength = strength;
  }

  /** Sets how far the camera has dived into the core. The core dims and softens as it closes in, so it glows. */
  setCoreTravel(travel: number): void {
    this.coreTravel = travel;
  }

  /** Sets how far the camera has passed through the core as the gallery rises, 0 to 1. The core flares and a ring of light leaves it. */
  setReveal(reveal: number): void {
    this.reveal = reveal;
  }

  /**
   * Marks one picture as the one in focus. It stays lit, and the others dim, so the eye goes to it.
   * Pass null to bring the whole galaxy back.
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

  /** Holds the twinkle and the sky's drift still, for a visitor who asks for reduced motion. */
  setReducedMotion(reduced: boolean): void {
    this.motionReduced = reduced;
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
   * The galaxy's rotation that turns this picture to face the visitor's home view, choosing the
   * equivalent turn nearest to `current`, so the galaxy never spins the long way round.
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
    if (activeScenes.get(this.container) === this) activeScenes.delete(this.container);
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
    if (this.haze) {
      this.haze.geometry.dispose();
      this.haze.material.dispose();
    }
    if (this.coreGlow) {
      this.coreGlow.material.map?.dispose();
      this.coreGlow.material.dispose();
    }
    if (this.shock) {
      this.shock.material.map?.dispose();
      this.shock.material.dispose();
    }
    this.universe.target.dispose();
    this.universe.dome.geometry.dispose();
    this.universe.dome.material.dispose();
    for (const child of this.universe.scene.children) {
      const mesh = child as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
      mesh.geometry.dispose();
      mesh.material.dispose();
    }

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

  /**
   * One layer of stars: its geometry from `data`, drawn with the given shader and values. The layer joins the
   * quality tiers, so a weaker device draws fewer of its stars.
   */
  private addPoints(parent: THREE.Object3D, data: LayerPoints, vertexShader: string, values: Record<string, number>, count: number): THREE.Points {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(data.colors, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(data.sizes, 1));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(data.seeds, 1));
    const uniforms: Record<string, THREE.IUniform> = {
      uPixelRatio: { value: this.renderer.getPixelRatio() },
      uTime: { value: 0 },
    };
    for (const [name, value] of Object.entries(values)) uniforms[name] = { value };
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: pointFragment,
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geometry, material);
    parent.add(points);
    this.layers.push({ points, material, count });
    return points;
  }

  private buildGalaxy(): void {
    const layerOrder: GalaxyLayer[] = ["field", "dust", "stars", "core"];
    const brightness: Record<GalaxyLayer, number> = { field: 1.15, dust: 0.9, stars: 1.5, core: CORE_BRIGHTNESS };
    const scale: Record<GalaxyLayer, number> = { field: 2.0, dust: 2.2, stars: 2.8, core: 3.4 };

    for (const name of layerOrder) {
      const points = this.addPoints(
        this.group,
        galaxyLayerPoints(name),
        pointVertex,
        { uScale: scale[name], uBrightness: brightness[name], uSwirl: SWIRL },
        GALAXY_LAYERS[name].count
      );
      if (name === "core") this.coreMaterial = points.material as THREE.ShaderMaterial;
    }

    this.buildHaze();
    this.buildCoreGlow();
  }

  /** The spiral arms as a glow, flat in the galaxy's plane, turning with the stars. */
  private buildHaze(): void {
    const material = new THREE.ShaderMaterial({
      vertexShader: hazeVertex,
      fragmentShader: hazeFragment,
      uniforms: {
        uTime: { value: 0 },
        uSwirl: { value: SWIRL },
        uOuter: { value: HAZE_RADIUS },
        uInner: { value: GALAXY.innerRadius },
        uArms: { value: GALAXY.arms },
        uWinding: { value: GALAXY.winding },
        uIntensity: { value: 0.9 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.haze = new THREE.Mesh(new THREE.PlaneGeometry(HAZE_RADIUS * 2, HAZE_RADIUS * 2), material);
    this.haze.rotation.x = -Math.PI / 2;
    this.group.add(this.haze);
  }

  /** A soft, bright core, so the centre of the galaxy burns. */
  private buildCoreGlow(): void {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    if (context) {
      const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
      gradient.addColorStop(0.22, "rgba(255, 220, 170, 0.6)");
      gradient.addColorStop(1, "rgba(255, 200, 140, 0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 128, 128);
    }
    const map = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    this.coreGlow = new THREE.Sprite(material);
    this.coreGlow.scale.set(2.8, 2.8, 1);
    this.group.add(this.coreGlow);
    this.buildShock();
  }

  /** The shockwave: a ring of light that leaves the core as the camera passes through it. Hidden until the reveal. */
  private buildShock(): void {
    const material = new THREE.SpriteMaterial({ map: makeRingTexture(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 });
    this.shock = new THREE.Sprite(material);
    this.shock.scale.set(2, 2, 1);
    this.group.add(this.shock);
  }

  /** A part of the sky that moves with the galaxy by `share` of its movement, so the further it is, the less it moves. */
  private addSkyLayer(share: number): THREE.Group {
    const object = new THREE.Group();
    this.scene.add(object);
    this.skyLayers.push({ object, share });
    return object;
  }

  /** The stars beyond the galaxy: a far field and a deeper one further out. Each moves less than the galaxy. */
  private buildSky(): void {
    this.addPoints(this.addSkyLayer(PARALLAX.starfield), starfieldPoints(), pointVertex, { uScale: 2.6, uBrightness: 1.0, uSwirl: 0 }, STARFIELD.count);
    this.addPoints(this.addSkyLayer(PARALLAX.deepField), deepFieldPoints(), pointVertex, { uScale: 2.2, uBrightness: 0.8, uSwirl: 0 }, DEEP_FIELD.count);
  }

  /** Stars floating in the space round the galaxy. They bob in place, and move with it a little. */
  private buildDrift(): void {
    this.addPoints(this.addSkyLayer(PARALLAX.drift), driftPoints(), driftVertex, { uScale: 3.6, uBrightness: 0.8 }, DRIFT.count);
  }

  /** The stars that rush past the visitor as the page scrolls. They are drawn in the view, and hidden until the flow starts. */
  private buildFlow(): void {
    const points = this.addPoints(
      this.scene,
      flowPoints(),
      flowVertex,
      { uScale: 4.6, uBrightness: 1.1, uNear: FLOW.near, uDepth: FLOW.depth, uFlow: 0, uStrength: 0 },
      FLOW.count
    );
    // The lanes are in the view, not the world, so the stars would be culled from the wrong place.
    points.frustumCulled = false;
    this.flowMaterial = points.material as THREE.ShaderMaterial;
  }

  private buildPictures(images: string[]): void {
    const placements = placePictures(images.length);
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

  /**
   * The far universe: a scene with one sphere that paints the sky by direction, a cube camera to capture it, and
   * the dome that shows the capture. The dome is drawn first, behind everything, and follows the camera.
   */
  private buildUniverse(size: number): UniversePass {
    const target = new THREE.WebGLCubeRenderTarget(size, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    const camera = new THREE.CubeCamera(0.1, 10, target);
    const galaxies = farGalaxies();
    const scene = new THREE.Scene();
    scene.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(1, 48, 24),
        new THREE.ShaderMaterial({
          vertexShader: universeVertex,
          fragmentShader: universeFragment,
          uniforms: {
            uBandNormal: { value: new THREE.Vector3(...bandNormal()) },
            uNebula: { value: nebulaCentres().map((c) => new THREE.Vector3(...c)) },
            uGalaxies: { value: galaxies.map((g) => new THREE.Vector4(...g.direction, g.radius)) },
            uShapes: { value: galaxies.map((g) => new THREE.Vector4(g.ratio, g.angle, g.brightness, g.warmth)) },
          },
          side: THREE.BackSide,
          depthTest: false,
          depthWrite: false,
        })
      )
    );

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(UNIVERSE.domeRadius, 64, 32),
      new THREE.ShaderMaterial({
        vertexShader: domeVertex,
        fragmentShader: domeFragment,
        uniforms: { tUniverse: { value: target.texture }, uIntensity: { value: 0 } },
        side: THREE.BackSide,
        depthTest: false,
        depthWrite: false,
      })
    );
    // Drawn first, behind everything, and never culled: the camera is always inside it.
    dome.renderOrder = -1;
    dome.frustumCulled = false;
    dome.visible = false;
    this.scene.add(dome);
    return { target, camera, scene, dome, faces: 0, fade: 0 };
  }

  /** Paints one face of the far universe's cube. Six frames paint the whole sky, so no single frame stalls. */
  private paintUniverseFace(): void {
    const { camera, target, scene } = this.universe;
    if (camera.coordinateSystem !== this.renderer.coordinateSystem) {
      camera.coordinateSystem = this.renderer.coordinateSystem;
      camera.updateCoordinateSystem();
    }
    camera.updateMatrixWorld();
    const face = this.universe.faces;
    // Mipmaps once, after the last face, so the sky stays smooth when it is seen small.
    target.texture.generateMipmaps = face === 5;
    this.renderer.setRenderTarget(target, face);
    this.renderer.clear();
    this.renderer.render(scene, camera.children[face] as THREE.Camera);
    this.renderer.setRenderTarget(null);
    this.universe.faces++;
    if (this.universe.faces === 6) this.universe.dome.visible = true;
  }

  /**
   * Moves the sky with the galaxy: each layer turns with the galaxy and swings with the camera by its share, so
   * the drifting stars move a little, the far stars less, and the far universe hardly at all, as distance would
   * have it. The far universe also turns very slowly on its own and stays centred on the camera.
   */
  private updateSky(dt: number): void {
    const { x: tiltX, y: yaw } = this.group.rotation;
    // The camera's swing round the galaxy, from its home view. Close to the centre its direction means nothing.
    if (this.camera.position.lengthSq() > 1) {
      this.orbit.setFromUnitVectors(this.homeDir, this.cameraDir.copy(this.camera.position).normalize());
    }
    const place = (object: THREE.Object3D, share: number, drift?: THREE.Quaternion) => {
      this.skyTurn.setFromEuler(this.skyEuler.set(tiltX * share, yaw * share, 0));
      // A layer that swung fully with the camera would look painted on the screen; one that stayed put would
      // sweep past as fast as the galaxy. Following the swing by all but its share leaves it moving by its share.
      this.skyFollow.identity().slerp(this.orbit, 1 - share);
      object.quaternion.copy(this.skyFollow).multiply(this.skyTurn);
      if (drift) object.quaternion.multiply(drift);
    };
    for (const layer of this.skyLayers) place(layer.object, layer.share);

    const universe = this.universe;
    this.skyDrift.setFromAxisAngle(SKY_DRIFT_AXIS, this.elapsed * UNIVERSE.driftRate);
    place(universe.dome, PARALLAX.universe, this.skyDrift);
    universe.dome.position.copy(this.camera.position);
    if (universe.faces === 6 && universe.fade < 1) {
      universe.fade = this.motionReduced ? 1 : Math.min(1, universe.fade + dt / UNIVERSE.fadeSeconds);
      universe.dome.material.uniforms.uIntensity.value = universe.fade * universe.fade * (3 - 2 * universe.fade);
    }
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
    if (!this.motionReduced) this.elapsed += dt;

    for (const layer of this.layers) {
      layer.material.uniforms.uTime.value = this.elapsed;
    }
    if (this.haze) this.haze.material.uniforms.uTime.value = this.elapsed;
    // Close to the core, the core dims by up to half, so the dive ends in a glow rather than a white-out.
    const soften = 1 - 0.5 * this.coreTravel;
    // As the camera passes through, the core flares and blooms, and the shockwave leaves it.
    const flare = flareAt(this.reveal);
    if (this.coreMaterial) this.coreMaterial.uniforms.uBrightness.value = CORE_BRIGHTNESS * soften * (1 + 1.4 * flare);
    if (this.coreGlow) {
      this.coreGlow.material.opacity = (0.8 + 0.12 * Math.sin(this.elapsed * 0.7)) * soften;
      this.coreGlow.scale.setScalar(2.8 + 14 * flare);
    }
    if (this.shock) {
      const wave = shockAt(this.reveal);
      this.shock.scale.setScalar(wave.scale);
      this.shock.material.opacity = wave.opacity;
    }
    if (this.flowMaterial) {
      this.flowMaterial.uniforms.uFlow.value = this.flowDistance;
      this.flowMaterial.uniforms.uStrength.value = this.flowStrength;
    }

    this.options.onFrame?.(dt, this.elapsed);
    this.updateSky(dt);
    this.updateHover(dt);
    this.sample(realSeconds);
    this.render();
  };

  private render(): void {
    const renderer = this.renderer;
    if (this.universe.faces < 6) this.paintUniverseFace();
    renderer.clear();
    renderer.render(this.scene, this.camera);
  }
}

