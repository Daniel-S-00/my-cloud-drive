/**
 * Maps the app's design tokens onto the particle scene's colour ramp.
 *
 * Tokens are read from the live CSS custom properties rather than
 * hardcoded, so the scene follows the theme instead of drifting from it.
 *
 * Output is LINEAR-light RGB. three's points shader ends in
 * `#include <colorspace_fragment>`, which converts linear -> sRGB on
 * output, and `ColorManagement.enabled` is true by default. Passing the
 * raw sRGB channels through would render noticeably washed out.
 */

export type Rgb = readonly [number, number, number];

export type NovaPalette = {
  /** Nebula core, at normalised distance ~0. */
  core: Rgb;
  /** Mid falloff, at normalised distance ~0.45. */
  mid: Rgb;
  /** Dissolving rim, at normalised distance 1. */
  deep: Rgb;
};

export const NOVA_TOKEN_KEYS = {
  core: '--color-accent-glow',
  mid: '--color-accent-primary',
  deep: '--color-border-subtle',
} as const;

/** sRGB byte values, mirroring the `@theme` block in globals.css. */
export const NOVA_PALETTE_FALLBACK: NovaPalette = {
  core: [110, 175, 230],
  mid: [67, 136, 221],
  deep: [29, 44, 82],
};

export function parseCssRgb(value: string): Rgb | null {
  const text = value.trim();
  if (text.length === 0) return null;

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
  if (hex) {
    const digits = hex[1];
    const full =
      digits.length === 3
        ? digits.replace(/./g, (digit) => digit + digit)
        : digits;
    return [
      Number.parseInt(full.slice(0, 2), 16),
      Number.parseInt(full.slice(2, 4), 16),
      Number.parseInt(full.slice(4, 6), 16),
    ];
  }

  const functional = /^rgba?\(([^)]*)\)$/i.exec(text);
  if (!functional) return null;

  // Handles `rgb(67 136 221)`, `rgb(67, 136, 221)` and an optional
  // `/ alpha` suffix, which is simply ignored.
  const parts = functional[1]
    .replace('/', ' ')
    .split(/[\s,]+/)
    .filter((part) => part.length > 0);
  if (parts.length < 3) return null;

  const channels: number[] = [];
  for (const part of parts.slice(0, 3)) {
    const channel = Number.parseFloat(part);
    if (!Number.isFinite(channel)) return null;
    channels.push(Math.min(255, Math.max(0, channel)));
  }
  return [channels[0], channels[1], channels[2]];
}

export function srgbToLinear(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4);
}

function toLinear(rgb: Rgb): Rgb {
  return [
    srgbToLinear(rgb[0] / 255),
    srgbToLinear(rgb[1] / 255),
    srgbToLinear(rgb[2] / 255),
  ];
}

const LINEAR_FALLBACK: NovaPalette = {
  core: toLinear(NOVA_PALETTE_FALLBACK.core),
  mid: toLinear(NOVA_PALETTE_FALLBACK.mid),
  deep: toLinear(NOVA_PALETTE_FALLBACK.deep),
};

export function resolveNovaPalette(
  root: HTMLElement | null,
  readStyle: (element: Element) => CSSStyleDeclaration = (element) =>
    window.getComputedStyle(element),
): NovaPalette {
  if (!root) return LINEAR_FALLBACK;

  let style: CSSStyleDeclaration;
  try {
    style = readStyle(root);
  } catch {
    return LINEAR_FALLBACK;
  }

  const read = (key: string, fallback: Rgb): Rgb => {
    const parsed = parseCssRgb(style.getPropertyValue(key));
    return toLinear(parsed ?? fallback);
  };

  return {
    core: read(NOVA_TOKEN_KEYS.core, NOVA_PALETTE_FALLBACK.core),
    mid: read(NOVA_TOKEN_KEYS.mid, NOVA_PALETTE_FALLBACK.mid),
    deep: read(NOVA_TOKEN_KEYS.deep, NOVA_PALETTE_FALLBACK.deep),
  };
}
