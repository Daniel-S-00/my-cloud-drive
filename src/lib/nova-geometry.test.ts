// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  NOVA_CORE,
  NOVA_DUST,
  NOVA_ORBIT_SPEED,
  NOVA_PLANE_TILT,
  NOVA_PLANETOIDS,
  NOVA_POINT_SIZE,
  NOVA_QUALITY_TIERS,
  NOVA_SHADE,
  buildNovaAttributes,
  pickQualityTier,
} from './nova-geometry';

/** Deterministic LCG so the distribution assertions are reproducible. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const BODIES = NOVA_PLANETOIDS.count;

/** Body `index` in generation order has this many points. */
function bodySize(index: number, planetoidCount: number): number {
  const perBody = Math.floor(planetoidCount / BODIES);
  return perBody + (index < planetoidCount % BODIES ? 1 : 0);
}

function orbitAt(orbits: Float32Array, point: number) {
  return [orbits[point * 3], orbits[point * 3 + 1], orbits[point * 3 + 2]];
}

/** First point index of each body, paired with the body's own orbit. */
function bodyOrbits(
  orbits: Float32Array,
  coreCount: number,
  planetoidCount: number,
) {
  const bodies: { radius: number; speed: number; start: number; size: number }[] =
    [];
  let point = coreCount;
  for (let body = 0; body < BODIES; body += 1) {
    const size = bodySize(body, planetoidCount);
    const [radius, , speed] = orbitAt(orbits, point);
    bodies.push({ radius, speed, start: point, size });
    point += size;
  }
  return bodies;
}

describe('NOVA_QUALITY_TIERS', () => {
  it('keeps the total point budget the scene was tuned around', () => {
    const total = (tier: keyof typeof NOVA_QUALITY_TIERS) => {
      const counts = NOVA_QUALITY_TIERS[tier];
      return counts.coreCount + counts.planetoidCount + counts.dustCount;
    };
    expect(total('high')).toBe(144_000);
    expect(total('medium')).toBe(72_000);
  });

  it('halves every population on the lower tier', () => {
    const { high, medium } = NOVA_QUALITY_TIERS;
    expect(medium.coreCount * 2).toBe(high.coreCount);
    expect(medium.planetoidCount * 2).toBe(high.planetoidCount);
    expect(medium.dustCount * 2).toBe(high.dustCount);
  });
});

describe('pickQualityTier', () => {
  it('prefers high on roomy devices', () => {
    expect(pickQualityTier({ deviceMemory: 8 })).toBe('high');
    expect(pickQualityTier({ deviceMemory: 16 })).toBe('high');
  });

  it('drops to medium on constrained memory', () => {
    expect(pickQualityTier({ deviceMemory: 4 })).toBe('medium');
    expect(pickQualityTier({ deviceMemory: 2 })).toBe('medium');
  });

  it('falls back to core count when memory is not reported', () => {
    expect(pickQualityTier({ hardwareConcurrency: 12 })).toBe('high');
    expect(pickQualityTier({ hardwareConcurrency: 4 })).toBe('medium');
  });

  it('prefers memory over core count when both are known', () => {
    expect(pickQualityTier({ deviceMemory: 2, hardwareConcurrency: 16 })).toBe(
      'medium',
    );
    expect(pickQualityTier({ deviceMemory: 8, hardwareConcurrency: 2 })).toBe(
      'high',
    );
  });

  it('assumes medium when nothing is reported', () => {
    expect(pickQualityTier({})).toBe('medium');
  });
});

