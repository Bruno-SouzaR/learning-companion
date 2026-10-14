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

  return stripTrailingEditorialSections(baseCleaned);
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
 * Split a large document text into semantic section chunks respecting paragraph boundaries.
 */
export function chunkTextBySections(
  text: string,
  maxTokensPerChunk = 4000
): DocumentChunk[] {
  const cleaned = cleanExtractedText(text);
  if (!cleaned) return [];

  const paragraphs = cleaned.split(/\n\n+/);
  const chunks: DocumentChunk[] = [];

  let currentChunkParagraphs: string[] = [];
  let currentTokens = 0;
  let chunkIndex = 0;

  for (const para of paragraphs) {
    const paraTokens = estimateDocumentTokens(para);

    // If single paragraph exceeds limit, push it as its own chunk
    if (paraTokens >= maxTokensPerChunk) {
      if (currentChunkParagraphs.length > 0) {
        const chunkContent = currentChunkParagraphs.join('\n\n');
        chunks.push({
          index: chunkIndex++,
          content: chunkContent,
          estimatedTokens: estimateDocumentTokens(chunkContent),
        });
        currentChunkParagraphs = [];
        currentTokens = 0;
      }

      chunks.push({
        index: chunkIndex++,
        content: para,
        estimatedTokens: paraTokens,
      });
      continue;
    }

    if (currentTokens + paraTokens > maxTokensPerChunk) {
      const chunkContent = currentChunkParagraphs.join('\n\n');
      chunks.push({
        index: chunkIndex++,
        content: chunkContent,
        estimatedTokens: estimateDocumentTokens(chunkContent),
      });
      currentChunkParagraphs = [para];
      currentTokens = paraTokens;
    } else {
      currentChunkParagraphs.push(para);
      currentTokens += paraTokens;
    }
  }

  if (currentChunkParagraphs.length > 0) {
    const chunkContent = currentChunkParagraphs.join('\n\n');
    chunks.push({
      index: chunkIndex++,
      content: chunkContent,
      estimatedTokens: estimateDocumentTokens(chunkContent),
    });
  }

  return chunks;
}
