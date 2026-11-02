import { z } from 'zod';
import { callLlmMarkdown, callLlmJson } from './llm';
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
/**
 * Automatically repairs broken or malformed Markdown tables:
 * 1. Restores missing table headers when an orphaned separator row appears (e.g. ------|----------|---|).
 * 2. Converts tab or multi-space separated pseudo-tables (e.g. Mechanism  Pros  Cons) into valid GFM pipe tables.
 * 3. Guarantees valid syntax so CommonMark / Marked always renders clean HTML tables.
 */
export function repairMalformedMarkdownTables(text: string): string {
  if (!text || typeof text !== 'string') return '';
  const lines = text.split('\n');
  const repaired: string[] = [];
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check if line is an orphaned table separator: e.g. ------|----------|---|
    const isSep = /^\s*[-]{2,}\s*\|\s*[-| ]+$/.test(trimmed);
    if (isSep) {
      let hasValidHeader = false;
      if (repaired.length > 0) {
        const prev = repaired[repaired.length - 1].trim();
        if (prev.startsWith('|') && prev.endsWith('|') && !/^\s*[-]{2,}\s*\|\s*[-| ]+$/.test(prev)) {
          hasValidHeader = true;
        }
      }

      if (!hasValidHeader) {
        // Inspect row below to determine column count
        let numCols = 3;
        if (i + 1 < lines.length && lines[i + 1].trim().startsWith('|')) {
          const belowParts = lines[i + 1]
            .trim()
            .split('|')
            .slice(1, -1)
            .map((p) => p.trim());
          if (belowParts.length > 0) {
            numCols = belowParts.length;
          }
        }

        const defaultHeaders = ['Aspecto', 'Característica A', 'Característica B', 'Observações', 'Cenário Ideal'];
        const headerCols = Array.from({ length: numCols }, (_, k) =>
          k < defaultHeaders.length ? defaultHeaders[k] : `Coluna ${k + 1}`
        );
        repaired.push(`| ${headerCols.join(' | ')} |`);
        repaired.push(`| ${Array.from({ length: numCols }, () => '---').join(' | ')} |`);
        inTable = true;
        continue;
      }
    }

    // Check for multi-space or tab separated pseudo-tables (lines with 3+ columns without pipes)
    if (
      !trimmed.startsWith('|') &&
      !trimmed.startsWith('#') &&
      !trimmed.startsWith('```') &&
      !trimmed.startsWith('-') &&
      !trimmed.startsWith('*') &&
      !trimmed.startsWith('>') &&
      trimmed.length > 0
    ) {
      const parts = trimmed.split(/\t+|\s{3,}/).map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 3) {
        // Look ahead to see if the table continues
        let isTableContext = inTable;
        if (i + 1 < lines.length) {
          const nextTrimmed = lines[i + 1].trim();
          const nextParts = nextTrimmed.split(/\t+|\s{3,}/).map((p) => p.trim()).filter(Boolean);
          if (nextParts.length >= 2 || /^\s*[-]{2,}\s*\|\s*[-| ]+$/.test(nextTrimmed)) {
            isTableContext = true;
          }
        }

        if (isTableContext) {
          const formattedRow = `| ${parts.join(' | ')} |`;
          repaired.push(formattedRow);
          if (!inTable) {
            const sep = `| ${parts.map(() => '---').join(' | ')} |`;
            repaired.push(sep);
            inTable = true;
          }
          continue;
        }
      } else {
        inTable = false;
      }
    } else if (trimmed.length === 0) {
      inTable = false;
    }

    repaired.push(line);
  }

  return repaired.join('\n');
}

