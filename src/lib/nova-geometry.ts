/**
 * Point-cloud generation for the hero's particle scene.
 *
 * Ported from the "Nova" CodePen by prisoner849
 * (https://codepen.io/prisoner849/pen/RwyzrVj), adapted to build typed
 * arrays directly instead of ~150k Vector3 allocations.
 */

export type NovaQualityTier = 'high' | 'medium';

export type NovaTierCounts = { shellCount: number; columnCount: number };

export const NOVA_QUALITY_TIERS: Record<NovaQualityTier, NovaTierCounts> = {
  high: { shellCount: 24_000, columnCount: 56_000 },
  medium: { shellCount: 12_000, columnCount: 28_000 },
};

/** Sparse ball of points hugging the camera. */
export const SHELL_RADIUS = { base: 9.5, spread: 0.5 } as const;
/** Hollow disc that gives the nebula its breadth. */
export const COLUMN_RADIUS = { inner: 10, outer: 40 } as const;
export const POINT_SIZE = { base: 0.5, spread: 1.5 } as const;

export type NovaAttributes = {
  positions: Float32Array;
  sizes: Float32Array;
  shifts: Float32Array;
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
  shellCount,
  columnCount,
  rng = Math.random,
}: {
  shellCount: number;
  columnCount: number;
  rng?: () => number;
}): NovaAttributes {
  const count = shellCount + columnCount;
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const shifts = new Float32Array(count * 4);

  let position = 0;
  let size = 0;
  let shift = 0;

  const writeShift = () => {
    shifts[shift++] = rng() * Math.PI;
    shifts[shift++] = rng() * Math.PI * 2;
    shifts[shift++] = (rng() * 0.9 + 0.1) * Math.PI * 0.1;
    shifts[shift++] = rng() * 0.9 + 0.1;
  };

  const writeSize = () => {
    sizes[size++] = rng() * POINT_SIZE.spread + POINT_SIZE.base;
  };

  for (let i = 0; i < shellCount; i += 1) {
    const [x, y, z] = randomDirection(rng);
    const radius = rng() * SHELL_RADIUS.spread + SHELL_RADIUS.base;
    positions[position++] = x * radius;
    positions[position++] = y * radius;
    positions[position++] = z * radius;
    writeSize();
    writeShift();
  }

  for (let i = 0; i < columnCount; i += 1) {
    const rand = Math.pow(rng(), 1.5);
    const radius = Math.sqrt(
      COLUMN_RADIUS.outer * COLUMN_RADIUS.outer * rand +
        (1 - rand) * COLUMN_RADIUS.inner * COLUMN_RADIUS.inner,
    );
    const theta = rng() * 2 * Math.PI;
    positions[position++] = radius * Math.sin(theta);
    positions[position++] = (rng() - 0.5) * 2;
    positions[position++] = radius * Math.cos(theta);
    writeSize();
    writeShift();
  }

  return { positions, sizes, shifts, count };
}

/**
 * Uniformly distributed point on the unit sphere, matching the
 * distribution of three's Vector3.randomDirection().
 */
function randomDirection(rng: () => number): [number, number, number] {
  const u = rng() * 2 - 1;
  const theta = rng() * Math.PI * 2;
  const ring = Math.sqrt(1 - u * u);
  return [ring * Math.cos(theta), ring * Math.sin(theta), u];
}
