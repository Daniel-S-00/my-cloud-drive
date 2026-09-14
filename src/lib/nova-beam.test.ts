// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  hasArgumentTrailingComma,
  malformedConstructors,
} from './glsl-guards';
import {
  NOVA_BEAM,
  NOVA_BEAM_FRAGMENT,
  NOVA_BEAM_VERTEX,
  buildNovaBeamAttributes,
} from './nova-beam';
import { NOVA_PLANE_TILT } from './nova-geometry';

const attributes = buildNovaBeamAttributes();

const radiusAt = (vertex: number) =>
  Math.hypot(
    attributes.positions[vertex * 3],
    attributes.positions[vertex * 3 + 2],
  );

describe('buildNovaBeamAttributes', () => {
  const perBeam = (NOVA_BEAM.rings + 1) * NOVA_BEAM.segments;

  it('builds two tubes as flat arrays', () => {
    expect(attributes.count).toBe(perBeam * 2);
    expect(attributes.positions).toHaveLength(attributes.count * 3);
    expect(attributes.normals).toHaveLength(attributes.count * 3);
    expect(attributes.alongs).toHaveLength(attributes.count);
    expect(
      attributes.indices.length,
    ).toBe(NOVA_BEAM.rings * NOVA_BEAM.segments * 6 * 2);
  });

  it('produces no NaN', () => {
    for (const buffer of [
      attributes.positions,
      attributes.normals,
      attributes.alongs,
    ]) {
      expect(Array.from(buffer).every(Number.isFinite)).toBe(true);
    }
  });

  it('only ever indexes vertices it built', () => {
    for (const index of attributes.indices) {
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(attributes.count);
    }
  });

  it('runs one tube out of each pole, along the axis', () => {
    let up = 0;
    let down = 0;

    for (let vertex = 0; vertex < attributes.count; vertex += 1) {
      const y = attributes.positions[vertex * 3 + 1];
      const height = Math.abs(y);
      expect(height).toBeGreaterThanOrEqual(NOVA_BEAM.base - 1e-3);
      expect(height).toBeLessThanOrEqual(
        NOVA_BEAM.base + NOVA_BEAM.reach + 1e-3,
      );
      if (y > 0) up += 1;
      else down += 1;
    }

    // Mirrored, not stacked: one jet would read as a plume.
    expect(up).toBe(perBeam);
    expect(down).toBe(perBeam);
  });

  it('tapers from the core outwards, inside its own flare', () => {
    for (let vertex = 0; vertex < attributes.count; vertex += 1) {
      const along = attributes.alongs[vertex];
      const radius = radiusAt(vertex);

      expect(along).toBeGreaterThanOrEqual(0);
      expect(along).toBeLessThanOrEqual(1);
      expect(radius).toBeGreaterThanOrEqual(NOVA_BEAM.baseRadius - 1e-3);
      expect(radius).toBeLessThanOrEqual(
        NOVA_BEAM.baseRadius + NOVA_BEAM.flare + 1e-3,
      );
      // Every ring of the beam stands at its own height: the taper is in the
      // radius, not in the length.
      expect(radius).toBeCloseTo(
        NOVA_BEAM.baseRadius + NOVA_BEAM.flare * along,
        5,
      );
    }
  });

  it('climbs along the axis ring by ring', () => {
    const heights = new Set<number>();

    for (let vertex = 0; vertex < perBeam; vertex += 1) {
      heights.add(Number(attributes.positions[vertex * 3 + 1].toFixed(5)));
    }

    // One distinct height per ring, so the tube is a tube and not a fan.
    expect(heights.size).toBe(NOVA_BEAM.rings + 1);
  });

  it('twists, and mirrors the twist between the two beams', () => {
    /** Mean azimuth of one ring, unwrapped to the ring's own turn. */
    const turnAt = (sideStart: number, ring: number) => {
      let sum = 0;
      for (let segment = 0; segment < NOVA_BEAM.segments; segment += 1) {
        const vertex = sideStart + ring * NOVA_BEAM.segments + segment;
        const base = (segment / NOVA_BEAM.segments) * Math.PI * 2;
        const azimuth = Math.atan2(
          attributes.positions[vertex * 3 + 2],
          attributes.positions[vertex * 3],
        );
        // Shortest way round, so the twist is not confused with wrapping.
        sum += Math.atan2(
          Math.sin(azimuth - base),
          Math.cos(azimuth - base),
        );
      }
      return sum / NOVA_BEAM.segments;
    };

    const lastRing = NOVA_BEAM.rings;
    const top = turnAt(0, lastRing);
    const bottom = turnAt(perBeam, lastRing);

    expect(Math.abs(top)).toBeCloseTo(NOVA_BEAM.twist, 3);
    // Opposite signs: the pair is mirrored about the disc rather than bending
    // the same way.
    expect(Math.sign(top)).toBe(-Math.sign(bottom));
    expect(bottom).toBeCloseTo(-top, 5);
  });

  it('keeps every normal on the tube', () => {
    for (let vertex = 0; vertex < attributes.count; vertex += 1) {
      const normal = Math.hypot(
        attributes.normals[vertex * 3],
        attributes.normals[vertex * 3 + 1],
        attributes.normals[vertex * 3 + 2],
      );
      expect(normal).toBeCloseTo(1, 5);
      // A tube's wall points away from the axis, never along it.
      expect(attributes.normals[vertex * 3 + 1]).toBe(0);
    }
  });

  it('lays the rings out in order, so the index math lines up', () => {
    for (let beam = 0; beam < 2; beam += 1) {
      for (let ring = 0; ring <= NOVA_BEAM.rings; ring += 1) {
        const first = beam * perBeam + ring * NOVA_BEAM.segments;
        const height = attributes.positions[first * 3 + 1];

        for (let segment = 0; segment < NOVA_BEAM.segments; segment += 1) {
          const vertex = first + segment;
          // One height per ring, one ring after another, each of them whole:
          // that is the layout the triangle indices are written against.
          expect(attributes.positions[vertex * 3 + 1]).toBe(height);
          expect(attributes.alongs[vertex]).toBeCloseTo(
            ring / NOVA_BEAM.rings,
            6,
          );
        }
      }
    }
  });
});

