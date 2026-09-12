// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  NOVA_PALETTE_FALLBACK,
  NOVA_TOKEN_KEYS,
  parseCssRgb,
  resolveNovaPalette,
  srgbToLinear,
} from './nova-palette';

function styleWith(tokens: Record<string, string>): CSSStyleDeclaration {
  return {
    getPropertyValue: (key: string) => tokens[key] ?? '',
  } as CSSStyleDeclaration;
}

const fallbackLinear = {
  core: [srgbToLinear(110 / 255), srgbToLinear(175 / 255), srgbToLinear(230 / 255)],
  mid: [srgbToLinear(67 / 255), srgbToLinear(136 / 255), srgbToLinear(221 / 255)],
  deep: [srgbToLinear(29 / 255), srgbToLinear(44 / 255), srgbToLinear(82 / 255)],
};

describe('parseCssRgb', () => {
  it('parses the space-separated rgb() form used by the tokens', () => {
    expect(parseCssRgb('rgb(67 136 221)')).toEqual([67, 136, 221]);
  });

  it('parses the legacy comma-separated form', () => {
    expect(parseCssRgb('rgb(67, 136, 221)')).toEqual([67, 136, 221]);
    expect(parseCssRgb('rgba(67, 136, 221, 0.5)')).toEqual([67, 136, 221]);
  });

  it('ignores a slash alpha channel', () => {
    expect(parseCssRgb('rgb(67 136 221 / 0.5)')).toEqual([67, 136, 221]);
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseCssRgb('  rgb(4 8 16)  ')).toEqual([4, 8, 16]);
  });

  it('parses hex notation', () => {
    expect(parseCssRgb('#4388dd')).toEqual([67, 136, 221]);
    expect(parseCssRgb('#abc')).toEqual([170, 187, 204]);
  });

  it('clamps out-of-range channels', () => {
    expect(parseCssRgb('rgb(300 -5 20)')).toEqual([255, 0, 20]);
  });

  it('returns null for values it cannot parse', () => {
    expect(parseCssRgb('')).toBeNull();
    expect(parseCssRgb('   ')).toBeNull();
    expect(parseCssRgb('red')).toBeNull();
    expect(parseCssRgb('rgb(1 2)')).toBeNull();
    expect(parseCssRgb('rgb(a b c)')).toBeNull();
    expect(parseCssRgb('#12345')).toBeNull();
    expect(parseCssRgb('rgb(1 2 nope)')).toBeNull();
  });
});

describe('srgbToLinear', () => {
  it('maps the endpoints unchanged', () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(1)).toBe(1);
  });

  it('uses the linear segment below the sRGB knee', () => {
    expect(srgbToLinear(0.04)).toBeCloseTo(0.04 / 12.92, 8);
  });

  it('uses the power curve above the knee', () => {
    // 0.5 sRGB is ~0.2140 in linear-light.
    expect(srgbToLinear(0.5)).toBeCloseTo(0.2140, 4);
    expect(srgbToLinear(67 / 255)).toBeCloseTo(0.0561, 3);
  });
});

describe('resolveNovaPalette', () => {
  it('reads the design tokens and converts them to linear light', () => {
    const palette = resolveNovaPalette(
      {} as HTMLElement,
      () =>
        styleWith({
          [NOVA_TOKEN_KEYS.core]: 'rgb(110 175 230)',
          [NOVA_TOKEN_KEYS.mid]: 'rgb(67 136 221)',
          [NOVA_TOKEN_KEYS.deep]: 'rgb(29 44 82)',
        }),
    );

    expect(palette.core).toEqual(fallbackLinear.core);
    expect(palette.mid).toEqual(fallbackLinear.mid);
    expect(palette.deep).toEqual(fallbackLinear.deep);
  });

  it('honours tokens that differ from the defaults', () => {
    const palette = resolveNovaPalette(
      {} as HTMLElement,
      () => styleWith({ [NOVA_TOKEN_KEYS.core]: 'rgb(255 255 255)' }),
    );

    expect(palette.core).toEqual([1, 1, 1]);
    expect(palette.mid).toEqual(fallbackLinear.mid);
  });

  it('falls back per-token when a token is missing or unparseable', () => {
    const palette = resolveNovaPalette(
      {} as HTMLElement,
      () =>
        styleWith({
          [NOVA_TOKEN_KEYS.core]: 'not-a-colour',
          [NOVA_TOKEN_KEYS.mid]: '',
        }),
    );

    expect(palette.core).toEqual(fallbackLinear.core);
    expect(palette.mid).toEqual(fallbackLinear.mid);
    expect(palette.deep).toEqual(fallbackLinear.deep);
  });

  it('returns the linear fallback when there is no root element', () => {
    expect(resolveNovaPalette(null)).toEqual(fallbackLinear);
  });

  it('returns the linear fallback when reading the style throws', () => {
    const palette = resolveNovaPalette({} as HTMLElement, () => {
      throw new Error('detached');
    });

    expect(palette).toEqual(fallbackLinear);
  });
});

describe('NOVA_PALETTE_FALLBACK', () => {
  it('mirrors the tokens declared in globals.css', () => {
    expect(NOVA_PALETTE_FALLBACK).toEqual({
      core: [110, 175, 230],
      mid: [67, 136, 221],
      deep: [29, 44, 82],
    });
  });
});
