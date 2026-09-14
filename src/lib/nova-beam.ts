/**
 * The quasar's beams: the light that leaves the hero's core, drawn as
 * geometry rather than as particles.
 *
 * A cloud of points reads as a swarm of dots however dense it is — each
 * sprite keeps its own edge — and light has no edges: it is a continuous
 * volume whose brightness depends on how much of it you are looking through.
 * So the beams are two tapered tubes with a shader of their own that cooks a
 * fake version of that: brightest down the middle of the tube, gone at the
 * silhouette, hot where it leaves the core, gone by the tip, with a wave of
 * brightness travelling outward. They reach past the frame on purpose, and
 * they ignore the cursor, which the points do not. Additive, like everything
 * else in the scene.
 *
 * These functions return flat typed arrays, so the geometry can be built and
 * checked without a renderer.
 */

export type NovaBeamAttributes = {
  positions: Float32Array;
  normals: Float32Array;
  /** 0 where the beam leaves the core, 1 at its tip. */
  alongs: Float32Array;
  indices: Uint16Array;
  /** Vertices, both beams together. */
  count: number;
};

/**
 * Both beams share every number here except their direction: the pair is
 * mirrored about the disc, so the only per-beam value is `twist`'s sign.
 */
export const NOVA_BEAM = {
  /**
   * Where a beam starts. Inside the core's own ball — its radius is 2.2 — so
   * the light reads as coming out of the core rather than being stuck onto
   * it, and the base ring is hidden by the core's own glow.
   */
  base: 2,
  /**
   * How far a beam reaches past the base, along the disc's axis. Long enough
   * that the tips land off screen: what covers the frame is the lit part of
   * the beam, not its end, so there is no edge to see.
   */
  reach: 13,
  /**
   * Radius where it leaves the core, and the width it gains along the way. A
   * beam of light needs width to be seen: a thin line disappears between the
   * dust points.
   */
  baseRadius: 0.5,
  flare: 0.9,
  /** Rings along the length, and segments around it. Small on purpose. */
  rings: 28,
  segments: 28,
  /**
   * Radians of twist over the whole beam, mirrored between the two. The
   * twist is what makes the pair chiral: a symmetric tube looks identical at
   * every angle, so its turn would be invisible.
   */
  twist: 2.2,
  /** How fast the beam turns about its own axis, in `time` units. */
  spin: 0.4,
  /**
   * Silhouette falloff. The shader measures how square-on the tube's surface
   * is to the camera and raises it to this: higher is a tighter, hotter core
   * of light with softer shoulders.
   */
  falloff: 2.4,
  /**
   * The light is brightest where it leaves the core and gone by the tip.
   * `decay` is the hot root — an exponential, so the drop away from the core
   * is steep — and `fade` lands it exactly on zero at the tip, which an
   * exponential alone never does.
   */
  decay: 1.8,
  fade: 1.1,
  /** Brightness waves running along the beam, and how fast they travel. */
  waves: 4,
  flowRate: 1.6,
  /** How deep those waves are, as a fraction of the light. */
  flow: 0.25,
  /**
   * Overall opacity. Kept lowish because the tube is drawn double-sided:
   * what you see through the middle is the near wall and the far wall adding
   * up, which is the effect — and the reason it does not need more.
   */
  strength: 1.15,
} as const;

/**
 * Two tapered, twisted tubes: one out of each pole. The lower beam is the
 * upper one mirrored through the disc, twist included, so the pair stays
 * symmetric.
 */
export function buildNovaBeamAttributes(): NovaBeamAttributes {
  const { base, reach, baseRadius, flare, rings, segments, twist } = NOVA_BEAM;
  const perBeam = (rings + 1) * segments;
  const count = perBeam * 2;

  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const alongs = new Float32Array(count);
  const indices = new Uint16Array(rings * segments * 6 * 2);

  let vertex = 0;
  let index = 0;

  for (const side of [1, -1]) {
    const start = vertex;

    for (let ring = 0; ring <= rings; ring += 1) {
      const along = ring / rings;
      const height = base + reach * along;
      const radius = baseRadius + flare * along;
      const turn = side * twist * along;

      for (let segment = 0; segment < segments; segment += 1) {
        const azimuth = (segment / segments) * Math.PI * 2 + turn;
        const x = Math.cos(azimuth);
        const z = Math.sin(azimuth);
        const at = vertex * 3;

        positions[at] = x * radius;
        positions[at + 1] = side * height;
        positions[at + 2] = z * radius;
        // The wall of a slightly tapered tube is close enough to radial for a
        // falloff that only ever asks how square-on the surface is.
        normals[at] = x;
        normals[at + 1] = 0;
        normals[at + 2] = z;
        alongs[vertex] = along;
        vertex += 1;
      }
    }

    // Both walls are drawn (the material is double-sided), so the winding
    // only has to be consistent, not to face outward.
    for (let ring = 0; ring < rings; ring += 1) {
      for (let segment = 0; segment < segments; segment += 1) {
        const next = (segment + 1) % segments;
        const lower = start + ring * segments;
        const upper = start + (ring + 1) * segments;

        indices[index] = lower + segment;
        indices[index + 1] = upper + segment;
        indices[index + 2] = lower + next;
        indices[index + 3] = lower + next;
        indices[index + 4] = upper + segment;
        indices[index + 5] = upper + next;
        index += 6;
      }
    }
  }

  return { positions, normals, alongs, indices, count };
}

