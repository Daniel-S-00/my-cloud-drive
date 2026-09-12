// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  COLUMN_RADIUS,
  NOVA_QUALITY_TIERS,
  POINT_SIZE,
  SHELL_RADIUS,
  buildNovaAttributes,
  pickQualityTier,
} from './nova-geometry';

/** Deterministic LCG so the distributions can be asserted exactly. */
function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const SHIFT_RANGES = {
  x: [0, Math.PI],
  y: [0, Math.PI * 2],
  z: [0.1 * Math.PI * 0.1, 1 * Math.PI * 0.1],
  w: [0.1, 1],
};

describe('NOVA_QUALITY_TIERS', () => {
  it('keeps the high tier well under the original 150k points', () => {
    expect(NOVA_QUALITY_TIERS.high.shellCount + NOVA_QUALITY_TIERS.high.columnCount).toBe(80_000);
    expect(NOVA_QUALITY_TIERS.medium.shellCount + NOVA_QUALITY_TIERS.medium.columnCount).toBe(40_000);
  });

  it('scales the medium tier to exactly half the high tier', () => {
    expect(NOVA_QUALITY_TIERS.medium.shellCount * 2).toBe(NOVA_QUALITY_TIERS.high.shellCount);
    expect(NOVA_QUALITY_TIERS.medium.columnCount * 2).toBe(NOVA_QUALITY_TIERS.high.columnCount);
  });
});

describe('pickQualityTier', () => {
  it('prefers device memory when the browser reports it', () => {
    expect(pickQualityTier({ deviceMemory: 8, hardwareConcurrency: 2 })).toBe('high');
    expect(pickQualityTier({ deviceMemory: 4, hardwareConcurrency: 32 })).toBe('medium');
  });

  it('falls back to core count when device memory is unreported', () => {
    expect(pickQualityTier({ hardwareConcurrency: 8 })).toBe('high');
    expect(pickQualityTier({ hardwareConcurrency: 12 })).toBe('high');
    expect(pickQualityTier({ hardwareConcurrency: 4 })).toBe('medium');
  });

  it('defaults to medium when nothing is known', () => {
    expect(pickQualityTier({})).toBe('medium');
    expect(pickQualityTier({ deviceMemory: 0, hardwareConcurrency: 0 })).toBe('medium');
  });
});

describe('buildNovaAttributes', () => {
  const shellCount = 300;
  const columnCount = 700;

  it('allocates one entry per point in each attribute', () => {
    const { positions, sizes, shifts, count } = buildNovaAttributes({
      shellCount,
      columnCount,
      rng: seededRng(1),
    });

    expect(count).toBe(shellCount + columnCount);
    expect(positions).toHaveLength(count * 3);
    expect(sizes).toHaveLength(count);
    expect(shifts).toHaveLength(count * 4);
  });

  it('handles an empty cloud', () => {
    const { positions, sizes, shifts, count } = buildNovaAttributes({
      shellCount: 0,
      columnCount: 0,
      rng: seededRng(1),
    });

    expect(count).toBe(0);
    expect(positions).toHaveLength(0);
    expect(sizes).toHaveLength(0);
    expect(shifts).toHaveLength(0);
  });

  it('keeps every shell point on a sphere of radius ~9.5-10', () => {
    const { positions } = buildNovaAttributes({
      shellCount,
      columnCount: 0,
      rng: seededRng(7),
    });

    for (let i = 0; i < shellCount; i += 1) {
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];
      const radius = Math.sqrt(x * x + y * y + z * z);
      expect(radius).toBeGreaterThanOrEqual(SHELL_RADIUS.base - 1e-3);
      expect(radius).toBeLessThanOrEqual(SHELL_RADIUS.base + SHELL_RADIUS.spread + 1e-3);
    }
  });

  it('keeps every column point inside the hollow disc', () => {
    const { positions } = buildNovaAttributes({
      shellCount: 0,
      columnCount,
      rng: seededRng(11),
    });

    const innerSquared = COLUMN_RADIUS.inner * COLUMN_RADIUS.inner;
    const outerSquared = COLUMN_RADIUS.outer * COLUMN_RADIUS.outer;

    for (let i = 0; i < columnCount; i += 1) {
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];
      const radialSquared = x * x + z * z;

      expect(radialSquared).toBeGreaterThanOrEqual(innerSquared - 0.1);
      expect(radialSquared).toBeLessThanOrEqual(outerSquared + 0.1);
      expect(Math.abs(y)).toBeLessThanOrEqual(1 + 1e-3);
    }
  });

  it('keeps sizes and shifts within the ranges the shader expects', () => {
    const { sizes, shifts, count } = buildNovaAttributes({
      shellCount,
      columnCount,
      rng: seededRng(13),
    });

    for (let i = 0; i < count; i += 1) {
      expect(sizes[i]).toBeGreaterThanOrEqual(POINT_SIZE.base);
      expect(sizes[i]).toBeLessThanOrEqual(POINT_SIZE.base + POINT_SIZE.spread);

      const shiftX = shifts[i * 4];
      const shiftY = shifts[i * 4 + 1];
      const shiftZ = shifts[i * 4 + 2];
      const shiftW = shifts[i * 4 + 3];

      expect(shiftX).toBeGreaterThanOrEqual(SHIFT_RANGES.x[0]);
      expect(shiftX).toBeLessThanOrEqual(SHIFT_RANGES.x[1]);
      expect(shiftY).toBeGreaterThanOrEqual(SHIFT_RANGES.y[0]);
      expect(shiftY).toBeLessThanOrEqual(SHIFT_RANGES.y[1]);
      expect(shiftZ).toBeGreaterThanOrEqual(SHIFT_RANGES.z[0]);
      expect(shiftZ).toBeLessThanOrEqual(SHIFT_RANGES.z[1]);
      expect(shiftW).toBeGreaterThanOrEqual(SHIFT_RANGES.w[0]);
      expect(shiftW).toBeLessThanOrEqual(SHIFT_RANGES.w[1]);
    }
  });

  it('is deterministic for a given seed', () => {
    const first = buildNovaAttributes({ shellCount, columnCount, rng: seededRng(23) });
    const second = buildNovaAttributes({ shellCount, columnCount, rng: seededRng(23) });

    expect(Array.from(first.positions)).toEqual(Array.from(second.positions));
    expect(Array.from(first.sizes)).toEqual(Array.from(second.sizes));
    expect(Array.from(first.shifts)).toEqual(Array.from(second.shifts));
  });

  it('produces different clouds for different seeds', () => {
    const first = buildNovaAttributes({ shellCount, columnCount, rng: seededRng(29) });
    const second = buildNovaAttributes({ shellCount, columnCount, rng: seededRng(31) });

    expect(Array.from(first.positions)).not.toEqual(Array.from(second.positions));
  });

  it('stores the shell before the column', () => {
    const { positions } = buildNovaAttributes({
      shellCount,
      columnCount,
      rng: seededRng(37),
    });

    const lastShell = shellCount - 1;
    const x = positions[lastShell * 3];
    const y = positions[lastShell * 3 + 1];
    const z = positions[lastShell * 3 + 2];
    expect(Math.sqrt(x * x + y * y + z * z)).toBeLessThanOrEqual(
      SHELL_RADIUS.base + SHELL_RADIUS.spread + 1e-3,
    );

    const firstColumn = shellCount;
    const cx = positions[firstColumn * 3];
    const cz = positions[firstColumn * 3 + 2];
    expect(cx * cx + cz * cz).toBeGreaterThanOrEqual(
      COLUMN_RADIUS.inner * COLUMN_RADIUS.inner - 0.1,
    );
  });
});