describe('NOVA_BEAM shaders', () => {
  it('never constructs a vector from the wrong number of components', () => {
    expect(malformedConstructors(NOVA_BEAM_VERTEX)).toEqual([]);
    expect(malformedConstructors(NOVA_BEAM_FRAGMENT)).toEqual([]);
  });

  it('never leaves a trailing comma in an argument list', () => {
    expect(hasArgumentTrailingComma(NOVA_BEAM_VERTEX)).toBe(false);
    expect(hasArgumentTrailingComma(NOVA_BEAM_FRAGMENT)).toBe(false);
  });

  it('bakes its look constants in as float literals', () => {
    for (const value of [
      NOVA_BEAM.spin,
      NOVA_BEAM.twist,
      NOVA_BEAM.falloff,
      NOVA_BEAM.decay,
      NOVA_BEAM.fade,
      NOVA_BEAM.waves,
      NOVA_BEAM.flowRate,
      NOVA_BEAM.flow,
      NOVA_BEAM.strength,
    ]) {
      expect(`${NOVA_BEAM_VERTEX}${NOVA_BEAM_FRAGMENT}`).toContain(
        value.toFixed(4),
      );
    }
  });

  it('passes along the beam and the view position to the fragment', () => {
    expect(NOVA_BEAM_VERTEX).toContain('attribute float along;');
    expect(NOVA_BEAM_VERTEX).toContain('varying float vAlong;');
    expect(NOVA_BEAM_VERTEX).toContain('varying vec3 vNormalView;');
    expect(NOVA_BEAM_VERTEX).toContain('varying vec3 vPositionView;');
    expect(NOVA_BEAM_FRAGMENT).toContain('varying float vAlong;');
    expect(NOVA_BEAM_FRAGMENT).toContain('varying vec3 vNormalView;');
    expect(NOVA_BEAM_FRAGMENT).toContain('varying vec3 vPositionView;');
  });

  it('turns the tube about its own axis before projecting it', () => {
    expect(NOVA_BEAM_VERTEX).toContain(
      'position.x * novaCos - position.z * novaSin,',
    );
    expect(NOVA_BEAM_VERTEX).toContain(
      'position.x * novaSin + position.z * novaCos',
    );
    // The normal turns with the wall it belongs to, or the light would slide
    // against its own beam.
    expect(NOVA_BEAM_VERTEX).toContain(
      'vNormalView = normalize(normalMatrix * (novaTurn * normal));',
    );
  });

  it('ignores the cursor', () => {
    // The beams span the frame, so the displacement the points get would read
    // as the whole screen flexing. The light stays where the core aims it.
    expect(NOVA_BEAM_VERTEX).not.toContain('uPointer');
    expect(NOVA_BEAM_FRAGMENT).not.toContain('vIgnite');
    expect(NOVA_BEAM_VERTEX).not.toContain('gl_Position.xy =');
  });

  it('reads brightness from the silhouette, not from a flat colour', () => {
    // This is the whole difference between a tube and a beam of light: the
    // eye is looking through more of it down the middle than at the edges.
    expect(NOVA_BEAM_FRAGMENT).toContain(
      'float novaFacing = abs(dot(normalize(vNormalView), normalize(-vPositionView)));',
    );
    expect(NOVA_BEAM_FRAGMENT).toContain('float novaShaft = pow(novaFacing,');
    expect(NOVA_BEAM_FRAGMENT).toContain(
      `float novaFade = pow(1.0 - vAlong, ${NOVA_BEAM.fade.toFixed(4)})`,
    );
  });

  it('is hot at the core and gone by the tip', () => {
    /** The light's own fade, evaluated in JS from the two constants. */
    const fade = (along: number) =>
      Math.pow(1 - along, NOVA_BEAM.fade) * Math.exp(-along * NOVA_BEAM.decay);

    expect(fade(0)).toBe(1);
    // "Much brighter at the origin" as a property: several times the light
    // halfway out, and exactly nothing at the end — the exponential alone
    // never reaches zero, which is what `fade` is for.
    expect(fade(0) / fade(0.5)).toBeGreaterThan(3);
    expect(fade(1)).toBe(0);
  });

  it('runs a wave of brightness out along the beam', () => {
    expect(NOVA_BEAM_FRAGMENT).toContain('float novaFlow = mix(');
    expect(NOVA_BEAM_FRAGMENT).toContain('sin(vAlong *');
  });

  it('walks the same colour ramp as the points', () => {
    expect(NOVA_BEAM_FRAGMENT).toContain('uniform vec3 uColorCore;');
    expect(NOVA_BEAM_FRAGMENT).toContain('uniform vec3 uColorMid;');
    expect(NOVA_BEAM_FRAGMENT).toContain('uniform vec3 uColorDeep;');
    expect(NOVA_BEAM_FRAGMENT).toContain(
      '? mix(uColorCore, uColorMid, vAlong / 0.5)',
    );
    expect(NOVA_BEAM_FRAGMENT).toContain(
      ': mix(uColorMid, uColorDeep, (vAlong - 0.5) / 0.5);',
    );
  });

  it('reaches past the frame, so the light has no visible end', () => {
    // The camera sits at z = 16 with a 55 degree field of view, so the frame
    // is this tall at the origin's depth. The beam is leaned with the disc,
    // which is what the cosine undoes.
    const frameHalfHeight = Math.tan((55 / 2) * (Math.PI / 180)) * 16;
    const tipHeight =
      (NOVA_BEAM.base + NOVA_BEAM.reach) * Math.cos(NOVA_PLANE_TILT);

    expect(tipHeight).toBeGreaterThan(frameHalfHeight);
  });
});
