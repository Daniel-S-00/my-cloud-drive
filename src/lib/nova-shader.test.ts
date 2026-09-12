// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { ShaderChunk } from 'three';
import {
  NOVA_FRAGMENT_ANCHORS,
  NOVA_FRAGMENT_DECLS,
  NOVA_FRAGMENT_SPRITE,
  NOVA_VERTEX_ANCHORS,
  NOVA_VERTEX_DECLS,
  NOVA_VERTEX_MOTION,
  NOVA_VERTEX_RAMP,
  assertNovaShaderAnchors,
  patchNovaFragment,
  patchNovaVertex,
} from './nova-shader';

/**
 * These assertions are the guard rail for the shader port. If a three.js
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

  it('declares PI2 in <common>, which the motion patch relies on', () => {
    expect(ShaderChunk.points_vert).toContain('#include <common>');
    expect(ShaderChunk.common).toContain('PI2');
  });
});

describe('assertNovaShaderAnchors', () => {
  it('reports which anchors are missing', () => {
    expect(() => assertNovaShaderAnchors('void main() {}', 'void main() {}')).toThrow(
      /three\.js changed its vertex points shader/,
    );
  });

  it('names the offending anchor', () => {
    expect(() => assertNovaShaderAnchors('void main() {}', 'void main() {}')).toThrow(
      /gl_PointSize = size;/,
    );
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
    expect(patched).toContain('attribute vec4 shift;');
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
    expect(patched).toContain(NOVA_VERTEX_MOTION);
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
      patched.indexOf(NOVA_VERTEX_MOTION),
    );
    expect(patched.indexOf(NOVA_VERTEX_MOTION)).toBeLessThan(
      patched.indexOf('#include <project_vertex>'),
    );
  });

  it('keeps the projection step that consumes the displaced vertex', () => {
    expect(patched).toContain('#include <project_vertex>');
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
    expect(patched).toContain('float d = length(gl_PointCoord.xy - 0.5);');
    expect(patched).toContain('vec4 diffuseColor = vec4( vColor, smoothstep(0.5, 0.1, d) );');
    expect(patched).not.toContain('vec4 diffuseColor = vec4( diffuse, opacity );');
  });

  it('declares the sprite falloff before the line that reads it', () => {
    expect(patched.indexOf('float d = length(gl_PointCoord.xy - 0.5);')).toBeLessThan(
      patched.indexOf('smoothstep(0.5, 0.1, d)'),
    );
  });

  /**
   * three r150+ emits `vec4 diffuseColor = ...` BEFORE
   * `#include <clipping_planes_fragment>`, the reverse of the r136 order
   * the original pen was written against. Declaring `d` at the
   * clipping-planes anchor would therefore be a use-before-declaration
   * error. If this ordering ever flips back, the comment in
   * nova-shader.ts needs revisiting — hence the explicit assertion.
   */
  it('assumes the modern chunk order that forced an inline declaration of d', () => {
    expect(patched.indexOf('vec4 diffuseColor = vec4( vColor')).toBeLessThan(
      patched.indexOf('#include <clipping_planes_fragment>'),
    );
  });

  it('loses no include directives', () => {
    const includesOf = (source: string) =>
      source.match(/#include <[^>]+>/g) ?? [];
    expect(includesOf(patched).sort()).toEqual(
      includesOf(ShaderChunk.points_frag).sort(),
    );
  });
});
