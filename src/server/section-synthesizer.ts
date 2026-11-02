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
    // Repair joined topic labels and stutters caused by continuation seams
    .replace(/[-*]\s+\*\*[A-Za-zÀ-ÿ]{1,6}-\s*\*\*/g, '- **')
    .replace(/(\bDefinição Teórica)\s*-\s*\*\*(Mecanismo & Aplicação Prática)/g, '$1:**\n- **$2')
    .replace(/(\*\*(?:Definição Teórica|Mecanismo & Aplicação Prática|Exemplo Prático)\*\*):?\s*-\s*\*\*/g, '$1:\n- **')
    // Defensively strip leaked bibliography and Explore+ subtopics
    .replace(
      /\n#{1,4}\s*(?:Refer[êe]ncias\s+Bibliogr[áa]ficas|Bibliografia|Explore\+|Saiba\s+Mais|Fontes)[\s\S]*?(?=\n#{1,3}\s|\n\s*---\s*\n|$)/gi,
      ''
    )
    // Defensively strip leaked textbook assessment questions, answer choices, and gabaritos
    .replace(
      /\n#{1,4}\s*(?:Verificando\s+o\s+Aprendizado|Verifica[cç][aã]o\s+de\s+Aprendizado|Atividades?\s+de\s+Autoavalia[cç][aã]o|Autoavalia[cç][aã]o|Exerc[íi]cios?\s+Propostos?|Gabarito(?:\s+Final|\s+Comentado)?)[\s\S]*?(?=\n#{1,2}\s|\n\s*---\s*\n|$)/gi,
      ''
    )
    // Defensively strip leaked trailing conclusion and recap blocks (e.g. ## Conclusão, ## Conclusão Técnica)
    .replace(
      /\n#{1,4}\s*(?:Conclus[aã]o(?:\s+(?:T[eé]cnica|do\s+M[oó]dulo|da\s+Se[cç][aã]o|Final|\(Resumo[^\)]*\)))?|Considera[cç][oõ]es\s+Finais|Resumo\s+Final)[\s\S]*?(?=\n#{1,2}\s|\n\s*---\s*\n|$)/gi,
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

export const SECTION_STANDARDS_PROMPT = `You are an expert Computer Science professor and technical reference architect specializing in deep, concept-by-concept technical reference documentation.
Your goal is to synthesize study materials into deep, rigorously structured, highly pedagogical Markdown strictly in Brazilian Portuguese (PT-BR) with EXHAUSTIVE technical depth and ZERO omissions.
CORE MANDATORY INVARIANTS:
1. STRICT BRAZILIAN PORTUGUESE (PT-BR):
   Write all content, titles, headings, and pedagogical explanations strictly in Brazilian Portuguese.
   Explicitly forbid Spanish cognates (e.g. use "Definição Teórica" NOT "Definición", "Exemplo Prático" NOT "Ejemplo", "Vantagens" and "Desvantagens" NOT "Ventajas").

2. STRICT HEADING HIERARCHY (NO MALFORMED HEADINGS):
   You MUST strictly adhere to this exact heading structure. Never emit broken heading markers (such as "## ###" or multiple consecutive hashes):
   # [Título Específico da Seção - nomeando a tecnologia, estrutura de dados ou mecanismo]

   ### Pontos Nucleares
   - [bullet 1: frase completa sintetizando um conceito nuclear essencial]
   - [bullet 2: frase completa sintetizando um conceito nuclear essencial]
   (5 a 8 marcadores com pontos-chave)

   Para cada conceito, estrutura de dados, algoritmo ou mecanismo técnico presente no texto:
   ## [Nome do Conceito Técnico]

   ### Definição Teórica
   [Explicação teórica aprofundada: mínimo 2 parágrafos densos e completos detalhando fundamentos conceituais, princípios matemáticos ou de engenharia e requisitos do sistema. PROIBIDO resumos superficiais ou frases de uma única linha.]

   ### Mecanismo & Aplicação Prática
   [Mecânica interna exata: fluxo operacional passo a passo, como o kernel/SO gerencia ponteiros, blocos de disco, inodes, setores, memória RAM, registradores e chamadas de sistema (syscalls). Detalhe a implementação em nível de arquitetura.]

   ### Exemplo Prático (ou Nota de Código)
   [Cenário técnico concreto: comandos reais de terminal Linux comentados linha a linha, trechos de código em C/pseudocódigo demonstrando a lógica interna, ou diagramas de blocos.]

3. MANDATORY COMPARATIVE TABLES:
   Whenever the material introduces competing mechanisms, strategies, or trade-offs (e.g., Alocação Contígua vs. Encadeada vs. Indexada; Cache Write-Through vs. Write-Back; Diretórios Nível Único vs. Árvore), you MUST provide a comprehensive Markdown comparison table:
   | Mecanismo / Abordagem | Funcionamento Interno | Vantagens | Desvantagens | Cenário de Uso Recomendado |
   |---|---|---|---|---|

4. MATHEMATICAL FORMULAS & ARCHITECTURAL LIMITS:
   Whenever equations, capacities, latency, pointer arithmetic, or addressing limits appear (e.g. cálculo de tamanho de bloco, limite de ponteiros de inode, tempo de acesso a disco), render them explicitly in LaTeX ($...$ ou $$...$$).

5. ZERO SUPERFICIALITY & CONSTANT RIGOR:
   - PROHIBITED: Single-sentence definitions, generic hand-waving, or cutting short on later sections.
   - Every single concept must be given the same deep academic rigor from the first to the very last line.
   - NO META-COMMENTARY: never write conversational preambles (e.g. "O autor lista", "Abaixo vemos", "O documento descreve").

6. ABSOLUTE BAN ON CONCLUSIONS, RECAPS, AND CLOSING REMARKS (CRITICAL INVARIANT):
   - NEVER generate a "Conclusão", "Conclusão Técnica", "Conclusão do Módulo", "Resumo", "Considerações Finais", or any recap at the end of the section.
   - Summarizing what you just explained is STRICTLY FORBIDDEN and wastes token budget.
   - Every single token must be dedicated to explaining the core technical concepts themselves with maximum depth.
   - Terminate the section immediately after the final concept's practical example or comparative table. No closing remarks, no farewells, no author signatures.

7. STRICT GROUNDING IN SOURCE MATERIAL (ANTI-HALLUCINATION INVARIANT):
   - Every single concept, algorithm step, data structure, and technical fact MUST be strictly grounded in the provided source text.
   - NEVER invent fictional utilities, external tools, or false claims. Maintain 100% academic factual fidelity to the study material.`;

export const SKELETON_BLUEPRINT_SCHEMA = z.object({
  sectionTitle: z.string().describe('Título técnico específico da seção em português'),
  keyPoints: z.array(z.string()).min(3).max(8).describe('5 a 8 frases completas dos pontos nucleares essenciais'),
  concepts: z.array(z.string()).min(3).max(12).describe('Lista exaustiva de todos os conceitos, mecanismos e estruturas técnicas abordados no texto'),
});

export type SkeletonBlueprint = z.infer<typeof SKELETON_BLUEPRINT_SCHEMA>;

const SKELETON_EXTRACTOR_PROMPT = `You are an expert technical curriculum architect and computer science professor.
Analyze the provided study material chunk and extract an exhaustive structural blueprint strictly in Brazilian Portuguese (PT-BR).

CRITICAL MISSION:
1. Identify the exact technical title naming the primary mechanism or technology.
2. Extract 5-8 essential "Pontos Nucleares" (full sentences summarizing core takeaways).
3. Identify EVERY single technical concept, algorithm, data structure, or mechanism present in the text.
   Do NOT omit any concept. List all items that require in-depth technical explanation.
4. Output strictly a JSON object conforming to the schema.`;

/**
 * Pass 1: Extract exhaustive structural blueprint from the study chunk.
 * Runs without reasoning tokens (enable_thinking: false) for near-instant execution (<4s).
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
    temperature: 0.1,
    maxTokens: 1500,
    chatTemplateKwargs: { enable_thinking: false },
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
    cleanTitle.toLowerCase() === params.title.toLowerCase();

  let resolvedTitle: string;
  if (isGeneric) {
    if (blueprint?.sectionTitle && !blueprint.sectionTitle.toLowerCase().includes('sem título')) {
      resolvedTitle = sanitizePortugueseMarkdown(blueprint.sectionTitle);
    } else {
      const firstSubhead = cleanMarkdown.match(/^###\s+([^\n]+)/m)?.[1]?.trim();
      resolvedTitle = firstSubhead
        ? sanitizePortugueseMarkdown(firstSubhead)
        : `Seção ${params.sectionIndex}`;
    }
  } else {
    resolvedTitle = sanitizePortugueseMarkdown(cleanTitle);
  }

  // If Markdown parser missed Pontos Nucleares, fall back to authoritative blueprint keyPoints
  const finalKeyPoints =
    cleanKeyPoints.length >= 3
      ? cleanKeyPoints
      : blueprint?.keyPoints && blueprint.keyPoints.length > 0
        ? blueprint.keyPoints.map(sanitizePortugueseMarkdown)
        : cleanKeyPoints;

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
