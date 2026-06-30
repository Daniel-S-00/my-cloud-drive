/**
 * Deterministic date formatting for SSR-safe rendering.
 *
 * `Date.prototype.toLocaleString()` depends on the runtime locale and
 * produces different strings on the server (typically 24-hour) and the
 * client (typically 12-hour with AM/PM), which triggers React hydration
 * mismatches. These helpers build the string manually from UTC
 * components so the output is identical on both sides.
 */

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function formatDateTime(value: Date | string | null): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return [
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
  ].join(' ');
}
