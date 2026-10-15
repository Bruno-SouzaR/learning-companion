import { PDFParse } from 'pdf-parse';

export interface ExtractedDocument {
  text: string;
  pages: number;
  estimatedTokens: number;
}

export interface DocumentChunk {
  index: number;
  content: string;
  estimatedTokens: number;
}

/**
 * Estimate tokens conservatively (~4 characters per token).
 */
export function estimateDocumentTokens(text: string): number {
  if (!text || text.trim().length === 0) return 0;
  return Math.max(1, Math.ceil(text.trim().length / 4));
}

/**
 * Strip textbook self-assessment quiz boxes (e.g. "Verificando o Aprendizado",
 * "Atividades de Autoavaliação", multiple choice questions A/B/C/D, and answer keys).
 */
export function stripTextbookAssessmentBlocks(text: string): string {
  if (!text || text.trim().length === 0) return '';

  return text
    .replace(
      /\n(?:\d+[\.\s]+)?(?:VERIFICANDO\s+O\s+APRENDIZADO|Verificando\s+o\s+Aprendizado|Verifica[cç][aã]o\s+de\s+Aprendizado|ATIVIDADES?\s+DE\s+AUTOAVALIA[CÇ][AÃ]O|Autoavalia[cç][aã]o|Exerc[íi]cios?\s+Propostos?|Gabarito(?:\s+Final|\s+Comentado)?)[\s\S]*?(?=\n#{1,2}\s+|\n(?:\d+\.\s*)?[A-Z][a-z0-9_\s]{3,}:|\n\s*---\s*\n|$)/gi,
      '\n\n'
    )
    .trim();
}

/**
 * Strip trailing editorial meta-sections like Bibliografia, Referências Bibliográficas,
 * Explore+, Saiba Mais, and Book Questionnaire evaluations from the end of textbook chapters.
 */
export function stripTrailingEditorialSections(text: string): string {
  if (!text || text.trim().length === 0) return '';

  const tailRegex = /\n(?:\d+[\.\s]+)?(?:Refer[êe]ncias\s+Bibliogr[áa]ficas|Bibliografia|Fontes\s+Bibliogr[áa]ficas|Explore\+|Saiba\s+Mais|Leituras\s+Recomendadas|Avalia[cç][aã]o\s+do\s+Tema)\b[\s\S]*$/i;

  return text.replace(tailRegex, '').trim();
}
/**
 * Clean raw extracted PDF text: normalizes linebreaks, removes page markers,
 * collapses redundant whitespace while preserving paragraph structure and stripping
 * trailing textbook meta-sections (bibliographies, explore+).
 */
export function cleanExtractedText(rawText: string): string {
  if (!rawText || rawText.trim().length === 0) return '';

  const baseCleaned = rawText
    .replace(/\r\n/g, '\n')
    // Remove common PDF page headers/footers like "Page 12 of 100" or standalone numbers
    .replace(/^\s*(?:page\s+\d+(?:\s+of\s+\d+)?|\d+)\s*$/gim, '')
    // Remove hyphenation breaks where words split across line breaks: e.g. "com-\nputer" -> "computer"
    .replace(/(\w+)-\n(\w+)/g, '$1$2')
    // Trim each line individually and collapse multiple horizontal spaces
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    // Replace 3+ consecutive newlines with double newlines (paragraphs)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const withoutAssessments = stripTextbookAssessmentBlocks(baseCleaned);
  return stripTrailingEditorialSections(withoutAssessments);
}

/**
 * Extract clean text and page count from a PDF buffer completely in-process.
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<ExtractedDocument> {
  if (!buffer || buffer.length === 0) {
    throw new Error('PDF buffer cannot be empty.');
  }
  try {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    const rawText = result?.text || '';
    const cleaned = cleanExtractedText(rawText);
    const estimatedTokens = estimateDocumentTokens(cleaned);

    return {
      text: cleaned,
      pages: result?.total || 1,
      estimatedTokens,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown PDF parsing error';
    throw new Error(`Failed to extract text from PDF: ${message}`);
  }
}

/**
 * Split a large document text into semantic section chunks respecting paragraph boundaries,
 * with an overlap buffer (default ~200 tokens) to ensure semantic continuity between sections.
 */
export function chunkTextBySections(
  text: string,
  maxTokensPerChunk = 1800,
  overlapTokens = 200
): DocumentChunk[] {
  const cleaned = cleanExtractedText(text);
  if (!cleaned) return [];

  const paragraphs = cleaned.split(/\n\n+/);
  const chunks: DocumentChunk[] = [];

  let currentChunkParagraphs: string[] = [];
  let currentTokens = 0;
  let chunkIndex = 0;
  let activeH1 = '';
  let activeH2 = '';

  const getBreadcrumb = () => {
    if (!activeH1 && !activeH2) return '';
    return `[Document Context: ${activeH1}${activeH2 ? ` > ${activeH2}` : ''}]\n\n`;
  };

  const updateHeadings = (textBlock: string) => {
    const lines = textBlock.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^#\s+/.test(trimmed) && trimmed.length < 120) {
        activeH1 = trimmed.replace(/^#\s+/, '').trim();
        activeH2 = '';
      } else if (/^##\s+/.test(trimmed) && trimmed.length < 120) {
        activeH2 = trimmed.replace(/^##\s+/, '').trim();
      } else if (/^(?:M[óo]dulo|Cap[íi]tulo)\s+\d+/i.test(trimmed) && trimmed.length < 120) {
        activeH1 = trimmed;
        activeH2 = '';
      }
    }
  };

  const finalizeChunk = (paras: string[]): DocumentChunk => {
    const rawBody = paras.join('\n\n');
    const bc = getBreadcrumb();
    const finalContent =
      bc && !/^\s*#{1,2}\s+/m.test(rawBody.slice(0, 120)) ? `${bc}${rawBody}` : rawBody;
    return {
      index: chunkIndex++,
      content: finalContent,
      estimatedTokens: estimateDocumentTokens(finalContent),
    };
  };
  for (const para of paragraphs) {
    const paraTokens = estimateDocumentTokens(para);

    // If single paragraph exceeds limit, push it as its own chunk
    updateHeadings(para);

    // If single paragraph exceeds limit, push it as its own chunk
    if (paraTokens >= maxTokensPerChunk) {
      if (currentChunkParagraphs.length > 0) {
        chunks.push(finalizeChunk(currentChunkParagraphs));
        currentChunkParagraphs = [];
        currentTokens = 0;
      }

      chunks.push(finalizeChunk([para]));
      continue;
    }

    if (currentTokens + paraTokens > maxTokensPerChunk) {
      chunks.push(finalizeChunk(currentChunkParagraphs));

      // Calculate overlap paragraphs from the tail of current chunk
      const overlapParas: string[] = [];
      let overlapCount = 0;
      for (let i = currentChunkParagraphs.length - 1; i >= 0; i--) {
        const p = currentChunkParagraphs[i];
        const pTok = estimateDocumentTokens(p);
        if (overlapCount + pTok <= overlapTokens) {
          overlapParas.unshift(p);
          overlapCount += pTok;
        } else {
          break;
        }
      }

      currentChunkParagraphs = [...overlapParas, para];
      currentTokens = overlapCount + paraTokens;
    } else {
      currentChunkParagraphs.push(para);
      currentTokens += paraTokens;
    }
  }

  if (currentChunkParagraphs.length > 0) {
    chunks.push(finalizeChunk(currentChunkParagraphs));
  }

  return chunks;
}
