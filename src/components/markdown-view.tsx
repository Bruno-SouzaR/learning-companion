import React, { useMemo } from 'react';
import { marked, type Tokens } from 'marked';
interface MarkdownViewProps {
  content: string;
  className?: string;
}
const headingRenderer = new marked.Renderer();
let inPontosNucleares = false;
let inPontosNuclearesList = false;

headingRenderer.heading = function ({ depth, text }) {
  inPontosNucleares = /pontos\s+nucleares/i.test(text);
  const cleanText = text.replace(/<[^>]+>/g, '').trim();
  const slug = cleanText
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `<h${depth} id="${slug}" class="heading-anchor scroll-mt-24 transition-all duration-500">${text}</h${depth}>\n`;
};

headingRenderer.list = function (token) {
  inPontosNuclearesList = inPontosNucleares;
  inPontosNucleares = false;

  let body = '';
  if (token.items && Array.isArray(token.items)) {
    for (const item of token.items) {
      body += this.listitem(item);
    }
  }

  const wasPN = inPontosNuclearesList;
  inPontosNuclearesList = false;

  if (wasPN) {
    return `<ul class="pontos-nucleares-list space-y-1.5 my-3 pl-1 list-none">\n${body}</ul>\n`;
  }
  return `<ul class="list-disc pl-5 my-2.5 space-y-1.5 text-slate-300">\n${body}</ul>\n`;
};

headingRenderer.listitem = function (item: Tokens.ListItem) {
  const content = this.parser.parseInline(item.tokens || []);
  if (inPontosNuclearesList) {
    return `<li class="ponto-nuclear-item cursor-pointer text-slate-200 hover:text-indigo-200 hover:bg-indigo-950/40 py-1.5 px-2 rounded-lg transition-all flex items-start gap-2.5 group" title="Clique para saltar a este conceito na leitura">
  <span class="text-indigo-400 mt-0.5 shrink-0 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all font-mono font-bold">↳</span>
  <span>${content}</span>
</li>\n`;
  }
  return `<li class="leading-relaxed">${content}</li>\n`;
};

/**
 * Configure marked renderer options for secure, well-structured output.
 */
marked.setOptions({
  gfm: true,
  breaks: true,
  renderer: headingRenderer,
});
/**
 * Renders Markdown strings with technical aesthetic, syntax-highlight-friendly
 * code styling, and native tables matching the dark OLED design system.
 */
export function MarkdownView({ content, className = '' }: MarkdownViewProps) {
  const html = useMemo(() => {
    if (!content || !content.trim()) return '';
    // Strip leading YAML frontmatter if present so raw frontmatter never renders as text
    const clean = content.replace(/^---[\s\S]*?---\s*/m, '').trim();
    try {
      return marked.parse(clean) as string;
    } catch (err) {
      console.error('Failed to parse markdown:', err);
      return `<p>${clean}</p>`;
    }
  }, [content]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest('.ponto-nuclear-item') as HTMLElement | null;
    if (!target) return;

    const list = target.closest('.pontos-nucleares-list');
    if (!list) return;

    const allItems = Array.from(list.querySelectorAll<HTMLElement>('.ponto-nuclear-item'));
    const bulletIdx = allItems.indexOf(target);
    const totalBullets = Math.max(1, allItems.length);
    const bulletText = target.innerText || target.textContent || '';

    // Find the enclosing section or container
    const container = target.closest('.prose') || target.closest('article') || document.body;

    // Find all concept headings appearing AFTER this list in document order
    const allHeadings = Array.from(container.querySelectorAll<HTMLElement>('.heading-anchor, h3'));
    const conceptHeadings = allHeadings.filter((h) => {
      if (list.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING) {
        const text = (h.innerText || h.textContent || '').toLowerCase();
        return !text.includes('pontos nucleares') && h.tagName.toLowerCase() === 'h3';
      }
      return false;
    });

    if (conceptHeadings.length === 0) return;

    const M = conceptHeadings.length;
    const N = totalBullets;

    // Monotonic sequential slice: each bullet i strictly owns a slice of concept headings
    const startJ = Math.floor((bulletIdx * M) / N);
    const endJ = Math.max(startJ + 1, Math.min(M, Math.ceil(((bulletIdx + 1) * M) / N)));
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
      }, 2500);
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`prose prose-invert max-w-none text-slate-300 text-xs sm:text-sm xl:text-[15px] leading-relaxed
        [&_h1]:text-xl sm:[&_h1]:text-2xl [&_h1]:font-extrabold [&_h1]:text-slate-100 [&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:tracking-tight
        [&_h2]:text-lg sm:[&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-slate-100 [&_h2]:mt-5 [&_h2]:mb-2.5 [&_h2]:tracking-tight
        [&_h3]:text-base sm:[&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-indigo-300 [&_h3]:mt-4 [&_h3]:mb-2
        [&_h4]:text-sm sm:[&_h4]:text-base [&_h4]:font-semibold [&_h4]:text-slate-200 [&_h4]:mt-3 [&_h4]:mb-1.5
        [&_p]:my-2.5 [&_p]:text-slate-300 [&_p]:leading-relaxed
        [&_ul]:my-2.5 [&_ul]:pl-5 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:text-slate-300
        [&_ol]:my-2.5 [&_ol]:pl-5 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:text-slate-300
        [&_li]:leading-relaxed
        [&_strong]:font-semibold [&_strong]:text-slate-100
        [&_blockquote]:pl-4 [&_blockquote]:border-l-2 [&_blockquote]:border-indigo-500 [&_blockquote]:italic [&_blockquote]:text-slate-400 [&_blockquote]:my-3
        [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-slate-900 [&_code]:text-indigo-300 [&_code]:border [&_code]:border-slate-800 [&_code]:font-mono [&_code]:text-[11px] sm:[&_code]:text-xs
        [&_pre]:p-4 [&_pre]:rounded-xl [&_pre]:bg-slate-950 [&_pre]:border [&_pre]:border-slate-800 [&_pre]:overflow-x-auto [&_pre]:my-3.5
        [&_pre_code]:p-0 [&_pre_code]:bg-transparent [&_pre_code]:border-0 [&_pre_code]:text-xs sm:[&_pre_code]:text-sm [&_pre_code]:text-slate-200
        [&_table]:w-full [&_table]:my-4 [&_table]:border-collapse [&_table]:text-xs sm:[&_table]:text-sm
        [&_th]:p-3 [&_th]:bg-slate-900 [&_th]:text-slate-200 [&_th]:font-semibold [&_th]:border [&_th]:border-slate-800 [&_th]:text-left
        [&_td]:p-3 [&_td]:bg-slate-950/60 [&_td]:text-slate-300 [&_td]:border [&_td]:border-slate-800/80
        [&_hr]:border-slate-800 [&_hr]:my-5
        ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
