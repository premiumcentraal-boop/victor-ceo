// GLSL for the galaxy. Written for three.js ShaderMaterial, which compiles them as GLSL ES 3.00.

/**
 * How far a star has swung round the galaxy's turn, in radians. The arms sway on a slow beat, and a ripple
 * travels outward through them, so the spiral is always moving. Both terms are bounded, so the swing never
 * accumulates: a swing that kept growing would wind the arms up into rings.
 */
const swingGlsl = /* glsl */ `
  float swing(float radius, float time, float amount) {
    float sway = sin(time * 0.25);
    float ripple = sin(time * 0.7 - radius * 1.5);
    return amount * (0.6 * sway + 0.4 * ripple) / (0.7 + radius);
  }
`;

export const pointVertex = /* glsl */ `
  attribute float aSize;
  attribute float aSeed;
  attribute vec3 aColor;
  uniform float uPixelRatio;
  uniform float uScale;
  uniform float uTime;
  uniform float uBrightness;
  uniform float uSwirl;
  varying vec3 vColor;

  ${swingGlsl}

  void main() {
    // The core sways a little more than the rim, as a real galaxy's arms do.
    float turn = swing(length(position.xz), uTime, uSwirl);
    vec3 p = position;
    p.xz = mat2(cos(turn), -sin(turn), sin(turn), cos(turn)) * position.xz;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    // Stars breathe at their own rate, so the disc never looks like a still image.
    float twinkle = 0.78 + 0.22 * sin(uTime * (0.5 + aSeed * 1.3) + aSeed * 40.0);
    gl_PointSize = clamp(aSize * uScale * uPixelRatio * (9.0 / -mvPosition.z), 1.0, 48.0);
    vColor = aColor * uBrightness * twinkle;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const pointFragment = /* glsl */ `
  varying vec3 vColor;

  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p);
    float core = smoothstep(0.5, 0.0, d);
    float glow = exp(-d * d * 16.0);
    float alpha = clamp(core * 0.55 + glow * 0.55, 0.0, 1.0);
    // Additive blending: the colour is already scaled by its alpha.
    gl_FragColor = vec4(vColor * alpha, 1.0);
  }
`;

export const fullscreenVertex = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/** Value noise and its fractal sum, shared by the nebula and the galaxy's haze. */
const noiseGlsl = /* glsl */ `
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = p * 2.02 + vec2(7.1, 3.7);
      a *= 0.5;
    }
    return v;
  }
