/**
 * Copy a string to the clipboard, returning whether it succeeded.
 * Used by the per-item "Copy name" / "Copy link" actions.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
