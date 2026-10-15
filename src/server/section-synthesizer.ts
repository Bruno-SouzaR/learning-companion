import { callLlmMarkdown } from './llm';
import { sanitizePortugueseMarkdown, pruneDanglingMarkdownTail } from './markdown-sanitizer';
import { getStudiesModel, getStudiesBaseUrl } from './env';
export interface ParsedSection {
  sectionTitle: string;
  keyPoints: string[];
  markdown: string;
}

/**
 * Parse a section produced by the markdown-only synthesis format.
 * Extracts the section title from the first top-level heading, reads the
 * "Pontos Nucleares" bullet block, and keeps the rest as the body.
 */
export function parseSectionMarkdown(candidate: string): ParsedSection {
  let text = candidate.trim();

  // Strip possible code fences wrapping the whole answer
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:md|markdown)?\s*/i, '').replace(/\s*```$/i, '');
  }

  const lines = text.split('\n');
  const DEFAULT_TITLE = 'Seção sem título';
  let sectionTitle = DEFAULT_TITLE;
  let keyPoints: string[] = [];
  let body: string[] = [];
  let inKeyPoints = false;
  let sawBullet = false;

  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // A heading appearing while the default title is still set becomes the section title,
    // including after a stripped code fence.
    if (
      sectionTitle === DEFAULT_TITLE &&
      /^#{1,3}\s+/.test(trimmed) &&
      !normalize(trimmed.replace(/^#+\s*/, '')).includes('pontos nucleares')
    ) {
      sectionTitle = trimmed.replace(/^#{1,3}\s*/, '');
      continue;
    }

    // "Pontos Nucleares" block header
    if (/^#{1,3}\s+(?:[`]*)?(?:pontos?\s+(?:nucleares|clave|chave)|key\s*points|resumen\s*estructurado)/i.test(trimmed)) {
      inKeyPoints = true;
      continue;
    }

    if (inKeyPoints) {
      if (/^[-*]\s+/.test(trimmed) && trimmed.length <= 220) {
        keyPoints.push(trimmed.replace(/^[-*]\s+/, '').replace(/[`*_]/g, '').trim());
        sawBullet = true;
        continue;
      }
      if (/^#{1,3}\s+/.test(trimmed)) {
        inKeyPoints = false;
        body.push(line);
        continue;
      }
      if (trimmed.length === 0) {
        if (sawBullet) {
          continue;
        }
        inKeyPoints = false;
        continue;
      }
      inKeyPoints = false;
      body.push(line);
      continue;
    }

    body.push(line);
  }

  const markdown = body.join('\n').trim();
  const normalizedTitle = normalize(sectionTitle);
  const markdownWithoutHeading = markdown
    .replace(/^#+\s*.*$/m, '')
    .trim();

  // If the model duplicated the heading at the top of the body, drop the duplicate.
  const finalMarkdown =
    normalize(markdownWithoutHeading.split('\n')[0]).includes(normalizedTitle)
      ? markdownWithoutHeading.replace(/^[^\n]+\n/, '').trim()
      : markdown;

  return {
    sectionTitle,
    keyPoints,
    markdown: finalMarkdown,
  };
}

export const SECTION_STANDARDS_PROMPT = `You are an academic professor and author of high-level textbook chapters in Computer Science and Software Engineering.
Your goal is to synthesize study materials into deep, structured, highly pedagogical Markdown strictly in Brazilian Portuguese (PT-BR) with EXHAUSTIVE depth and ZERO omissions.

CORE RULES:
1. NO META-COMMENTARY: never write "o autor lista", "o documento enumera", "inventário técnico" or any process description.
2. BRAZILIAN PORTUGUESE (PT-BR): Write all content, headings, and explanations strictly in Brazilian Portuguese (use "Definição Teórica", "Mecanismo & Aplicação Prática", "Exemplo Prático" or "Nota de Código", "Vantagens" and "Desvantagens").
3. MANDATORY STRUCTURE:
   - Start with a descriptive heading (# Título Específico da Seção naming the primary technology, algorithm, or mechanism).
   - Follow with: ### Pontos Nucleares (5-8 physical bullets "-" with key concepts).
   - Then create a subsection for EVERY technical concept in the text:
     ### [Nome do Conceito]
     - **Definição Teórica:** exact, concise explanation
     - **Mecanismo & Aplicação Prática:** internal engineering mechanics and operational flow
     - **Exemplo Prático** or **Nota de Código:** concrete scenario with commands/code if applicable
   - If comparing mechanisms, include a markdown table "| Mecanismo | Vantagens | Desvantagens |".
4. CODE BLOCKS: Close all code blocks cleanly with three backticks.
5. EXHAUSTIVE COMPLETENESS: Never merge, group, or skip technical concepts listed by the source. Explain all of them thoroughly.
6. IGNORE TEXTBOOK QUIZZES: Do not include or synthesize multiple-choice test questions, self-assessments, exercises, or bibliographies.
7. MATHEMATICAL FORMULAS & NUMERICAL CALCULATIONS:
   When the source material contains explicit formulas, performance equations, or architectural capacity limits (e.g. disk latency calculations, block addressing, pointer calculations), preserve and render them explicitly using LaTeX ($...$ or $$...$$). Do not reduce mathematical models to purely qualitative text.`;
/**
 * Synthesize one section of a study document as pure Markdown, extending
 * automatically via continuation when the model hits the token cap.
 */
export async function synthesizeSection(params: {
  title: string;
  topic: string;
  sectionIndex: number;
  totalSections: number;
  chunkContent: string;
}): Promise<ParsedSection> {
  const rawMarkdown = await callLlmMarkdown({
    messages: [
      {
        role: 'system',
        content: `${SECTION_STANDARDS_PROMPT}\nTarget Document: "${params.title}" (Topic: ${params.topic}). Processing Section ${
          params.sectionIndex
        } of ${params.totalSections}. Output all content strictly in Brazilian Portuguese (PT-BR).`,
      },
      { role: 'user', content: params.chunkContent },
    ],
    maxTokens: 2500,
    maxContinuations: 2,
    model: getStudiesModel(),
    baseUrl: getStudiesBaseUrl(),
  });

  const pruned = pruneDanglingMarkdownTail(rawMarkdown);
  const sanitized = sanitizePortugueseMarkdown(pruned);
  const parsed = parseSectionMarkdown(sanitized);
  parsed.markdown = sanitizePortugueseMarkdown(parsed.markdown);
  parsed.keyPoints = parsed.keyPoints.map(sanitizePortugueseMarkdown);
  const cleanTitle = (parsed.sectionTitle || '').trim();
  const isGeneric =
    !cleanTitle ||
    cleanTitle.startsWith('Seção sem') ||
    cleanTitle.startsWith('Sección sin') ||
    cleanTitle.toLowerCase() === params.title.toLowerCase();

  if (isGeneric) {
    // Pick the first substantive ### heading if available
    const firstSubhead = parsed.markdown.match(/^###\s+([^\n]+)/m)?.[1]?.trim();
    parsed.sectionTitle = firstSubhead
      ? sanitizePortugueseMarkdown(firstSubhead)
      : `Seção ${params.sectionIndex}`;
  } else {
    parsed.sectionTitle = sanitizePortugueseMarkdown(cleanTitle);
  }
  return parsed;
}