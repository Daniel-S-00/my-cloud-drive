// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { ShaderChunk } from 'three';
import {
  NOVA_DEPTH,
  NOVA_FRAGMENT_ANCHORS,
  NOVA_FRAGMENT_DECLS,
  NOVA_FRAGMENT_SPRITE,
  NOVA_POINTER,
  NOVA_TWINKLE,
  NOVA_VERTEX_ANCHORS,
  NOVA_VERTEX_DECLS,
  NOVA_VERTEX_DEPTH_TINT,
  NOVA_VERTEX_ORBIT,
  NOVA_VERTEX_POINTER,
  NOVA_VERTEX_RAMP,
  NOVA_VERTEX_TWINKLE,
  assertNovaShaderAnchors,
  patchNovaFragment,
  patchNovaVertex,
} from './nova-shader';

/**
 * These assertions are the guard rail for the shader patch. If a three.js
 * upgrade moves an anchor, this fails instead of silently rendering an
 * empty scene.
 */
describe('three.js shader chunk anchors', () => {
  it('still exposes every vertex anchor we splice into', () => {
    for (const anchor of NOVA_VERTEX_ANCHORS) {
      expect(
        ShaderChunk.points_vert.split(anchor).length - 1,
        `missing vertex anchor ${JSON.stringify(anchor)}`,
      ).toBe(1);
    }
  });

  it('still exposes every fragment anchor we replace', () => {
    for (const anchor of NOVA_FRAGMENT_ANCHORS) {
      expect(
        ShaderChunk.points_frag.split(anchor).length - 1,
        `missing fragment anchor ${JSON.stringify(anchor)}`,
      ).toBe(1);
    }
  });

  it('accepts the real chunks', () => {
    expect(() =>
      assertNovaShaderAnchors(ShaderChunk.points_vert, ShaderChunk.points_frag),
    ).not.toThrow();
  });

  it('needs no chunk-defined helpers beyond the GLSL built-ins', () => {
    expect(NOVA_VERTEX_ORBIT).not.toContain('PI2');
    expect(NOVA_VERTEX_ORBIT).toContain('cos(');
    expect(NOVA_VERTEX_ORBIT).toContain('sin(');
  });
});

describe('assertNovaShaderAnchors', () => {
  it('reports which anchors are missing', () => {
    expect(() =>
      assertNovaShaderAnchors('void main() {}', 'void main() {}'),
    ).toThrow(/three\.js changed its vertex points shader/);
  });

  it('names the offending anchor', () => {
    expect(() =>
      assertNovaShaderAnchors('void main() {}', 'void main() {}'),
    ).toThrow(/gl_PointSize = size;/);
  });

  it('passes when only the fragment side is broken', () => {
    expect(() =>
      assertNovaShaderAnchors(ShaderChunk.points_vert, 'void main() {}'),
    ).toThrow(/fragment points shader/);
  });
});

