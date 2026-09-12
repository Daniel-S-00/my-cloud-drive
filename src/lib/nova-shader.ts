/**
 * GLSL patches for three's built-in PointsMaterial shader.
 *
 * The anchor strings are asserted against three's real shader chunks at
 * scene start-up AND in nova-shader.test.ts, so a three.js upgrade that
 * moves them degrades to the static hero instead of silently rendering
 * an empty scene.
 *
 * Ported from the "Nova" CodePen by prisoner849
 * (https://codepen.io/prisoner849/pen/RwyzrVj).
 *
 * One deliberate deviation: the pen appended `float d = ...` at the
 * `#include <clipping_planes_fragment>` anchor, which only compiles
 * because r136 emitted that include BEFORE `vec4 diffuseColor = ...`.
 * r186 emits them in the opposite order, so declaring `d` there would be
 * a use-before-declaration error. `d` is declared alongside diffuseColor
 * instead. See NOVA_FRAGMENT_SPRITE.
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
  'attribute float sizes;',
  'attribute vec4 shift;',
  'varying vec3 vColor;',
  '',
].join('\n');

/** Per-point colour, ramped by normalised distance from the core. */
export const NOVA_VERTEX_RAMP = [
  '\tfloat d = clamp(length(abs(position) / vec3(40., 10., 40.)), 0., 1.);',
  '\tvColor = d < 0.45',
  '\t\t? mix(uColorCore, uColorMid, d / 0.45)',
  '\t\t: mix(uColorMid, uColorDeep, (d - 0.45) / 0.55);',
].join('\n');

/** Orbital drift; PI2 comes from three's <common> chunk. */
export const NOVA_VERTEX_MOTION = [
  '\tfloat moveT = mod(shift.x + shift.z * time, PI2);',
  '\tfloat moveS = mod(shift.y + shift.z * time, PI2);',
  '\ttransformed += vec3(cos(moveS) * sin(moveT), cos(moveT), sin(moveS) * sin(moveT)) * shift.w;',
].join('\n');

export const NOVA_FRAGMENT_DECLS = ['varying vec3 vColor;', ''].join('\n');

/** Soft round sprite; replaces the flat `diffuse` colour and opacity. */
export const NOVA_FRAGMENT_SPRITE = [
  'float d = length(gl_PointCoord.xy - 0.5);',
  '\tvec4 diffuseColor = vec4( vColor, smoothstep(0.5, 0.1, d) );',
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
  patched = replaceOnce(
    patched,
    ANCHOR_POINT_SIZE,
    'gl_PointSize = size * sizes;',
  );
  patched = appendAfter(patched, ANCHOR_COLOR, NOVA_VERTEX_RAMP);
  return appendAfter(patched, ANCHOR_BEGIN, NOVA_VERTEX_MOTION);
}

export function patchNovaFragment(source: string): string {
  assertAnchors('fragment', source, NOVA_FRAGMENT_ANCHORS);
  return `${NOVA_FRAGMENT_DECLS}${replaceOnce(
    source,
    ANCHOR_DIFFUSE,
    NOVA_FRAGMENT_SPRITE,
  )}`;
}
