import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import { POST as handleIngest } from '@/app/api/study/ingest/route';
import { POST as handleRetrySection } from '@/app/api/study/section/retry/route';
import { createIngestJob } from '@/server/ingest-job-manager';
import * as synthesizer from '@/server/section-synthesizer';
import { getDb } from '@/server/db';
import * as llmModule from '@/server/llm';
describe('Integration: Study Ingest API Route', () => {
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

  it('processes valid JSON document ingestion and returns HTTP 200', async () => {
    vi.spyOn(llmModule, 'callLlmJson').mockResolvedValue({
      section_title: 'Módulo de Memória Virtual',
      key_points: ['Paginação', 'TLB', 'Page Faults'],
      summary_markdown: 'A memória virtual permite isolamento de processos e abstração de RAM...',
      active_recall_drills: [
        {
          question: 'Qual o papel da TLB?',
          expected_answer: 'Funciona como um cache de tradução de endereços virtuais para físicos.',
        },
      ],
    });

    const req = new Request('http://localhost:3000/api/study/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Sistemas Operacionais: Memória Virtual',
        topic: 'Operating Systems',
        content: 'A paginação divide o espaço de endereçamento em páginas de tamanho fixo. Quando uma página não está presente na RAM física, ocorre uma falha de página (page fault).',
        tags: ['operating-systems', 'cs'],
      }),
    });

    const res = await handleIngest(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.title).toBe('Sistemas Operacionais: Memória Virtual');
    expect(json.data.jobId).toBeDefined();
    expect(json.data.status).toBe('processing');
    expect(json.data.totalSections).toBeGreaterThanOrEqual(1);
  });

  describe('Validation & Edge Cases', () => {
    it('rejects JSON payloads with empty title or content with HTTP 400', async () => {
      const req = new Request('http://localhost:3000/api/study/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: '',
          topic: 'OS',
          content: '',
        }),
      });

      const res = await handleIngest(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBeDefined();
    });

    it('rejects multipart requests without file with HTTP 400', async () => {
      const formData = new FormData();
      formData.append('title', 'Test');
      formData.append('topic', 'Test');

      const req = new Request('http://localhost:3000/api/study/ingest', {
        method: 'POST',
        body: formData,
      });

      const res = await handleIngest(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('arquivo');
    });

    it('rejects section retry requests with missing or invalid parameters with HTTP 400', async () => {
      const req = new Request('http://localhost:3000/api/study/section/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: '', sectionIndex: 0 }),
      });

      const res = await handleRetrySection(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBeDefined();
    });

    it('successfully retries a single section on demand and returns updated section data', async () => {
      const db = getDb();
      const job = createIngestJob({
        title: 'Documento Retry Test',
        topic: 'Test Topic',
        totalSections: 2,
      });

      // Seed raw_chunks
      const rawChunks = [
        { sectionIndex: 1, content: 'Texto do chunk 1 para teste', estimatedTokens: 50 },
        { sectionIndex: 2, content: 'Texto do chunk 2 para teste', estimatedTokens: 50 },
      ];
      db.prepare('UPDATE ingest_jobs SET raw_chunks = ? WHERE id = ?').run(
        JSON.stringify(rawChunks),
        job.id
      );

      vi.spyOn(synthesizer, 'synthesizeSection').mockResolvedValueOnce({
        sectionIndex: 1,
        sectionTitle: 'Seção 1 Regenerada',
        keyPoints: ['Ponto Regenerado'],
        markdown: '### Conteúdo Novo\n- **Definição Teórica:** Definição correta.',
      });

      const req = new Request('http://localhost:3000/api/study/section/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id, sectionIndex: 1 }),
      });

      const res = await handleRetrySection(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.sectionTitle).toBe('Seção 1 Regenerada');
      expect(json.data.keyPoints).toEqual(['Ponto Regenerado']);
      expect(json.data.markdown).toContain('Definição correta.');
    });
  });
});