/**
 * A plain shader rather than a patch of three's, unlike the points: there is
 * no built-in "light shaft" to hook into, and a tube this simple is cheaper
 * to write outright than to graft onto something else.
 *
 * The vertex turns the tube about its own axis and hands the fragment two
 * things: how far along the beam the vertex sits, and where it is in the
 * view, which is what the silhouette falloff is measured from.
 *
 * It deliberately ignores the cursor. The beams span the frame, so the same
 * displacement the points get reads as the whole screen flexing rather than
 * as a hand passing through dust — the light stays where the core aims it.
 */
export const NOVA_BEAM_VERTEX = [
  'uniform float time;',
  'attribute float along;',
  'varying float vAlong;',
  'varying vec3 vNormalView;',
  'varying vec3 vPositionView;',
  'void main() {',
  '\tvAlong = along;',
  `\tfloat novaAngle = ${NOVA_BEAM.spin.toFixed(4)} * time + ${NOVA_BEAM.twist.toFixed(4)} * along;`,
  '\tfloat novaCos = cos(novaAngle);',
  '\tfloat novaSin = sin(novaAngle);',
  '\tvec3 novaLocal = vec3(',
  '\t\tposition.x * novaCos - position.z * novaSin,',
  '\t\tposition.y,',
  '\t\tposition.x * novaSin + position.z * novaCos',
  '\t);',
  '\tmat3 novaTurn = mat3(',
  '\t\tnovaCos, 0.0, -novaSin,',
  '\t\t0.0, 1.0, 0.0,',
  '\t\tnovaSin, 0.0, novaCos',
  '\t);',
  '\tvNormalView = normalize(normalMatrix * (novaTurn * normal));',
  '\tvec4 novaView = modelViewMatrix * vec4(novaLocal, 1.0);',
  '\tvPositionView = novaView.xyz;',
  '\tgl_Position = projectionMatrix * novaView;',
  '}',
].join('\n');

/**
 * The fragment is where the light comes from. A tube with a flat colour looks
 * like a tube; what sells "light" is that the eye is looking through more of
 * it down the middle than at the edges, so the brightness follows how
 * square-on the surface is to the camera.
 *
 * The colour walks the same ramp as the points — hot core, mid, deep — with
 * the distance along the beam standing in for the shade, so a beam and a
 * particle agree about what "further out" looks like.
 */
export const NOVA_BEAM_FRAGMENT = [
  'uniform vec3 uColorCore;',
  'uniform vec3 uColorMid;',
  'uniform vec3 uColorDeep;',
  'uniform float time;',
  'varying float vAlong;',
  'varying vec3 vNormalView;',
  'varying vec3 vPositionView;',
  'void main() {',
  '\tfloat novaFacing = abs(dot(normalize(vNormalView), normalize(-vPositionView)));',
  `\tfloat novaShaft = pow(novaFacing, ${NOVA_BEAM.falloff.toFixed(4)});`,
  `\tfloat novaFade = pow(1.0 - vAlong, ${NOVA_BEAM.fade.toFixed(4)}) * exp(-vAlong * ${NOVA_BEAM.decay.toFixed(4)});`,
  `\tfloat novaFlow = mix(1.0 - ${NOVA_BEAM.flow.toFixed(4)}, 1.0, 0.5 + 0.5 * sin(vAlong * ${NOVA_BEAM.waves.toFixed(4)} * 6.2831853 - time * ${NOVA_BEAM.flowRate.toFixed(4)}));`,
  '\tvec3 novaColor = vAlong < 0.5',
  '\t\t? mix(uColorCore, uColorMid, vAlong / 0.5)',
  '\t\t: mix(uColorMid, uColorDeep, (vAlong - 0.5) / 0.5);',
  `\tfloat novaIntensity = novaShaft * novaFade * novaFlow * ${NOVA_BEAM.strength.toFixed(4)};`,
  '\tgl_FragColor = vec4(novaColor, novaIntensity);',
  '}',
].join('\n');
