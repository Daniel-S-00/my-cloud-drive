/**
 * GLSL patches for three's built-in PointsMaterial shader.
 *
 * The anchor strings are asserted against three's real shader chunks at
 * scene start-up AND in nova-shader.test.ts, so a three.js upgrade that
 * moves them degrades to the static hero instead of silently rendering an
 * empty scene.
 *
 * Every patch below is a self-contained statement inserted at one of those
 * anchors; none of them depend on three's internal chunk ordering.
 */

const ANCHOR_POINT_SIZE = 'gl_PointSize = size;';
const ANCHOR_COLOR = '#include <color_vertex>';
const ANCHOR_BEGIN = '#include <begin_vertex>';
const ANCHOR_DIFFUSE = 'vec4 diffuseColor = vec4( diffuse, opacity );';

export const NOVA_VERTEX_ANCHORS = [
  ANCHOR_POINT_SIZE,
  ANCHOR_COLOR,
  ANCHOR_BEGIN,
] as const;

export const NOVA_FRAGMENT_ANCHORS = [ANCHOR_DIFFUSE] as const;

export const NOVA_VERTEX_DECLS = [
  'uniform float time;',
  'uniform vec3 uColorCore;',
  'uniform vec3 uColorMid;',
  'uniform vec3 uColorDeep;',
  'uniform vec2 uPointer;',
  'uniform float uPointerAspect;',
  'uniform float uPointerStrength;',
  'attribute float sizes;',
  'attribute vec4 orbits;',
  'attribute float shades;',
  'varying vec3 vColor;',
  '',
].join('\n');

/**
 * Colour, driven by the `shades` the generator assigned: 0 is the hot core,
 * ~0.42 the planetoids, 1 the dust. Three stops so the ramp bends through
 * the mid tone instead of running straight from core to rim.
 */
export const NOVA_VERTEX_RAMP = [
  '\tfloat novaShade = clamp(shades, 0.0, 1.0);',
  '\tvColor = novaShade < 0.5',
  '\t\t? mix(uColorCore, uColorMid, novaShade / 0.5)',
  '\t\t: mix(uColorMid, uColorDeep, (novaShade - 0.5) / 0.5);',
].join('\n');

/**
 * Orbital motion. Each point carries its own orbit — radius, phase, angular
 * speed and the inclination of its plane — in the `orbits` attribute, so a
 * body's points travel together and the body stays rigid instead of
 * smearing along its path.
 *
 * Angular speed is stored per point rather than derived here, which is what
 * lets the inner bodies lap the outer ones. Static points carry a zero
 * orbit, so the whole block costs them two multiplies.
 */
export const NOVA_VERTEX_ORBIT = [
  '\tfloat novaAngle = orbits.y + time * orbits.z;',
  '\tvec3 novaCenter = vec3(cos(novaAngle), 0.0, sin(novaAngle)) * orbits.x;',
  '\tfloat novaCosTilt = cos(orbits.w);',
  '\tfloat novaSinTilt = sin(orbits.w);',
  '\tnovaCenter = vec3(',
  '\t\tnovaCenter.x,',
  '\t\tnovaCenter.y * novaCosTilt - novaCenter.z * novaSinTilt,',
  '\t\tnovaCenter.y * novaSinTilt + novaCenter.z * novaCosTilt',
  '\t);',
  '\ttransformed += novaCenter;',
].join('\n');

/**
 * Cursor reaction, tuned in normalised device coordinates. `radius` is in
 * units of half the viewport height (the shader pre-multiplies x by the
 * aspect ratio so the influence stays circular on screen).
 */
export const NOVA_POINTER = {
  /** How far from the cursor a point still reacts. */
  radius: 0.3,
  /** Peak screen-space displacement, i.e. how hard points are pushed away. */
  push: 0.085,
  /** Extra size at the centre of the influence, as a fraction. */
  grow: 1.1,
  /** Extra brightness at the centre, added in linear light. */
  lift: 0.03,
} as const;

/** GLSL needs a decimal point: `1` is an int literal and won't compile. */
function glslFloat(value: number): string {
  return value.toFixed(4);
}

/**
 * Displaces and brightens points around the cursor. Applied after
 * `<project_vertex>`, because that is where `gl_Position` exists, and
 * after the colour ramp, because it lifts `vColor`.
 *
 * Working in NDC rather than world space keeps the influence pinned to the
 * cursor regardless of how the system is oriented or how far away a point
 * is.
 */
export const NOVA_VERTEX_POINTER = [
  'if (uPointerStrength > 0.0 && gl_Position.w > 0.0) {',
  '\tvec2 novaNdc = gl_Position.xy / gl_Position.w;',
  '\tvec2 novaDelta = novaNdc - uPointer;',
  '\tnovaDelta.x *= uPointerAspect;',
  `\tfloat novaInfluence = smoothstep(${glslFloat(NOVA_POINTER.radius)}, 0.0, length(novaDelta)) * uPointerStrength;`,
  '\tif (novaInfluence > 0.0) {',
  '\t\tvec2 novaDirection = normalize(novaDelta + vec2(0.0001));',
  '\t\t// Rotated 90 degrees, so the cursor stirs the system rather than',
  '\t\t// parting it. Rotating a unit vector keeps it a unit vector.',
  '\t\tnovaDirection = vec2(-novaDirection.y, novaDirection.x);',
  `\t\tvec2 novaShift = novaDirection * novaInfluence * ${glslFloat(NOVA_POINTER.push)};`,
  '\t\tnovaShift.x /= uPointerAspect;',
  '\t\tgl_Position.xy = (novaNdc + novaShift) * gl_Position.w;',
  `\t\tgl_PointSize *= 1.0 + novaInfluence * ${glslFloat(NOVA_POINTER.grow)};`,
  `\t\tvColor += novaInfluence * ${glslFloat(NOVA_POINTER.lift)};`,
  '\t}',
  '}',
].join('\n');