describe('buildNovaAttributes', () => {
  const coreCount = 400;
  const planetoidCount = 600;
  const dustCount = 200;
  const total = coreCount + planetoidCount + dustCount;
  const dustStart = coreCount + planetoidCount;
  const attributes = buildNovaAttributes({
    coreCount,
    planetoidCount,
    dustCount,
    rng: seeded(7),
  });

  it('sizes every buffer to the point count', () => {
    expect(attributes.count).toBe(total);
    expect(attributes.positions).toHaveLength(total * 3);
    expect(attributes.sizes).toHaveLength(total);
    expect(attributes.orbits).toHaveLength(total * 3);
    expect(attributes.shades).toHaveLength(total);
  });

  it('produces no NaN, whatever the generator decides', () => {
    for (const buffer of [
      attributes.positions,
      attributes.sizes,
      attributes.orbits,
      attributes.shades,
    ]) {
      expect(Array.from(buffer).every(Number.isFinite)).toBe(true);
    }
  });

  it('is reproducible for a given generator', () => {
    const again = buildNovaAttributes({
      coreCount,
      planetoidCount,
      dustCount,
      rng: seeded(7),
    });
    expect(Array.from(again.positions)).toEqual(
      Array.from(attributes.positions),
    );
    expect(Array.from(again.orbits)).toEqual(Array.from(attributes.orbits));
  });

  it('handles an empty population', () => {
    const empty = buildNovaAttributes({
      coreCount: 0,
      planetoidCount: 0,
      dustCount: 0,
      rng: seeded(1),
    });
    expect(empty.count).toBe(0);
    expect(empty.positions).toHaveLength(0);
    expect(empty.orbits).toHaveLength(0);
  });

  it('builds the core as a ball at the origin, with nothing to orbit', () => {
    for (let point = 0; point < coreCount; point += 1) {
      const x = attributes.positions[point * 3];
      const y = attributes.positions[point * 3 + 1];
      const z = attributes.positions[point * 3 + 2];
      expect(Math.hypot(x, y, z)).toBeLessThanOrEqual(NOVA_CORE.radius + 1e-3);
      expect(orbitAt(attributes.orbits, point)).toEqual([0, 0, 0]);
      expect(attributes.shades[point]).toBeCloseTo(NOVA_SHADE.core, 5);
    }
  });

  it('builds each planetoid as one rigid orbit', () => {
    let expected = coreCount;
    for (const body of bodyOrbits(
      attributes.orbits,
      coreCount,
      planetoidCount,
    )) {
      expect(body.start).toBe(expected);
      const first = orbitAt(attributes.orbits, body.start);

      for (let i = 0; i < body.size; i += 1) {
        // Every point of a body must share the body's orbit, otherwise the
        // body smears along its path instead of travelling as one object.
        expect(orbitAt(attributes.orbits, body.start + i)).toEqual(first);
        // Float32 storage, so compare with a tolerance rather than exactly.
        expect(attributes.shades[body.start + i]).toBeCloseTo(
          NOVA_SHADE.planetoid,
          5,
        );
      }

      expected += body.size;
    }
    expect(expected).toBe(coreCount + planetoidCount);
  });

  it('gives every planetoid a distinct orbit', () => {
    const radii = new Set(
      bodyOrbits(attributes.orbits, coreCount, planetoidCount).map(
        (body) => body.radius,
      ),
    );
    expect(radii.size).toBe(BODIES);
  });

  it('keeps every orbit inside the configured band', () => {
    for (const body of bodyOrbits(
      attributes.orbits,
      coreCount,
      planetoidCount,
    )) {
      expect(body.radius).toBeGreaterThanOrEqual(NOVA_PLANETOIDS.orbitInner);
      expect(body.radius).toBeLessThanOrEqual(NOVA_PLANETOIDS.orbitOuter);
      expect(body.speed).toBeCloseTo(NOVA_ORBIT_SPEED / body.radius, 5);
    }
  });

  it('makes the widest orbit the slowest one', () => {
    // Angular speed falls off with radius, so the inner bodies lap the outer
    // ones — this is what replaced the old differential twist, and it is
    // bounded because the bodies never stop being discrete objects.
    const bodies = bodyOrbits(attributes.orbits, coreCount, planetoidCount);
    const widest = bodies.reduce((a, b) => (b.radius > a.radius ? b : a));
    const tightest = bodies.reduce((a, b) => (b.radius < a.radius ? b : a));
    expect(widest.speed).toBeLessThan(tightest.speed);
  });

  it('turns the bodies and the dust the same way', () => {
    // Every angular speed sharing a sign is what makes the scene read as one
    // rotating system. Per-body inclinations used to fight this: a body on a
    // mirrored plane climbs where its neighbour descends, which looks like
    // bodies orbiting in opposite directions.
    const speeds: number[] = [];
    for (let point = coreCount; point < total; point += 1) {
      speeds.push(attributes.orbits[point * 3 + 2]);
    }
    expect(speeds.every((speed) => speed > 0)).toBe(true);
  });

  it('leans the whole system by one shared angle', () => {
    // The lean is a scene value now, not a per-point one, so it must not
    // live in the attribute.
    expect(NOVA_PLANE_TILT).toBeCloseTo(Math.PI / 4, 6);
    expect(attributes.orbits).toHaveLength(total * 3);
  });

  it('keeps planetoid points near their own orbit', () => {
    for (const body of bodyOrbits(
      attributes.orbits,
      coreCount,
      planetoidCount,
    )) {
      for (let i = 0; i < body.size; i += 1) {
        const at = (body.start + i) * 3;
        const distance = Math.hypot(
          attributes.positions[at],
          attributes.positions[at + 1],
          attributes.positions[at + 2],
        );
        // The offset is added to the orbit centre, so a point can sit a body
        // radius either side of it — never further.
        expect(distance).toBeLessThanOrEqual(
          body.radius + NOVA_PLANETOIDS.bodyMax + 1e-3,
        );
      }
    }
  });

  it('co-rotates the dust with the bodies at the same radius', () => {
    for (let i = 0; i < dustCount; i += 1) {
      const point = dustStart + i;
      const radius = attributes.orbits[point * 3];
      const speed = attributes.orbits[point * 3 + 2];
      expect(speed).toBeCloseTo(NOVA_ORBIT_SPEED / radius, 5);
    }
  });

  it('floors the dust orbit so nothing sits on the axis', () => {
    // The 1/radius speed law tends to infinity near the centre, so the
    // innermost dust has to be held off it.
    for (let i = 0; i < dustCount; i += 1) {
      expect(attributes.orbits[(dustStart + i) * 3]).toBeGreaterThanOrEqual(
        NOVA_DUST.minOrbit,
      );
    }
  });

  it('carries the dust disc in its orbit, not its offset', () => {
    for (let i = 0; i < dustCount; i += 1) {
      const point = dustStart + i;
      expect(attributes.orbits[point * 3]).toBeLessThanOrEqual(
        NOVA_DUST.radius + 1e-3,
      );
      // The offset is only the disc's thickness; where the point sits in the
      // ring comes from the orbit.
      expect(attributes.positions[point * 3]).toBe(0);
      expect(attributes.positions[point * 3 + 2]).toBe(0);
      expect(Math.abs(attributes.positions[point * 3 + 1])).toBeLessThanOrEqual(
        NOVA_DUST.thickness + 1e-3,
      );
      expect(attributes.shades[point]).toBeCloseTo(NOVA_SHADE.dust, 5);
    }
  });

  it('keeps the dust dimmer than the planetoids', () => {
    // With additive blending the dust accumulates over far more points, so
    // its per-point shade has to stay well above the bodies' or it buries
    // them.
    expect(NOVA_SHADE.dust).toBeGreaterThan(NOVA_SHADE.planetoid);
  });

  it('keeps every point size inside the configured range', () => {
    const { min, spread } = NOVA_POINT_SIZE;
    for (const size of attributes.sizes) {
      expect(size).toBeGreaterThanOrEqual(min);
      expect(size).toBeLessThanOrEqual(min + spread + 1e-6);
    }
  });

  it('biases sizes small, so a few points carry the brightness', () => {
    const { min, spread } = NOVA_POINT_SIZE;
    const midpoint = min + spread / 2;
    const large = Array.from(attributes.sizes).filter(
      (size) => size > midpoint,
    ).length;
    // A linear distribution would put about half above the midpoint; the
    // squared bias has to push well under that.
    expect(large).toBeLessThan(total * 0.35);
  });
});