export function sanitizePortugueseMarkdown(text: string): string {
  if (!text || typeof text !== 'string') return '';

  const cleaned = text
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
    // Repair joined topic labels and stutters caused by continuation seams
    .replace(/[-*]\s+\*\*[A-Za-zÀ-ÿ]{1,6}-\s*\*\*/g, '- **')
    .replace(/(\bDefinição Teórica)\s*-\s*\*\*(Mecanismo & Aplicação Prática)/g, '$1:**\n- **$2')
    .replace(/(\*\*(?:Definição Teórica|Mecanismo & Aplicação Prática|Exemplo Prático)\*\*):?\s*-\s*\*\*/g, '$1:\n- **')
    // Defensively strip leaked bibliography and Explore+ subtopics (with or without numbers)
    .replace(
      /\n#{1,4}\s*(?:\d+\.\s*)?(?:Refer[êe]ncias\s+Bibliogr[áa]ficas|Bibliografia|Explore\+|Saiba\s+Mais|Fontes)[\s\S]*?(?=\n#{1,2}\s|\n\s*---\s*\n|$)/gi,
      ''
    )
    // Defensively strip author signatures, curriculum lattes, or contadorista lines
    .replace(
      /\n\s*(?:\*\*|__|\*)?(?:Contadorista|Autor|Professor)?(?:\*\*|__|\*)?\s*:?\s*[^\n]*CURR[ÍI]CULO\s+LATTES[^\n]*/gi,
      ''
    )
    // Defensively strip closing meta-notes and justifications (e.g. *Nota: o texto não contém comandos...*)
    .replace(
      /\n\s*(?:\*\*|\*)\s*Nota:?(?:\*\*|\*)[\s\S]*?(?=\n#{1,2}\s|\n\s*---\s*\n|$)/gi,
      ''
    )
    // Defensively strip leaked textbook assessment questions, answer choices, and gabaritos
    .replace(
      /\n#{1,4}\s*(?:Verificando\s+o\s+Aprendizado|Verifica[cç][aã]o\s+de\s+Aprendizado|Atividades?\s+de\s+Autoavalia[cç][aã]o|Autoavalia[cç][aã]o|Exerc[íi]cios?\s+Propostos?|Gabarito(?:\s+Final|\s+Comentado)?)[\s\S]*?(?=\n#{1,2}\s|\n\s*---\s*\n|$)/gi,
      ''
    )
    // Defensively strip leaked trailing conclusion, recap, or summary blocks
    .replace(
      /\n#{1,4}\s*(?:Conclus[aã]o.*|Considera[cç][oõ]es\s+Finais.*|Resumo\s+(?:Operacional|Final|de\s+Comandos|dos\s+Conceitos).*)[\s\S]*?(?=\n#{1,2}\s|\n\s*---\s*\n|$)/gi,
      ''
    )
    // Normalize unindented display math blocks to prevent marked from turning them into pre/code
    .replace(/\n[ \t]+(\\\[[\s\S]+?\\\])/g, '\n\n$1\n\n')
    .replace(/\n[ \t]+(\$\$[\s\S]+?\$\$)/g, '\n\n$1\n\n');

  return repairMalformedMarkdownTables(cleaned);
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

export const SECTION_STANDARDS_PROMPT = `You are a Computer Science professor. Synthesize the provided study material in Brazilian Portuguese (PT-BR) with high technical depth and zero omissions, strictly based on the text.

STRUCTURE:
# [Título Técnico Específico da Seção]

### Pontos Nucleares
- [pilar 1: frase completa sintetizando um conceito estrutural da seção]
- [pilar 2: frase completa sintetizando um conceito estrutural da seção]
(Exatamente 3 a 5 marcadores conceituais abrangentes. Menos é mais: PROIBIDO listar teclas de atalho, flags de comandos ou listas de termos atômicos)

Para cada conceito ou mecanismo técnico identificado no texto:
## [Nome do Conceito Técnico]
### Definição Teórica
Explique os conceitos teóricos e arquiteturais em profundidade (mínimo 2 parágrafos densos).

### Mecanismo & Aplicação Prática
Detalhe a mecânica interna do sistema operacional e do kernel: ponteiros, setores, blocos, inodes, tabelas e chamadas de sistema.
Se e somente se o texto original contiver comandos reais de terminal Linux ou código, inclua-os e explique-os. É TERMINANTEMENTE PROIBIDO inventar código ou pseudocódigo que não conste no texto.

### Análise Comparativa
Quando houver métodos concorrentes ou trade-offs, formate obrigatoriamente como tabela Markdown completa:
| Mecanismo | Funcionamento Interno | Vantagens | Desvantagens | Cenário Ideal |
|---|---|---|---|---|

REGRAS:
- Todo o conteúdo deve ser em Português do Brasil (PT-BR).
- Fórmulas matemáticas devem usar estritamente $$...$$ para blocos destacados e $...$ para termos em linha.
- Termine a resposta imediatamente após o último conceito ou tabela. PROIBIDO gerar conclusões, resumos operacionais ou considerações finais.
- PROIBIDO ADICIONAR NOTAS META-TEXTUAIS: Jamais insira notas no rodapé justificando comandos ou citando instruções (ex: PROIBIDO "*Nota: o texto não contém comandos...*").
- PROIBIDO sintetizar listas bibliográficas ("Referências Bibliográficas"), caixas curriculares ("EXPLORE+") ou assinaturas de autoria ("Currículo Lattes").`;

export const SKELETON_BLUEPRINT_SCHEMA = z.object({
  sectionTitle: z.string().describe('Título técnico específico da seção em português'),
  keyPoints: z
    .array(z.string())
    .min(3)
    .max(5)
    .describe('Exatamente 3 a 5 frases completas abrangendo os pilares conceituais essenciais'),
  concepts: z
    .array(z.string())
    .min(3)
    .max(12)
    .describe('Lista exaustiva de conceitos, mecanismos e estruturas técnicas abordados no texto'),
});

export type SkeletonBlueprint = z.infer<typeof SKELETON_BLUEPRINT_SCHEMA>;

const SKELETON_EXTRACTOR_PROMPT = `You are an expert technical curriculum architect and computer science professor.
Analyze the provided study material chunk and extract an exhaustive structural blueprint strictly in Brazilian Portuguese (PT-BR).

CRITICAL MISSION:
1. Identify the exact technical title naming the primary mechanism or technology. Do NOT include generic labels like "Módulo", "Capítulo" or "Seção".
2. Extract EXACTLY 3 to 5 comprehensive "Pontos Nucleares" (foundational conceptual pillars).
   - "Menos é mais": think carefully and group related technical details into broad, foundational conceptual pillars.
   - Each bullet must be a substantive, high-level summary sentence explaining a macro pillar of the section.
   - STRICTLY FORBIDDEN: atomic minutiae, keyboard shortcuts (e.g. vim/nano keys), command flags (-v, -s, -d), raw code snippets, or isolated parameter terms.
3. Identify EVERY single core technical concept, algorithm, data structure, or mechanism present in the text that requires deep explanation in the body.
   Do NOT synthesize bibliographies, reading lists ("Referências Bibliográficas"), curricular enrichment boxes ("EXPLORE+"), or author signatures.
4. Output strictly a JSON object conforming to the schema.`;

/**
 * Pass 1: Extract exhaustive structural blueprint from the study chunk.
 * Uses reasoning tokens (enable_thinking: true) to deeply plan and cluster the text into 3-5 macro conceptual pillars.
 */
export async function extractSectionSkeleton(params: SynthesizeSectionParams): Promise<SkeletonBlueprint> {
  return callLlmJson({
    messages: [
      { role: 'system', content: SKELETON_EXTRACTOR_PROMPT },
      {
        role: 'user',
        content: `Document: "${params.title}" (Topic: ${params.topic}). Section ${params.sectionIndex} of ${params.totalSections}.\n\nText Content:\n${params.chunkContent.slice(0, 10000)}`,
      },
    ],
    schema: SKELETON_BLUEPRINT_SCHEMA,
    temperature: 0.15,
    maxTokens: 3500,
    chatTemplateKwargs: { enable_thinking: true },
    model: getStudiesModel(),
    baseUrl: getStudiesBaseUrl(),
  });
}
/**
 * Deep module that transforms raw study textbook chunks into pedagogical,
 * deeply structured Markdown in Brazilian Portuguese (PT-BR).
 * Encapsulates prompt engineering, model transport, non-destructive tail closure,
 * Portuguese language sanitization, and structured concept extraction behind a single interface.
 */
export async function synthesizeStudySection(params: SynthesizeSectionParams): Promise<SynthesizedSection> {
  // Pass 1: Extract exhaustive blueprint (fast, enable_thinking: false, ~3-4s)
  let blueprint: SkeletonBlueprint | null = null;
  try {
    blueprint = await extractSectionSkeleton(params);
  } catch (err) {
    console.warn(`[Synthesizer] Pass 1 skeleton extraction failed or fell back:`, err);
  }

  // Pass 2: Deep Grounded Expansion using the extracted blueprint (with reasoning enabled)
  const blueprintDirectives =
    blueprint?.concepts && blueprint.concepts.length > 0
      ? `\n\nMANDATORY CONCEPT BLUEPRINT (EXHAUSTIVE):\nYou MUST create a dedicated "## [Nome do Conceito]" subsection for EACH of the following concepts extracted from this chunk. Skipping any item is strictly forbidden:\n${blueprint.concepts
          .map((c) => `- ${c}`)
          .join('\n')}\n`
      : '';

  const pass2Prompt = `${SECTION_STANDARDS_PROMPT}\nTarget Document: "${params.title}" (Topic: ${
    params.topic
  }). Processing Section ${params.sectionIndex} of ${params.totalSections}.${blueprintDirectives}\nOutput all content strictly in Brazilian Portuguese (PT-BR).`;

  const rawMarkdown = await callLlmMarkdown({
    messages: [
      { role: 'system', content: pass2Prompt },
      { role: 'user', content: params.chunkContent },
    ],
    maxTokens: 7500,
    maxContinuations: 2,
    model: getStudiesModel(),
    baseUrl: getStudiesBaseUrl(),
    temperature: 0.15,
    topP: 0.9,
    repeatPenalty: 1.04,
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
    /^(?:exemplo\s+pr[áa]tico|defini[cç][ãa]o\s+te[óo]rica|mecanismo|m[óo]dulo\s+\d+|se[cç][ãa]o\s+\d+)/i.test(
      cleanTitle
    ) ||
    cleanTitle.toLowerCase() === params.title.toLowerCase();

  let resolvedTitle: string;
  if (isGeneric) {
    // Try to find the first real technical concept heading (## Concept)
    const firstConceptHeading = cleanMarkdown
      .match(/^##\s+([^\n]+)/m)?.[1]
      ?.replace(/^[\d.]+\s*/, '')
      ?.trim();

    if (
      firstConceptHeading &&
      !/^(?:exemplo\s+pr[áa]tico|defini[cç][ãa]o\s+te[óo]rica|mecanismo|m[óo]dulo|se[cç][ãa]o)/i.test(
        firstConceptHeading
      )
    ) {
      resolvedTitle = sanitizePortugueseMarkdown(firstConceptHeading);
    } else if (
      blueprint?.sectionTitle &&
      !/^(?:se[cç][ãa]o|m[óo]dulo|sem t[íi]tulo)/i.test(blueprint.sectionTitle)
    ) {
      resolvedTitle = sanitizePortugueseMarkdown(blueprint.sectionTitle);
    } else {
      resolvedTitle = `Seção ${params.sectionIndex}`;
    }
  } else {
    resolvedTitle = sanitizePortugueseMarkdown(cleanTitle);
  }
  // If Markdown parser missed Pontos Nucleares, fall back to authoritative blueprint keyPoints
  // Limit key points strictly to 3-5 comprehensive pillars (less is more)
  const finalKeyPoints =
    cleanKeyPoints.length >= 3 && cleanKeyPoints.length <= 5
      ? cleanKeyPoints
      : blueprint?.keyPoints && blueprint.keyPoints.length >= 3
        ? blueprint.keyPoints.slice(0, 5).map(sanitizePortugueseMarkdown)
        : cleanKeyPoints.slice(0, 5);
  return {
    sectionIndex: params.sectionIndex,
    sectionTitle: resolvedTitle,
    keyPoints: finalKeyPoints,
    markdown: cleanMarkdown,
  };
}

/**
 * Backward compatibility alias for synthesizeStudySection.
 */
export const synthesizeSection = synthesizeStudySection;
