import { describe, it, expect } from 'vitest';
import {
  estimateDocumentTokens,
  cleanExtractedText,
  chunkTextBySections,
} from '@/server/pdf-extractor';

describe('Unit: PDF & Document Text Extractor', () => {
  describe('estimateDocumentTokens', () => {
    it('returns 0 for empty or whitespace-only strings', () => {
      expect(estimateDocumentTokens('')).toBe(0);
      expect(estimateDocumentTokens('   \n\t  ')).toBe(0);
    });

    it('returns proportional token estimates for text', () => {
      expect(estimateDocumentTokens('word')).toBe(1);
      const text = 'This is a sample document text containing several paragraphs.';
      expect(estimateDocumentTokens(text)).toBeGreaterThanOrEqual(10);
    });
  });

  describe('cleanExtractedText', () => {
    it('removes standalone page numbers and headers', () => {
      const raw = `
Header Title
Page 1 of 50
Some real paragraph content here.
42
Another real paragraph content.
      `;
      const cleaned = cleanExtractedText(raw);
      expect(cleaned).not.toContain('Page 1 of 50');
      expect(cleaned).not.toContain('42');
      expect(cleaned).toContain('Some real paragraph content here.');
      expect(cleaned).toContain('Another real paragraph content.');
    });

    it('reconnects hyphenated words broken across line wraps', () => {
      const raw = 'The com-\nputer program was effi-\ncient.';
      const cleaned = cleanExtractedText(raw);
      expect(cleaned).toContain('computer');
      expect(cleaned).toContain('efficient');
    });

    it('normalizes excessive newlines and horizontal spaces', () => {
      const raw = 'Paragraph one.    \n\n\n\n\n   Paragraph    two.';
      const cleaned = cleanExtractedText(raw);
      expect(cleaned).toBe('Paragraph one.\n\nParagraph two.');
    });

    it('handles empty input safely', () => {
      expect(cleanExtractedText('')).toBe('');
      expect(cleanExtractedText('   ')).toBe('');
    });
  });

  describe('chunkTextBySections', () => {
    it('returns empty array when text is empty', () => {
      expect(chunkTextBySections('')).toEqual([]);
      expect(chunkTextBySections('   ')).toEqual([]);
    });

    it('keeps small text as a single chunk', () => {
      const text = 'Short paragraph 1.\n\nShort paragraph 2.';
      const chunks = chunkTextBySections(text, 1000);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].index).toBe(0);
      expect(chunks[0].content).toContain('Short paragraph 1.');
      expect(chunks[0].content).toContain('Short paragraph 2.');
    });

    it('splits text across paragraph boundaries when exceeding maxTokens', () => {
      const para1 = 'A'.repeat(400); // ~100 tokens
      const para2 = 'B'.repeat(400); // ~100 tokens
      const para3 = 'C'.repeat(400); // ~100 tokens
      const text = `${para1}\n\n${para2}\n\n${para3}`;

      // Set max tokens to 150 tokens so each chunk fits at most 1-2 paragraphs
      const chunks = chunkTextBySections(text, 150);

      expect(chunks.length).toBeGreaterThanOrEqual(2);
      expect(chunks[0].content).toContain(para1);
      expect(chunks.every((c) => c.estimatedTokens > 0)).toBe(true);
    });

    it('handles a massive single paragraph by placing it into its own chunk', () => {
      const giantPara = 'Z'.repeat(2000);
      const smallPara = 'Normal small paragraph.';
      const text = `${smallPara}\n\n${giantPara}\n\n${smallPara}`;

      const chunks = chunkTextBySections(text, 200);

      expect(chunks.length).toBeGreaterThanOrEqual(3);
      expect(chunks.some((c) => c.content === giantPara)).toBe(true);
    });
  });
});
