import { callLlmMarkdown } from './llm';
import { getStudiesModel, getStudiesBaseUrl } from './env';

export interface ParsedSection {
  sectionTitle: string;
  keyPoints: string[];
  markdown: string;
}

export interface SynthesizedSection {
  sectionIndex: number;
  sectionTitle: string;
  keyPoints: string[];
  markdown: string;
}

export interface SynthesizeSectionParams {
  title: string;
  topic: string;
  sectionIndex: number;
  totalSections: number;
  chunkContent: string;
}

/**
 * Defensive utility to sanitize study Markdown content,
 * replacing residual Spanish terms with correct Brazilian Portuguese (PT-BR) terms.
 */
export function sanitizePortugueseMarkdown(text: string): string {
  if (!text || typeof text !== 'string') return '';

  return text
    // Section headers and structural concepts
    .replace(/\bDefinici[oó]n\s+Te[oó]rica\b/gi, 'Definição Teórica')
    .replace(/\bMecanismo\s*(?:&|y|e)\s*Aplicaci[oó]n\s+Pr[aá]ctica\b/gi, 'Mecanismo & Aplicação Prática')
    .replace(/\bMecanismo\s*(?:&|y|e)\s*Aplica[cç][aã]o\s+Pr[aá]tica\b/gi, 'Mecanismo & Aplicação Prática')
    .replace(/\bEjemplo\s+Pr[aá]ctico\b/gi, 'Exemplo Prático')
    .replace(/\bEjemplo\b/gi, 'Exemplo')
    .replace(/\bejemplo\b/g, 'exemplo')
    .replace(/\bejemplos\b/g, 'exemplos')
    .replace(/\bEjemplos\b/g, 'Exemplos')
    .replace(/\bVentajas\b/gi, 'Vantagens')
    .replace(/\bventajas\b/g, 'vantagens')
    .replace(/\bDesventajas\b/gi, 'Desvantagens')
    .replace(/\bdesventajas\b/g, 'desvantagens')
    .replace(/\bSecci[oó]n\b/gi, 'Seção')
    .replace(/\bsecci[oó]n\b/g, 'seção')
    .replace(/\bsecciones\b/g, 'seções')
    .replace(/\bSecciones\b/g, 'Seções')
    .replace(/\bPontos\s+Clave\b/gi, 'Pontos Nucleares')
    .replace(/\bResumen\s+Estructurado\b/gi, 'Resumo Estruturado')
    // Defensively strip leaked bibliography and Explore+ subtopics
    .replace(
      /\n#{1,4}\s*(?:Refer[êe]ncias\s+Bibliogr[áa]ficas|Bibliografia|Explore\+|Saiba\s+Mais|Fontes)[\s\S]*?(?=\n#{1,3}\s|\n\s*---\s*\n|$)/gi,
      ''
    )
    // Defensively strip leaked textbook assessment questions, answer choices, and gabaritos
    .replace(
      /\n#{1,4}\s*(?:Verificando\s+o\s+Aprendizado|Verifica[cç][aã]o\s+de\s+Aprendizado|Atividades?\s+de\s+Autoavalia[cç][aã]o|Autoavalia[cç][aã]o|Exerc[íi]cios?\s+Propostos?|Gabarito(?:\s+Final|\s+Comentado)?)[\s\S]*?(?=\n#{1,2}\s|\n\s*---\s*\n|$)/gi,
      ''
    );
}

/**
 * Safely closes unclosed code fences and trims empty trailing bullet markers
 * without deleting real text lines.
 */
export function pruneDanglingMarkdownTail(markdown: string): string {
  if (!markdown || typeof markdown !== 'string') return '';
  let text = markdown.trim();

  // 1. Close unclosed code fences
  const codeFenceMatches = text.match(/```/g);
  if (codeFenceMatches && codeFenceMatches.length % 2 !== 0) {
    text = `${text}\n\`\`\``;
  }

  // 2. Remove dangling empty bullets or headers at the very end of the text
  const trailingDanglingRegex =
    /(?:\n\s*[-*]\s+\*\*[^*]+\*\*:\s*|\n\s*[-*]\s+\*\*[A-Za-z0-9_]*\s*|\n\s*#{1,4}\s+[^\n]*|\n\s*[-*]\s*)$/i;
  while (trailingDanglingRegex.test(text)) {
    text = text.replace(trailingDanglingRegex, '').trim();
  }

  return text;
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
  const keyPoints: string[] = [];
  const body: string[] = [];
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
    if (
      /^#{1,3}\s+(?:[`]*)?(?:pontos?\s+(?:nucleares|clave|chave)|key\s*points|resumen\s*estructurado)/i.test(
        trimmed
      )
    ) {
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
  const markdownWithoutHeading = markdown.replace(/^#+\s*.*$/m, '').trim();

  // If the model duplicated the heading at the top of the body, drop the duplicate.
  const finalMarkdown = normalize(markdownWithoutHeading.split('\n')[0]).includes(normalizedTitle)
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
 * Deep module that transforms raw study textbook chunks into pedagogical,
 * deeply structured Markdown in Brazilian Portuguese (PT-BR).
 * Encapsulates prompt engineering, model transport, non-destructive tail closure,
 * Portuguese language sanitization, and structured concept extraction behind a single interface.
 */
export async function synthesizeStudySection(params: SynthesizeSectionParams): Promise<SynthesizedSection> {
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

  // Keep body markdown clean (stripped of duplicate section title and duplicate Pontos Nucleares)
  const cleanMarkdown = sanitizePortugueseMarkdown(parsed.markdown);
  const cleanKeyPoints = parsed.keyPoints.map(sanitizePortugueseMarkdown);

  const cleanTitle = (parsed.sectionTitle || '').trim();
  const isGeneric =
    !cleanTitle ||
    cleanTitle.startsWith('Seção sem') ||
    cleanTitle.startsWith('Sección sin') ||
    cleanTitle.toLowerCase() === params.title.toLowerCase();

  let resolvedTitle: string;
  if (isGeneric) {
    const firstSubhead = cleanMarkdown.match(/^###\s+([^\n]+)/m)?.[1]?.trim();
    resolvedTitle = firstSubhead
      ? sanitizePortugueseMarkdown(firstSubhead)
      : `Seção ${params.sectionIndex}`;
  } else {
    resolvedTitle = sanitizePortugueseMarkdown(cleanTitle);
  }

  return {
    sectionIndex: params.sectionIndex,
    sectionTitle: resolvedTitle,
    keyPoints: cleanKeyPoints,
    markdown: cleanMarkdown,
  };
}

/**
 * Backward compatibility alias for synthesizeStudySection.
 */
export const synthesizeSection = synthesizeStudySection;
