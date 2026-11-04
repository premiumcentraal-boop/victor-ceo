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

/** Value noise and its fractal sum, for the galaxy's haze. */
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
    // Soft arms over a faint disc: the spiral reads as a turning galaxy, not as three ribbons, and not as a ring.
    float arms = pow(0.5 + 0.5 * cos(phase), 3.0);
    float dust = 0.55 + 0.9 * fbm(w * 0.9);
    float bulge = exp(-r * r / 0.9);
    float edge = 1.0 - smoothstep(uOuter * 0.3, uOuter, r);
    vec3 armColor = mix(vec3(0.12, 0.42, 1.0), vec3(0.6, 0.25, 1.0), smoothstep(0.9, 3.2, r));
    vec3 coreColor = vec3(1.0, 0.8, 0.55);
    vec3 col = mix(armColor, coreColor, bulge) * (arms * dust * 0.9 + 0.08 * dust + bulge * 0.6) * edge * uIntensity;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** How many distant galaxies the far universe draws. Kept in step with UNIVERSE.galaxies. */
export const FAR_GALAXIES = 28;
/** How many nebula clouds the far universe draws. Kept in step with UNIVERSE.nebulae. */
export const FAR_NEBULAE = 6;

/** A unit sphere round the cube camera: each fragment's direction is the direction it paints in the sky. */
export const universeVertex = /* glsl */ `
  varying vec3 vDir;

  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * The far universe, painted once into a cube texture: a soft glow of gas and dust over the whole sky, a band like
 * the Milky Way with dark dust lanes through it, six brighter nebula clouds, stars too far to resolve (thickest in
 * the band) and small distant galaxies. Everything is a function of direction alone, so the sky is seamless all
 * the way round, with no bare patch and no seam.
 */
export const universeFragment = /* glsl */ `
  uniform vec3 uBandNormal;
  uniform vec3 uNebula[${FAR_NEBULAE}];
  uniform vec4 uGalaxies[${FAR_GALAXIES}];
  uniform vec4 uShapes[${FAR_GALAXIES}];
  varying vec3 vDir;

  float hash31(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  vec3 hash33(vec3 p) {
    p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
    return fract(sin(p) * 43758.5453123);
  }

  float noise3(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash31(i), hash31(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash31(i + vec3(0.0, 1.0, 0.0)), hash31(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
      mix(mix(hash31(i + vec3(0.0, 0.0, 1.0)), hash31(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash31(i + vec3(0.0, 1.0, 1.0)), hash31(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
      f.z
    );
  }

  float fbm3(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise3(p);
      p = p * 2.03 + vec3(1.7, 9.2, 3.1);
      a *= 0.5;
    }
    return v;
  }

  // One star at most in each cell of a grid laid through the sky. Its centre keeps away from the cell's walls,
  // so a star is never cut in half where two cells meet.
  vec3 stars(vec3 d, float scale, float chance, float sharpness, float gain) {
    vec3 p = d * scale;
    vec3 cell = floor(p);
    vec3 h = hash33(cell);
    if (h.x > chance) return vec3(0.0);
    vec3 centre = cell + 0.3 + 0.4 * hash33(cell + 19.19);
    // Distance from the star to the line of sight, in cells: the star is a round point however the grid is cut.
    float off = length(centre - d * dot(centre, d));
    float glow = exp(-off * off * sharpness);
    // Most stars are faint; a few are bright.
    float brightness = 0.25 + 2.6 * pow(h.y, 14.0) + 0.5 * h.y;
    vec3 tint = mix(vec3(0.72, 0.84, 1.0), vec3(1.0, 0.86, 0.7), smoothstep(0.55, 1.0, h.z));
    return tint * brightness * glow * gain;
  }

  void main() {
    vec3 d = normalize(vDir);

    // The glow over the whole sky: warped clouds of gas and dust in every direction, deep blue and teal, violet in
    // places and a warm, dusty brown in others, so the dark between the stars is never bare. Its lowest point is a
    // faint blue, its highest a soft glow; the real dark is left to the dust lanes.
    vec3 warp = vec3(fbm3(d * 1.5 + 3.0), fbm3(d * 1.5 + 7.3), fbm3(d * 1.5 + 13.1));
    float gas = fbm3(d * 2.1 + 1.9 * warp);
    float wisps = fbm3(d * 5.3 + 3.2 * warp);
    vec3 tint = mix(vec3(0.05, 0.08, 0.19), vec3(0.17, 0.07, 0.24), smoothstep(0.38, 0.66, warp.x));
    tint = mix(tint, vec3(0.03, 0.17, 0.21), smoothstep(0.42, 0.7, warp.y));
    tint = mix(tint, vec3(0.22, 0.12, 0.08), 0.6 * smoothstep(0.55, 0.8, warp.z));
    // A fifth of the colour gives way to a cool grey, so the glow reads as distant light, not as paint.
    tint = mix(tint, vec3(dot(tint, vec3(0.33))) * vec3(0.9, 0.95, 1.15), 0.2);
    vec3 col = tint * (0.16 + 0.7 * pow(gas, 1.7)) * (0.75 + 0.5 * wisps);

    // The band: a soft lane of light across the sky, brighter and warmer at its heart, broken by dust.
    float lat = dot(d, uBandNormal);
    float band = exp(-lat * lat / 0.026);
    float wide = exp(-lat * lat / 0.16);
    float cloud = fbm3(d * 3.2);
    float lanes = smoothstep(0.42, 0.7, fbm3(d * 7.0 + 11.0));
    vec3 bandColour = mix(vec3(0.16, 0.2, 0.34), vec3(0.5, 0.42, 0.36), band);
    col += bandColour * (0.07 * wide + 0.55 * band * cloud);
    // Dust lanes darken the band and the glow behind it, as dust does in front of a real one.
    col *= 1.0 - 0.75 * lanes * band;

    // Six brighter nebula clouds round the sky, in the site's teal, violet and rose and the deep blue and soft red
    // of real ones, their shapes warped so they read as gas.
    vec3 hues[${FAR_NEBULAE}];
    hues[0] = vec3(0.05, 0.32, 0.4);
    hues[1] = vec3(0.32, 0.1, 0.5);
    hues[2] = vec3(0.45, 0.12, 0.26);
    hues[3] = vec3(0.08, 0.16, 0.42);
    hues[4] = vec3(0.42, 0.14, 0.16);
    hues[5] = vec3(0.1, 0.3, 0.32);
    for (int i = 0; i < ${FAR_NEBULAE}; i++) {
      float near = dot(d, uNebula[i]);
      if (near < 0.3) continue;
      float reach = smoothstep(0.3, 1.0, near);
      vec3 q = vec3(fbm3(d * 2.4 + float(i) * 3.1), fbm3(d * 2.4 + 5.2 + float(i)), fbm3(d * 2.4 + 9.7 - float(i)));
      float gas = fbm3(d * 4.2 + 2.4 * q);
      col += hues[i] * pow(gas, 2.4) * reach * reach * 1.35;
    }

    // Stars too far to resolve: a faint dust of tiny ones, thickest in the band, and a few brighter. The crisp
    // stars are drawn as points in front of the sky; these only give it depth.
    float crowd = 0.5 + 0.5 * wide;
    col += stars(d, 560.0, 0.16 * crowd, 26.0, 0.22);
    col += stars(d * 1.0007 + 0.31, 230.0, 0.05 * crowd, 30.0, 0.5);
    col += stars(d * 0.9993 - 0.17, 85.0, 0.02, 34.0, 0.9);

    // The distant galaxies: a bright core, a faint disc, and a hint of arms in the larger ones.
    for (int i = 0; i < ${FAR_GALAXIES}; i++) {
      vec3 g = uGalaxies[i].xyz;
      float radius = uGalaxies[i].w;
      if (dot(d, g) < cos(radius * 5.0)) continue;
      vec3 t = normalize(cross(g, abs(g.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
      vec3 b = cross(g, t);
      vec2 uv = vec2(dot(d, t), dot(d, b)) / radius;
      float c = cos(uShapes[i].y);
      float s = sin(uShapes[i].y);
      uv = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y);
      uv.y /= uShapes[i].x;
      float r = length(uv);
      float arms = 0.65 + 0.35 * cos(2.0 * atan(uv.y, uv.x) - 4.0 * log(r + 0.08));
      vec3 tone = mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.82, 0.62), uShapes[i].w);
      col += tone * (exp(-r * r * 14.0) * 1.1 + exp(-r * 2.6) * 0.32 * arms) * uShapes[i].z;
    }

    // A whisper of noise, so the faint gradients never band in an 8-bit texture.
    col += (hash31(d * 1731.3) - 0.5) / 255.0;
    gl_FragColor = vec4(max(col, 0.0), 1.0);
  }
`;

/** The dome the far universe is shown on. It sits on the far side of everything, centred on the camera. */
export const domeVertex = /* glsl */ `
  varying vec3 vDir;

  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const domeFragment = /* glsl */ `
  uniform samplerCube tUniverse;
  uniform float uIntensity;
  varying vec3 vDir;

  void main() {
    gl_FragColor = vec4(textureCube(tUniverse, normalize(vDir)).rgb * uIntensity, 1.0);
  }
`;
