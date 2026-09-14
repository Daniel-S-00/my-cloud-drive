/**
 * The shader mistakes the suite can catch without a browser.
 *
 * GLSL is compiled by the graphics driver, so a shader that will not build
 * only ever fails in a browser — and both of the checks below are shapes that
 * shipped once and were only reported by the page's console. They are not a
 * compiler; they are the two mistakes that actually happened, cheap enough to
 * run over every shader the scene generates.
 */

/**
 * Vector constructors built only from numeric literals, so their count is the
 * whole story. `vec3(0.0, 0.0001)` is not a shorthand — GLSL wants a vector
 * filled, and only a broadcast from one scalar is allowed.
 */
export function malformedConstructors(source: string): string[] {
  const offenders: string[] = [];

  for (const call of source.matchAll(/vec([234])\(([^()]*)\)/g)) {
    const size = Number(call[1]);
    const args = call[2]
      .split(',')
      .map((arg) => arg.trim())
      .filter(Boolean);

    // Anything that is not a number may be a vector or a swizzle, and then
    // the arity cannot be counted from the source alone.
    if (!args.every((arg) => /^-?\d/.test(arg))) continue;

    // One scalar broadcasts to every component; anything else has to fill the
    // vector exactly.
    if (args.length !== 1 && args.length !== size) offenders.push(call[0]);
  }

  return offenders;
}

/**
 * A trailing comma in an argument list. Legal in an initialiser list, a
 * syntax error in a call, and invisible to everything but the driver.
 */
export function hasArgumentTrailingComma(source: string): boolean {
  return /,\s*\)/.test(source);
}
