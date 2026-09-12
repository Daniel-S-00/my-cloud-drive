/**
 * Point-cloud generation for the hero's particle scene.
 *
 * The composition is a small system: a dense core, a handful of planetoids
 * on inclined circular orbits around it, and sparse dust for depth. Every
 * buffer is built as flat typed arrays so the GPU can consume it directly,
 * with no per-point object allocation.
 */

export type NovaQualityTier = 'high' | 'medium';

export type NovaTierCounts = {
  coreCount: number;
  planetoidCount: number;
  dustCount: number;
};

export const NOVA_QUALITY_TIERS: Record<NovaQualityTier, NovaTierCounts> = {
  high: { coreCount: 26_000, planetoidCount: 22_000, dustCount: 32_000 },
  medium: { coreCount: 13_000, planetoidCount: 11_000, dustCount: 16_000 },
};

export const NOVA_CORE = { radius: 2.2 } as const;

export const NOVA_PLANETOIDS = {
  /** How many bodies orbit the core. */
  count: 6,
  /** Range of orbital radii. Capped so no body clips the frame edge. */
  orbitInner: 5.5,
  orbitOuter: 11,
  /** Radius of each body. Kept well under the core so the hierarchy reads. */
  bodyMin: 0.34,
  bodyMax: 0.82,
  /** Largest orbital-plane inclination, in radians. */
  maxTilt: 0.34,
  /**
   * Angular speed is this divided by the orbital radius, so inner bodies lap
   * outer ones the way a real system does. Expressed in `time` units, of
   * which roughly 1.57 pass per second.
   */
  speed: 0.9,
} as const;

export const NOVA_DUST = { radius: 22.7, thickness: 1.7 } as const;

/** Power bias keeps most points small with a few larger ones. */
export const NOVA_POINT_SIZE = { min: 0.45, spread: 1.15, bias: 2 } as const;

/** Drives the colour ramp: 0 is the hot core, 1 the dimmest dust. */
export const NOVA_SHADE = { core: 0, planetoid: 0.42, dust: 1 } as const;

export type NovaAttributes = {
  /** Offset from the point's own body centre. */
  positions: Float32Array;
  sizes: Float32Array;
  /** (orbital radius, phase, angular speed, plane tilt), zero when static. */
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
  const orbits = new Float32Array(count * 4);
  const shades = new Float32Array(count);

  let position = 0;
  let point = 0;
  let orbit = 0;

  /**
   * Uniform inside a ball. The cube root is what keeps the density even —
   * without it points crowd the centre instead of filling the volume.
   */
  const writeOffset = (ballRadius: number) => {
    const [x, y, z] = randomDirection(rng);
    const distance = ballRadius * Math.cbrt(rng());
    positions[position++] = x * distance;
    positions[position++] = y * distance;
    positions[position++] = z * distance;
  };

  const writePoint = (
    ballRadius: number,
    shade: number,
    body: { radius: number; phase: number; speed: number; tilt: number },
  ) => {
    writeOffset(ballRadius);
    sizes[point] =
      NOVA_POINT_SIZE.min +
      NOVA_POINT_SIZE.spread * Math.pow(rng(), NOVA_POINT_SIZE.bias);
    orbits[orbit++] = body.radius;
    orbits[orbit++] = body.phase;
    orbits[orbit++] = body.speed;
    orbits[orbit++] = body.tilt;
    shades[point++] = shade;
  };

  const STATIC = { radius: 0, phase: 0, speed: 0, tilt: 0 };

  // The core: a dense ball at the origin, with nothing to orbit.
  for (let i = 0; i < coreCount; i += 1) {
    writePoint(NOVA_CORE.radius, NOVA_SHADE.core, STATIC);
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
    const orbitSpec = {
      radius: orbitRadius,
      phase: rng() * Math.PI * 2,
      speed: NOVA_PLANETOIDS.speed / orbitRadius,
      tilt: (rng() * 2 - 1) * NOVA_PLANETOIDS.maxTilt,
    };
    const bodyRadius = lerp(
      NOVA_PLANETOIDS.bodyMin,
      NOVA_PLANETOIDS.bodyMax,
      rng(),
    );
    const bodyPointCount = perBody + (body < extra ? 1 : 0);

    for (let i = 0; i < bodyPointCount; i += 1) {
      writePoint(bodyRadius, NOVA_SHADE.planetoid, orbitSpec);
    }
  }

  // Dust: a wide, slightly flared disc for depth. Deliberately static, so
  // there is no continuous field left to shear against itself.
  for (let i = 0; i < dustCount; i += 1) {
    const theta = rng() * Math.PI * 2;
    // Square root keeps the density even across the disc rather than
    // crowding everything into the middle.
    const distance = NOVA_DUST.radius * Math.sqrt(rng());
    const flare = 1 - (distance / NOVA_DUST.radius) * 0.5;
    positions[position++] = Math.cos(theta) * distance;
    positions[position++] = (rng() * 2 - 1) * NOVA_DUST.thickness * flare;
    positions[position++] = Math.sin(theta) * distance;
    sizes[point] =
      NOVA_POINT_SIZE.min +
      NOVA_POINT_SIZE.spread * Math.pow(rng(), NOVA_POINT_SIZE.bias);
    orbits[orbit++] = 0;
    orbits[orbit++] = 0;
    orbits[orbit++] = 0;
    orbits[orbit++] = 0;
    shades[point++] = NOVA_SHADE.dust;
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
