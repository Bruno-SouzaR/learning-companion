import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import { ingestDocument } from '@/server/document-ingestor';
import * as llmModule from '@/server/llm';
import { getDb } from '@/server/db';

describe('Integration: Document Ingestion Pipeline', () => {
  const createdFiles: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    for (const filePath of createdFiles) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    createdFiles.length = 0;
  });

  it('chunks document, generates summary and drills, and registers into SRS', async () => {
    // Mock callLlmJson so the test runs deterministically in CI/test environments
    vi.spyOn(llmModule, 'callLlmJson').mockResolvedValue({
      section_title: 'Introdução aos Sistemas Distribuídos',
      key_points: ['Teorema CAP', 'Consistência Eventual', 'Particionamento'],
      summary_markdown: 'Sistemas distribuídos trocam latência por escalabilidade...',
      active_recall_drills: [
        {
          question: 'O que afirma o Teorema CAP?',
          expected_answer: 'Afirma que é impossível fornecer simultaneamente Consistência, Disponibilidade e Tolerância a Partições.',
          cloze_hint: 'Consistência, [Disponibilidade], Tolerância a Partições',
        },
      ],
    });

    const result = await ingestDocument({
      title: 'Capítulo 1: Sistemas Distribuídos',
      topic: 'Software Architecture',
      rawText: 'Um sistema distribuído é uma coleção de computadores autônomos que transmitem mensagens entre si para atingir um objetivo comum.\n\nO teorema CAP estabelece limites fundamentais sobre consistência e disponibilidade em redes sujeitas a falhas.',
      tags: ['distributed-systems', 'architecture'],
    });

    createdFiles.push(result.filePath);

    expect(result.id).toBeDefined();
    expect(result.title).toBe('Capítulo 1: Sistemas Distribuídos');
    expect(result.sections).toHaveLength(1);
    expect(result.drills).toHaveLength(1);
    expect(result.srsScheduledCount).toBe(1);
    expect(fs.existsSync(result.filePath)).toBe(true);

    const fileContent = fs.readFileSync(result.filePath, 'utf-8');
    expect(fileContent).toContain('Introdução aos Sistemas Distribuídos');
    expect(fileContent).toContain('Teorema CAP');
    expect(fileContent).toContain('O que afirma o Teorema CAP?');

    // Verify row in SQLite entries table
    const db = getDb();
    const entryRow = db.prepare('SELECT id, title, module FROM entries WHERE id = ?').get(result.id) as {
      id: string;
      title: string;
      module: string;
    } | undefined;

    expect(entryRow).toBeDefined();
    expect(entryRow?.module).toBe('studies');

    // Verify document registered in srs_items
    const srsRows = db.prepare('SELECT id, entry_id, module FROM srs_items WHERE entry_id = ?').all(result.id);
    expect(srsRows.length).toBeGreaterThanOrEqual(1);
  });

  describe('Edge Cases', () => {
    it('throws error when document text is empty', async () => {
      await expect(
        ingestDocument({
          title: 'Empty Doc',
          topic: 'General',
          rawText: '   \n  ',
        })
      ).rejects.toThrow(/content cannot be empty/i);
    });

    it('throws error when document title is empty', async () => {
      await expect(
        ingestDocument({
          title: '',
          topic: 'General',
          rawText: 'Some valid text content here.',
        })
      ).rejects.toThrow(/title is required/i);
    });
  });
});