/**
 * Depth cue: points further from the camera sink toward the dark end of the
 * ramp. Reads `mvPosition`, so it must run after <project_vertex>.
 */
export const NOVA_DEPTH = { near: 8, far: 50, floor: 0.55 } as const;

export const NOVA_VERTEX_DEPTH_TINT = [
  `float novaDepth = clamp((-mvPosition.z - ${glslFloat(NOVA_DEPTH.near)}) / ${glslFloat(NOVA_DEPTH.far - NOVA_DEPTH.near)}, 0.0, 1.0);`,
  `vColor *= mix(1.0, ${glslFloat(NOVA_DEPTH.floor)}, novaDepth);`,
].join('\n');

/**
 * Twinkle: per-point brightness shimmer.
 *
 * The phase comes from hashing the point's own position rather than from a
 * dedicated attribute, so it stays stable per point, costs no extra buffer,
 * and cannot cluster — points of similar size would otherwise pulse in
 * unison.
 */
export const NOVA_TWINKLE = {
  base: 0.78,
  amplitude: 0.22,
  speed: 2.4,
  phaseScale: 40,
  hash: [12.9898, 78.233, 37.719],
} as const;

export const NOVA_VERTEX_TWINKLE = [
  `float novaPhase = fract(sin(dot(position, vec3(${NOVA_TWINKLE.hash
    .map(glslFloat)
    .join(', ')}))) * 43758.5453);`,
  `float novaFlicker = ${glslFloat(NOVA_TWINKLE.base)} + ${glslFloat(NOVA_TWINKLE.amplitude)} * sin(time * ${glslFloat(NOVA_TWINKLE.speed)} + novaPhase * ${glslFloat(NOVA_TWINKLE.phaseScale)});`,
  'vColor *= novaFlicker;',
].join('\n');

export const NOVA_FRAGMENT_DECLS = ['varying vec3 vColor;', ''].join('\n');

/**
 * Soft round sprite. Replaces the flat `diffuse` colour and opacity with a
 * quadratic falloff, which keeps a bright centre while the edge fades to
 * nothing instead of ending on a visible disc.
 */
export const NOVA_FRAGMENT_SPRITE = [
  'vec2 novaUv = gl_PointCoord.xy - 0.5;',
  '\tfloat novaR2 = clamp(dot(novaUv, novaUv) * 4.0, 0.0, 1.0);',
  '\tvec4 diffuseColor = vec4( vColor, pow(1.0 - novaR2, 2.0) );',
].join('\n');

function assertAnchors(
  stage: string,
  source: string,
  anchors: readonly string[],
): void {
  const missing = anchors.filter((anchor) => !source.includes(anchor));
  if (missing.length === 0) return;
  throw new Error(
    `Nova scene: three.js changed its ${stage} points shader; missing ${missing
      .map((anchor) => JSON.stringify(anchor))
      .join(', ')}. Update src/lib/nova-shader.ts.`,
  );
}

export function assertNovaShaderAnchors(
  vertexShader: string,
  fragmentShader: string,
): void {
  assertAnchors('vertex', vertexShader, NOVA_VERTEX_ANCHORS);
  assertAnchors('fragment', fragmentShader, NOVA_FRAGMENT_ANCHORS);
}

// indexOf/slice rather than String.replace: replacement strings never get
// interpreted for `$&`-style special patterns. Both callers run the
// anchor assertions first, so the anchors are always present here.
function appendAfter(source: string, anchor: string, addition: string): string {
  const end = source.indexOf(anchor) + anchor.length;
  return `${source.slice(0, end)}\n${addition}${source.slice(end)}`;
}

function replaceOnce(
  source: string,
  anchor: string,
  replacement: string,
): string {
  const index = source.indexOf(anchor);
  return `${source.slice(0, index)}${replacement}${source.slice(index + anchor.length)}`;
}

export function patchNovaVertex(source: string): string {
  assertAnchors('vertex', source, NOVA_VERTEX_ANCHORS);
  let patched = `${NOVA_VERTEX_DECLS}${source}`;
  // The post-projection blocks ride along with the point-size line: that line
  // sits immediately after <project_vertex>, so gl_Position and mvPosition both
  // exist and the position is final (three's size attenuation still follows).
  patched = replaceOnce(
    patched,
    ANCHOR_POINT_SIZE,
    [
      'gl_PointSize = size * sizes;',
      NOVA_VERTEX_POINTER,
      NOVA_VERTEX_DEPTH_TINT,
      NOVA_VERTEX_TWINKLE,
    ].join('\n'),
  );
  patched = appendAfter(patched, ANCHOR_COLOR, NOVA_VERTEX_RAMP);
  return appendAfter(patched, ANCHOR_BEGIN, NOVA_VERTEX_ORBIT);
}

export function patchNovaFragment(source: string): string {
  assertAnchors('fragment', source, NOVA_FRAGMENT_ANCHORS);
  return `${NOVA_FRAGMENT_DECLS}${replaceOnce(
    source,
    ANCHOR_DIFFUSE,
    NOVA_FRAGMENT_SPRITE,
  )}`;
}
