// GLSL for the galaxy. Written for three.js ShaderMaterial, which compiles them as GLSL ES 3.00.

export const pointVertex = /* glsl */ `
  attribute float aSize;
  attribute float aSeed;
  attribute vec3 aColor;
  uniform float uPixelRatio;
  uniform float uScale;
  uniform float uTime;
  uniform float uBrightness;
  varying vec3 vColor;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
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

/** Slow, deep nebula: domain-warped noise in the site's cyan and violet, fading to black at the edges. */
export const nebulaFragment = /* glsl */ `
  uniform float uTime;
  uniform vec2 uResolution;
  uniform float uIntensity;
  varying vec2 vUv;

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