describe('patchNovaVertex', () => {
  const patched = patchNovaVertex(ShaderChunk.points_vert);

  it('declares the custom attribute and uniform surface', () => {
    expect(patched).toContain(NOVA_VERTEX_DECLS);
    expect(patched).toContain('uniform float time;');
    expect(patched).toContain('attribute float sizes;');
    expect(patched).toContain('attribute vec3 orbits;');
    expect(patched).toContain('attribute float shades;');
    expect(patched).toContain('varying vec3 vColor;');
    expect(patched).toContain('uniform vec3 uColorCore;');
    expect(patched).toContain('uniform vec3 uColorMid;');
    expect(patched).toContain('uniform vec3 uColorDeep;');
  });

  it('scales gl_PointSize by the per-point attribute', () => {
    expect(patched).toContain('gl_PointSize = size * sizes;');
    expect(patched).not.toContain('gl_PointSize = size;');
  });

  it('inserts the colour ramp and the orbital motion', () => {
    expect(patched).toContain(NOVA_VERTEX_RAMP);
    expect(patched).toContain(NOVA_VERTEX_ORBIT);
  });

  it('ramps the colour after vColor is written and before transformed exists', () => {
    expect(patched.indexOf('#include <color_vertex>')).toBeLessThan(
      patched.indexOf(NOVA_VERTEX_RAMP),
    );
    expect(patched.indexOf(NOVA_VERTEX_RAMP)).toBeLessThan(
      patched.indexOf('#include <begin_vertex>'),
    );
  });

  it('displaces transformed after it is declared and before it is projected', () => {
    expect(patched.indexOf('#include <begin_vertex>')).toBeLessThan(
      patched.indexOf(NOVA_VERTEX_ORBIT),
    );
    expect(patched.indexOf(NOVA_VERTEX_ORBIT)).toBeLessThan(
      patched.indexOf('#include <project_vertex>'),
    );
  });

  it('keeps the projection step that consumes the displaced vertex', () => {
    expect(patched).toContain('#include <project_vertex>');
  });

  it('ramps colour from the generator-assigned shade, not from position', () => {
    expect(NOVA_VERTEX_RAMP).toContain('shades');
    expect(NOVA_VERTEX_RAMP).not.toContain('position');
  });

  it('moves each point along its own orbit', () => {
    expect(NOVA_VERTEX_ORBIT).toContain('orbits.y + time * orbits.z');
    expect(NOVA_VERTEX_ORBIT).toContain('* orbits.x');
    // The plane is shared now, so the attribute carries no per-point tilt.
    expect(NOVA_VERTEX_ORBIT).not.toContain('orbits.w');
  });

  it('leaves a zero orbit exactly where the point started', () => {
    // Core points carry a zero orbit, so the radius has to scale the whole
    // displacement: at orbits.x == 0 the point must not shift at all.
    expect(NOVA_VERTEX_ORBIT).toContain(
      'transformed += vec3(cos(novaAngle), 0.0, sin(novaAngle)) * orbits.x;',
    );
    expect(NOVA_VERTEX_ORBIT).toContain(
      'float novaAngle = orbits.y + time * orbits.z;',
    );
  });
});

describe('patchNovaVertex cursor reaction', () => {
  const patched = patchNovaVertex(ShaderChunk.points_vert);

  it('declares the pointer uniforms', () => {
    expect(patched).toContain('uniform vec2 uPointer;');
    expect(patched).toContain('uniform float uPointerAspect;');
    expect(patched).toContain('uniform float uPointerStrength;');
  });

  it('includes the reaction block', () => {
    expect(patched).toContain(NOVA_VERTEX_POINTER);
  });

  it('runs after gl_Position exists', () => {
    expect(patched.indexOf('#include <project_vertex>')).toBeLessThan(
      patched.indexOf(NOVA_VERTEX_POINTER),
    );
  });

  it('runs after vColor is assigned, since it lifts it', () => {
    expect(patched.indexOf(NOVA_VERTEX_RAMP)).toBeLessThan(
      patched.indexOf(NOVA_VERTEX_POINTER),
    );
  });

  it('leaves room for the orbit displacement, which edits transformed', () => {
    // The reaction only touches gl_Position/gl_PointSize, never the mesh
    // position, so it cannot fight the orbit displacement.
    expect(patched.indexOf(NOVA_VERTEX_ORBIT)).toBeLessThan(
      patched.indexOf(NOVA_VERTEX_POINTER),
    );
    expect(NOVA_VERTEX_POINTER).not.toContain('transformed');
  });

  it('bakes the tuned constants in as float literals', () => {
    // GLSL rejects an int literal where a float is expected, so a bare `1`
    // would not compile; toFixed keeps the decimal point.
    for (const value of Object.values(NOVA_POINTER)) {
      expect(patched).toContain(value.toFixed(4));
    }
  });

  it('guards against points behind the camera, where w <= 0', () => {
    expect(NOVA_VERTEX_POINTER).toContain('gl_Position.w > 0.0');
  });

  it('corrects the influence radius for the viewport aspect ratio', () => {
    expect(NOVA_VERTEX_POINTER).toContain('novaDelta.x *= uPointerAspect;');
    expect(NOVA_VERTEX_POINTER).toContain('novaShift.x /= uPointerAspect;');
  });

  it('walks the influence from 1 at the cursor down to 0 at the radius', () => {
    expect(NOVA_VERTEX_POINTER).toContain(
      `smoothstep(${NOVA_POINTER.radius.toFixed(4)}, 0.0, length(novaDelta))`,
    );
  });

  it('stirs rather than parts, by rotating the push direction', () => {
    expect(NOVA_VERTEX_POINTER).toContain(
      'novaDirection = vec2(-novaDirection.y, novaDirection.x);',
    );
    expect(NOVA_VERTEX_POINTER).not.toContain('uVortex');
    // Magnitude is untouched, so the stir covers the same area.
    expect(NOVA_VERTEX_POINTER).toContain(
      `novaDirection * novaInfluence * ${NOVA_POINTER.push.toFixed(4)}`,
    );
  });
});

