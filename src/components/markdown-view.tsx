import React, { useMemo } from 'react';
import { marked } from 'marked';

interface MarkdownViewProps {
  content: string;
  className?: string;
}

/**
 * Configure marked renderer options for secure, well-structured output.
 */
marked.setOptions({
  gfm: true,
  breaks: true,
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

  return (
    <div
      className={`prose prose-invert max-w-none text-slate-200 text-xs sm:text-sm leading-relaxed
        [&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-slate-100 [&_h1]:mt-4 [&_h1]:mb-2
        [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-slate-100 [&_h2]:mt-4 [&_h2]:mb-2
        [&_h3]:text-sm [&_h3]:font-bold [&_h3]:text-indigo-300 [&_h3]:mt-3 [&_h3]:mb-1.5
        [&_h4]:text-xs [&_h4]:font-semibold [&_h4]:text-slate-200 [&_h4]:mt-2 [&_h4]:mb-1
        [&_p]:my-2 [&_p]:text-slate-300 [&_p]:leading-relaxed
        [&_ul]:my-2 [&_ul]:pl-5 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:text-slate-300
        [&_ol]:my-2 [&_ol]:pl-5 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:text-slate-300
        [&_li]:leading-relaxed
        [&_strong]:font-semibold [&_strong]:text-slate-100
        [&_blockquote]:pl-3.5 [&_blockquote]:border-l-2 [&_blockquote]:border-indigo-500 [&_blockquote]:italic [&_blockquote]:text-slate-400 [&_blockquote]:my-2.5
        [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-slate-900 [&_code]:text-indigo-300 [&_code]:border [&_code]:border-slate-800 [&_code]:font-mono [&_code]:text-[11px]
        [&_pre]:p-3.5 [&_pre]:rounded-lg [&_pre]:bg-slate-950 [&_pre]:border [&_pre]:border-slate-800 [&_pre]:overflow-x-auto [&_pre]:my-3
        [&_pre_code]:p-0 [&_pre_code]:bg-transparent [&_pre_code]:border-0 [&_pre_code]:text-xs [&_pre_code]:text-slate-200
        [&_table]:w-full [&_table]:my-3 [&_table]:border-collapse [&_table]:text-xs
        [&_th]:p-2.5 [&_th]:bg-slate-900 [&_th]:text-slate-200 [&_th]:font-semibold [&_th]:border [&_th]:border-slate-800 [&_th]:text-left
        [&_td]:p-2.5 [&_td]:bg-slate-950/60 [&_td]:text-slate-300 [&_td]:border [&_td]:border-slate-800/80
        [&_hr]:border-slate-800 [&_hr]:my-4
        ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
