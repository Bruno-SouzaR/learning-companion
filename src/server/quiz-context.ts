/**
 * Extract a dense, compact outline of section titles and key points
 * from the full markdown text. Reduces context size by ~90% so the
 * question generator LLM call evaluates in < 10 seconds.
 */
export function extractQuizContextSkeleton(fullMarkdown: string, maxChars = 8000): string {
  if (!fullMarkdown || !fullMarkdown.trim()) return '';

  const lines = fullMarkdown.split('\n');
  const skeletonLines: string[] = [];
  let inNuclearPoints = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Preserve top-level and section headings
    if (/^#{1,3}\s+/.test(trimmed)) {
      skeletonLines.push(trimmed);
      inNuclearPoints = /pontos\s+nucleares/i.test(trimmed);
      continue;
    }

    // Preserve key point bullets
    if (inNuclearPoints && /^[-*]\s+/.test(trimmed)) {
      skeletonLines.push(trimmed);
      continue;
    }

    // Preserve definition bullets
    if (/^-\s+\*\*(?:definição|mecanismo|conceito)/i.test(trimmed)) {
      skeletonLines.push(trimmed);
      continue;
    }

    // Stop collecting points on empty line if we were in nuclear points
    if (inNuclearPoints && trimmed.length === 0) {
      inNuclearPoints = false;
    }
  }

  const result = skeletonLines.join('\n').trim();
  if (result.length > maxChars) {
    return result.slice(0, maxChars) + '\n[...outline truncated for token economy...]';
  }

  return result || fullMarkdown.slice(0, maxChars);
}