`;

/** Slow, deep nebula: domain-warped noise in the site's cyan and violet, fading to black at the edges. */
export const nebulaFragment = /* glsl */ `
  uniform float uTime;
  uniform vec2 uResolution;
  uniform float uIntensity;
  varying vec2 vUv;

  ${noiseGlsl}

  void main() {
    vec2 uv = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
    float t = uTime * 0.025;
    vec2 q = vec2(fbm(uv * 1.4 + t), fbm(uv * 1.4 + vec2(5.2, 1.3) - t));
    float n = fbm(uv * 2.0 + 1.6 * q + vec2(t * 0.6, -t * 0.4));

    vec3 deep = vec3(0.004, 0.005, 0.012);
    vec3 violet = vec3(0.13, 0.06, 0.22);
    vec3 teal = vec3(0.02, 0.15, 0.19);
    vec3 cloud = mix(violet, teal, clamp(q.x * 1.3, 0.0, 1.0)) * smoothstep(0.25, 0.8, n);

    float edge = smoothstep(1.15, 0.25, length(uv));
    vec3 col = deep + cloud * edge * uIntensity;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** A flat plane in the galaxy's own plane, carrying the spiral arms as a glow the stars sit in. */
export const hazeVertex = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Stars that rush past the visitor as the page scrolls. Each star keeps its lane and travels along the view
 * from far to near, wrapping round, so the field never runs out. The stars fade at both ends of their run.
 */
export const flowVertex = /* glsl */ `
  attribute float aSize;
  attribute float aSeed;
  attribute vec3 aColor;
  uniform float uPixelRatio;
  uniform float uScale;
  uniform float uBrightness;
  uniform float uFlow;
  uniform float uNear;
  uniform float uDepth;
  uniform float uStrength;
  varying vec3 vColor;

  void main() {
    // Along the view, a star's distance from the visitor wraps from far to near as the flow advances.
    float along = mod(aSeed * uDepth - uFlow, uDepth);
    float depth = uNear + along;
    // Stars fade in at the far end, and fade out as they pass the visitor's face, so none pops in or out.
    float far = 1.0 - smoothstep(0.85, 1.0, along / uDepth);
    float near = smoothstep(uNear, uNear + 1.5, depth);
    gl_PointSize = clamp(aSize * uScale * uPixelRatio * (9.0 / depth), 1.0, 18.0);
    vColor = aColor * uBrightness * uStrength * far * near;
    // The lane is fixed in the view, so the stars move outwards from the centre as they come.
    gl_Position = projectionMatrix * vec4(position.xy, -depth, 1.0);
  }
`;

/**
 * Stars that float in the space round the galaxy. Each one bobs slowly on its own rhythm, and fades as it
 * comes close to the visitor, so none of them flares across the view.
 */
export const driftVertex = /* glsl */ `
  attribute float aSize;
  attribute float aSeed;
  attribute vec3 aColor;
  uniform float uPixelRatio;
  uniform float uScale;
  uniform float uTime;
  uniform float uBrightness;
  varying vec3 vColor;

  void main() {
    float phase = aSeed * 6.2832;
    vec3 p = position + vec3(
      sin(uTime * (0.05 + aSeed * 0.04) + phase) * 0.35,
      sin(uTime * (0.03 + aSeed * 0.05) + phase * 1.7) * 0.25,
      cos(uTime * (0.04 + aSeed * 0.03) + phase * 0.6) * 0.35
    );
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    float depth = -mvPosition.z;
    float twinkle = 0.75 + 0.25 * sin(uTime * (0.6 + aSeed) + phase * 3.0);
    float near = smoothstep(1.5, 4.0, depth);
    gl_PointSize = clamp(aSize * uScale * uPixelRatio * (9.0 / depth), 1.0, 18.0);
    vColor = aColor * uBrightness * twinkle * near;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const hazeFragment = /* glsl */ `
  uniform float uTime;
  uniform float uSwirl;
  uniform float uOuter;
  uniform float uInner;
  uniform float uArms;
  uniform float uWinding;
  uniform float uIntensity;
  varying vec2 vUv;

  ${noiseGlsl}

  ${swingGlsl}

  void main() {
    // The plane lies flat in the galaxy: its x is the world x, and its y runs to minus the world z.
    vec2 w = vec2((vUv.x - 0.5) * 2.0 * uOuter, -(vUv.y - 0.5) * 2.0 * uOuter);
    float r = length(w);
    float theta = atan(w.y, w.x);
    // The same sway as the stars, so the glow and the stars move as one galaxy.
    float turn = swing(r, uTime, uSwirl);
    float phase = uArms * (theta + turn - uWinding * log(max(r, uInner) / uInner));
    // Sharp arms over a faint disc, so the spiral reads as arms, not as a ring.
    float arms = pow(0.5 + 0.5 * cos(phase), 6.0);
    float dust = 0.55 + 0.9 * fbm(w * 0.9);
    float bulge = exp(-r * r / 0.9);
    float edge = 1.0 - smoothstep(uOuter * 0.45, uOuter, r);
    vec3 armColor = mix(vec3(0.12, 0.42, 1.0), vec3(0.6, 0.25, 1.0), smoothstep(0.9, 3.2, r));
    vec3 coreColor = vec3(1.0, 0.8, 0.55);
    vec3 col = mix(armColor, coreColor, bulge) * (arms * dust * 1.3 + 0.12 * dust + bulge * 0.6) * edge * uIntensity;
    gl_FragColor = vec4(col, 1.0);
  }
`;