describe('patchNovaVertex post-projection effects', () => {
  const patched = patchNovaVertex(ShaderChunk.points_vert);

  it('includes every effect block, unconditionally', () => {
    for (const block of [NOVA_VERTEX_DEPTH_TINT, NOVA_VERTEX_TWINKLE]) {
      expect(patched).toContain(block);
    }
  });

  /**
   * These shipped behind toggles while the effects were being measured. The
   * lab is gone, so any gate left behind would be dead weight — and a stale
   * uniform that nothing sets would silently pin its effect off.
   */
  it('carries no leftover effect toggles', () => {
    for (const name of ['uTwinkle', 'uSpiral', 'uDepthTint', 'uVortex']) {
      expect(patched).not.toContain(name);
    }
  });

  it('keeps only the cursor gate, which is eased rather than switched', () => {
    expect(NOVA_VERTEX_POINTER).toContain('uPointerStrength > 0.0');
  });

  it('tints by depth after mvPosition exists', () => {
    expect(patched.indexOf('#include <project_vertex>')).toBeLessThan(
      patched.indexOf(NOVA_VERTEX_DEPTH_TINT),
    );
    expect(NOVA_VERTEX_DEPTH_TINT).toContain('mvPosition');
  });

  it('twinkles out of phase, from a hash of the point position', () => {
    expect(NOVA_VERTEX_TWINKLE).toContain('novaPhase');
    expect(NOVA_VERTEX_TWINKLE).toContain('fract(');
    // A dedicated attribute would be the other option, but it costs a buffer
    // and the hash is stable per point.
    expect(NOVA_VERTEX_TWINKLE).toContain('position');
  });

  it('bakes the effect constants in as float literals', () => {
    // NOVA_DEPTH.far is a bound, not a literal: the shader uses far - near.
    const literals = [
      NOVA_TWINKLE.base,
      NOVA_TWINKLE.amplitude,
      NOVA_TWINKLE.speed,
      NOVA_TWINKLE.phaseScale,
      ...NOVA_TWINKLE.hash,
      NOVA_DEPTH.near,
      NOVA_DEPTH.far - NOVA_DEPTH.near,
      NOVA_DEPTH.floor,
    ];
    for (const value of literals) {
      expect(patched).toContain(value.toFixed(4));
    }
  });
});

describe('patchNovaFragment', () => {
  const patched = patchNovaFragment(ShaderChunk.points_frag);

  it('declares the shared varying', () => {
    expect(patched).toContain(NOVA_FRAGMENT_DECLS);
    expect(patched.indexOf('varying vec3 vColor;')).toBe(0);
  });

  it('replaces the flat material colour with the ramped sprite', () => {
    expect(patched).toContain(NOVA_FRAGMENT_SPRITE);
    expect(patched).toContain('vec2 novaUv = gl_PointCoord.xy - 0.5;');
    expect(patched).toContain(
      'vec4 diffuseColor = vec4( vColor, pow(1.0 - novaR2, 2.0) );',
    );
    expect(patched).not.toContain('vec4 diffuseColor = vec4( diffuse, opacity );');
  });

  it('declares the sprite distance before the line that reads it', () => {
    expect(patched.indexOf('float novaR2 =')).toBeLessThan(
      patched.indexOf('pow(1.0 - novaR2, 2.0)'),
    );
  });

  it('fades to nothing at the sprite edge, not to a hard disc', () => {
    // The squared falloff reaches exactly 0 where the point sprite ends.
    expect(NOVA_FRAGMENT_SPRITE).toContain('clamp(');
    expect(NOVA_FRAGMENT_SPRITE).toContain('pow(1.0 - novaR2, 2.0)');
  });

  it('loses no include directives', () => {
    const includesOf = (source: string) => source.match(/#include <[^>]+>/g) ?? [];
    expect(includesOf(patched).sort()).toEqual(
      includesOf(ShaderChunk.points_frag).sort(),
    );
  });
});
