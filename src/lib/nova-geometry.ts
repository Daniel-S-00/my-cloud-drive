/**
 * Point-cloud generation for the hero's particle scene.
 *
 * The composition is a small system: a dense core, a handful of planetoids
 * on circular orbits around it, and a dust disc for depth. Every buffer is
 * built as flat typed arrays so the GPU can consume it directly, with no
 * per-point object allocation.
 *
 * The orbital plane is deliberately shared rather than per-body: random
 * inclinations made some bodies climb where others descended, which reads as
 * bodies orbiting in opposite directions. One plane gives the whole system a
 * single, legible direction of travel. See the shader for the plane's tilt.
 */

export type NovaQualityTier = 'high' | 'medium';

export type NovaTierCounts = {
  coreCount: number;
  planetoidCount: number;
  dustCount: number;
};

export const NOVA_QUALITY_TIERS: Record<NovaQualityTier, NovaTierCounts> = {
  high: { coreCount: 26_000, planetoidCount: 22_000, dustCount: 96_000 },
  medium: { coreCount: 13_000, planetoidCount: 11_000, dustCount: 48_000 },
};

export const NOVA_CORE = { radius: 2.2 } as const;

/**
 * Angular speed is this divided by the orbital radius, so inner bodies lap
 * outer ones the way a real system does. Shared by the dust, which is what
 * keeps the disc co-rotating with the bodies instead of sliding against
 * them. Expressed in `time` units, of which roughly 1.57 pass per second.
 */
export const NOVA_ORBIT_SPEED = 0.9;

/**
 * Lean of the whole system, in radians, about Z. Applied as the points
 * object's own rotation rather than in the shader, since that is the same
 * transform for free. 45° runs the disc's long axis diagonally across the
 * frame instead of leaving it flat and nearly edge-on.
 */
export const NOVA_PLANE_TILT = Math.PI / 4;

export const NOVA_PLANETOIDS = {
  /** How many bodies orbit the core. */
  count: 6,
  /** Range of orbital radii. Capped so no body clips the frame edge. */
  orbitInner: 5.5,
  orbitOuter: 11,
  /** Radius of each body. Kept well under the core so the hierarchy reads. */
  bodyMin: 0.34,
  bodyMax: 0.82,
} as const;

export const NOVA_DUST = {
  radius: 22.7,
  thickness: 1.7,
  /**
   * Floor on the orbital radius. Without it the innermost dust would sit
   * almost on the axis, where the 1/radius speed law tends to infinity.
   */
  minOrbit: 4,
} as const;

/** Power bias keeps most points small with a few larger ones. */
export const NOVA_POINT_SIZE = { min: 0.45, spread: 1.15, bias: 2 } as const;

/**
 * Drives the colour ramp: 0 is the hot core, 1 the dimmest dust. The dust
 * sits well above the planetoids so it cannot outshine them — with additive
 * blending it accumulates over far more points, so its per-point brightness
 * has to stay low for the hierarchy to survive.
 */
export const NOVA_SHADE = { core: 0, planetoid: 0.42, dust: 0.9 } as const;

export type NovaAttributes = {
  /** Offset from the point's own place in the composition. */
  positions: Float32Array;
  sizes: Float32Array;
  /** (orbital radius, phase, angular speed). All zero when the point is still. */
  orbits: Float32Array;
  shades: Float32Array;
  count: number;
};

export function pickQualityTier(hints: {
  deviceMemory?: number;
  hardwareConcurrency?: number;
}): NovaQualityTier {
  const { deviceMemory, hardwareConcurrency } = hints;

  if (typeof deviceMemory === 'number' && deviceMemory > 0) {
    return deviceMemory >= 8 ? 'high' : 'medium';
  }
  if (typeof hardwareConcurrency === 'number' && hardwareConcurrency > 0) {
    return hardwareConcurrency >= 8 ? 'high' : 'medium';
  }
  return 'medium';
}

