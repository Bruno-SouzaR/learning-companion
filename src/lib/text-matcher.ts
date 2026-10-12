/**
 * Evaluate if a user's active recall attempt matches the target English sentence.
 * Strips leading/trailing whitespace, punctuation, normalizes multiple spaces, and ignores case.
 */
export function isExactMatch(target: string, typed: string): boolean {
  if (!typed || !target) {
    return false;
  }

  const cleanTarget = target.trim().toLowerCase().replace(/[.,!?;:"]/g, '').replace(/\s+/g, ' ');
  const cleanTyped = typed.trim().toLowerCase().replace(/[.,!?;:"]/g, '').replace(/\s+/g, ' ');

  return cleanTarget.length > 0 && cleanTarget === cleanTyped;
}
