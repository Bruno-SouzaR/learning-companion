import { callLlmMarkdown } from './llm';
import { sanitizePortugueseMarkdown } from './markdown-sanitizer';
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
Your mission is to synthesize study materials into deep, structured, highly pedagogical Markdown in Brazilian Portuguese (PT-BR) with EXHAUSTIVE depth and ZERO omissions.

RULES & CONSTRAINTS:
1. NO META-COMMENTARY: never write "o autor lista", "o documento enumera", "inventário técnico" or any process description.
2. STRICT BRAZILIAN PORTUGUESE (PT-BR): Write all content, headings, explanations, and tables strictly in Brazilian Portuguese.
   NEVER leak Spanish terms or cognates. Specifically:
   - Use "Definição Teórica" (NEVER "Definición Teórica").
   - Use "Mecanismo & Aplicação Prática" (NEVER "Mecanismo & Aplicación Práctica").
   - Use "Exemplo Prático" or "Nota de Código" (NEVER "Ejemplo Práctico").
   - Use "Vantagens" and "Desvantagens" in tables (NEVER "Ventajas" or "Desventajas").
   - Use "Seção" (NEVER "Sección").
3. STRUCTURE (mandatory skeleton; create as many subtopic sections "### Subtema" as the source requires):
   - Start with a heading: # Título da Seção
   - Then a list block titled exactly: ### Pontos Nucleares
     containing physical bullets "-" with the 5 to 8 most important concepts
   - Then subtopic blocks for EVERY distinct concept/item from the source:
     ### [Nome do Conceito]
     - **Definição Teórica:** exact, concise, no filler
     - **Mecanismo & Aplicação Prática:** how it works internally
     - **Exemplo Prático** or **Nota de Código:** a concrete engineering scenario, with a closed code block ONLY if the source uses code
     - Separation between items using blank lines
   - If the source compares mechanisms, include a markdown table "| Mecanismo | Vantagens | Desvantagens |".
4. CODE BLOCKS MUST always be closed with three backticks; never inline backticks colocated with text.
5. NEVER merge, group, or skip technical engineering concepts listed by the source. Expand ALL of them.
6. IGNORE TEXTBOOK EVALUATIONS, QUIZZES & BIBLIOGRAPHY:
   NEVER synthesize or include textbook multiple-choice questions, self-assessment boxes, exercises, or answer keys.
   Explicitly OMIT and SKIP sections titled:
   - "Verificando o Aprendizado" / "Verificação de Aprendizado"
   - "Atividades de Autoavaliação" / "Autoavaliação"
   - "Exercícios Propostos" / "Questões do Livro"
   - "Gabarito" / "Gabarito Comentado" / "Alternativas A, B, C, D"
   - "Referências Bibliográficas" / "Bibliografia" / "Explore+" / "Saiba Mais" / "Fontes"
   Do NOT create subtopics, definitions, or analyses for textbook test questions.
   Focus EXCLUSIVELY on core technical theory, architecture, engineering mechanisms, and real commands.
7. STRICT TITLE RULE (NO GENERIC HEADINGS):
   NEVER create generic titles like "Sistema de Arquivos", "Introdução", "Conceitos Fundamentais", "Resumo", "Visão Geral", "Pontos Principais", "Análise Técnica" or "Seção X".
   The main section heading (#) and all subheadings (###) MUST explicitly state the specific technology, data structure, algorithm, Linux command, or architectural mechanism discussed in the chunk (e.g. "# Alocação por I-nodes e Ponteiros Indiretos no ext2", "# Gerenciamento de Espaço Livre e Mapas de Bits", "# Políticas de Cache e Journaling").`;

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
        content: `${SECTION_STANDARDS_PROMPT}\nDocumento: "${params.title}" (Tema: ${params.topic}). Processando ${
          params.sectionIndex
        } de ${params.totalSections}.`,
      },
      { role: 'user', content: params.chunkContent },
    ],
    temperature: 0.7,
    topP: 0.8,
    topK: 20,
    presencePenalty: 1.5,
    repeatPenalty: 1.0,
    maxTokens: 1800,
    maxContinuations: 1,
  });

  const parsed = parseSectionMarkdown(rawMarkdown);
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