export function buildNovaAttributes({
  coreCount,
  planetoidCount,
  dustCount,
  rng = Math.random,
}: {
  coreCount: number;
  planetoidCount: number;
  dustCount: number;
  rng?: () => number;
}): NovaAttributes {
  const count = coreCount + planetoidCount + dustCount;
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const orbits = new Float32Array(count * 3);
  const shades = new Float32Array(count);

  let cursor = 0;

  const push = (
    offset: readonly [number, number, number],
    orbit: readonly [number, number, number],
    shade: number,
  ) => {
    const base = cursor * 3;
    positions[base] = offset[0];
    positions[base + 1] = offset[1];
    positions[base + 2] = offset[2];
    orbits[base] = orbit[0];
    orbits[base + 1] = orbit[1];
    orbits[base + 2] = orbit[2];
    sizes[cursor] =
      NOVA_POINT_SIZE.min +
      NOVA_POINT_SIZE.spread * Math.pow(rng(), NOVA_POINT_SIZE.bias);
    shades[cursor] = shade;
    cursor += 1;
  };

  const STATIC = [0, 0, 0] as const;

  /**
   * Uniform inside a ball. The cube root is what keeps the density even —
   * without it points crowd the centre instead of filling the volume.
   */
  const ballOffset = (ballRadius: number): [number, number, number] => {
    const [x, y, z] = randomDirection(rng);
    const distance = ballRadius * Math.cbrt(rng());
    return [x * distance, y * distance, z * distance];
  };

  // The core: a dense ball at the origin, with nothing to orbit.
  for (let i = 0; i < coreCount; i += 1) {
    push(ballOffset(NOVA_CORE.radius), STATIC, NOVA_SHADE.core);
  }

  // Planetoids: each body is a ball of points that shares one orbit, so the
  // body stays rigid as it travels instead of smearing along the path.
  const perBody = Math.floor(planetoidCount / NOVA_PLANETOIDS.count);
  const extra = planetoidCount % NOVA_PLANETOIDS.count;

  for (let body = 0; body < NOVA_PLANETOIDS.count; body += 1) {
    const orbitRadius = lerp(
      NOVA_PLANETOIDS.orbitInner,
      NOVA_PLANETOIDS.orbitOuter,
      rng(),
    );
    const bodyRadius = lerp(
      NOVA_PLANETOIDS.bodyMin,
      NOVA_PLANETOIDS.bodyMax,
      rng(),
    );
    const orbit = [
      orbitRadius,
      rng() * Math.PI * 2,
      NOVA_ORBIT_SPEED / orbitRadius,
    ] as const;
    const bodyPointCount = perBody + (body < extra ? 1 : 0);

    for (let i = 0; i < bodyPointCount; i += 1) {
      push(ballOffset(bodyRadius), orbit, NOVA_SHADE.planetoid);
    }
  }

  // Dust: a wide, slightly flared disc that orbits with the same speed law as
  // the bodies. Differential rotation is only visible as wind-up when there is
  // a pattern to wind, and a uniform field has none, so the disc keeps turning
  // without ever gathering into a spiral.
  for (let i = 0; i < dustCount; i += 1) {
    const theta = rng() * Math.PI * 2;
    // Square root keeps the density even across the disc rather than
    // crowding everything into the middle.
    const discRadius = NOVA_DUST.radius * Math.sqrt(rng());
    const flare = 1 - (discRadius / NOVA_DUST.radius) * 0.5;
    const thickness = (rng() * 2 - 1) * NOVA_DUST.thickness * flare;
    const orbitRadius = Math.max(discRadius, NOVA_DUST.minOrbit);

    push(
      // The disc's thickness is the point's only offset: where it sits in the
      // ring comes from its orbit.
      [0, thickness, 0],
      [orbitRadius, theta, NOVA_ORBIT_SPEED / orbitRadius],
      NOVA_SHADE.dust,
    );
  }

  return { positions, sizes, orbits, shades, count };
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/**
 * Evenly distributed point on the unit sphere, via the standard
 * equal-area construction: pick the height uniformly, then the azimuth.
 */
function randomDirection(rng: () => number): [number, number, number] {
  const height = rng() * 2 - 1;
  const azimuth = rng() * Math.PI * 2;
  const ring = Math.sqrt(1 - height * height);
  return [ring * Math.cos(azimuth), ring * Math.sin(azimuth), height];
}
