/**
 * Landmark Navigation Utility
 *
 * Provides monotonic sequential block-slicing navigation from "Pontos Nucleares" bullets
 * directly to the corresponding concept headings (H3) within study materials.
 */

export interface JumpToConceptOptions {
  container: HTMLElement;
  bulletText: string;
  bulletIndex: number;
  totalBullets: number;
  highlightDurationMs?: number;
}

/**
 * Smoothly jumps to the concept heading corresponding to a bullet item
 * using monotonic sequential block slicing, centered viewport positioning,
 * and a temporary glowing highlight ring.
 */
export function jumpToConceptHeading(options: JumpToConceptOptions): boolean {
  const {
    container,
    bulletText,
    bulletIndex,
    totalBullets,
    highlightDurationMs = 2500,
  } = options;

  // Select substantive concept headings (exclude section titles and "Pontos Nucleares")
  const allH3s = Array.from(container.querySelectorAll<HTMLElement>('.heading-anchor, h3'));
  const conceptHeadings = allH3s.filter((h) => {
    const text = (h.innerText || h.textContent || '').toLowerCase();
    return !text.includes('pontos nucleares') && h.tagName.toLowerCase() === 'h3';
  });

  if (conceptHeadings.length === 0) return false;

  const M = conceptHeadings.length;
  const N = Math.max(1, totalBullets);

  // Monotonic sequential slice: each bullet i strictly owns a slice of concept headings in sequence
  const startJ = Math.floor((bulletIndex * M) / N);
  const endJ = Math.max(startJ + 1, Math.min(M, Math.ceil(((bulletIndex + 1) * M) / N)));
  const slice = conceptHeadings.slice(startJ, endJ);

  const cleanPt = (s: string) =>
    s
      .toLowerCase()
      .replace(/[ç]/g, 'c')
      .replace(/[ãáàâ]/g, 'a')
      .replace(/[éê]/g, 'e')
      .replace(/[íî]/g, 'i')
      .replace(/[óõô]/g, 'o')
      .replace(/[úû]/g, 'u')
      .replace(/[^a-z0-9\s]/g, ' ');

  const normBullet = cleanPt(bulletText);
  let bestHeading = slice[0] || conceptHeadings[startJ] || conceptHeadings[0];
  let bestScore = 0;

  for (const h of slice) {
    const normH = cleanPt(h.innerText || h.textContent || '');
    const words = normH.split(/\s+/).filter((w) => w.length >= 4);
    const matchCount = words.filter((w) => normBullet.includes(w)).length;

    if (matchCount > bestScore) {
      bestScore = matchCount;
      bestHeading = h;
    }
  }

  if (bestHeading) {
    bestHeading.scrollIntoView({ behavior: 'smooth', block: 'center' });
    bestHeading.classList.add(
      'ring-2',
      'ring-indigo-400',
      'bg-indigo-950/60',
      'px-2.5',
      'py-1.5',
      'rounded-lg',
      'shadow-lg',
      'shadow-indigo-950/50'
    );
    setTimeout(() => {
      bestHeading?.classList.remove(
        'ring-2',
        'ring-indigo-400',
        'bg-indigo-950/60',
        'px-2.5',
        'py-1.5',
        'rounded-lg',
        'shadow-lg',
        'shadow-indigo-950/50'
      );
    }, highlightDurationMs);
    return true;
  }

  return false;
}
