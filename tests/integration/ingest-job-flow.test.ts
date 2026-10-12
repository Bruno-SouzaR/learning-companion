import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  createIngestJob,
  getIngestJob,
  listRecentIngestJobs,
  processDocumentInBackground,
} from '@/server/ingest-job-manager';
import * as synthesizer from '@/server/section-synthesizer';
import { chunkTextBySections } from '@/server/pdf-extractor';
import { INGEST_CHUNK_TOKENS } from '@/server/ingest-job-manager';
import { getDb } from '@/server/db';

describe('Integration: Background Processing, Continuity & Stale Recovery', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('processes a multi-chunk document progressively and completes with entryId', async () => {
    vi.spyOn(synthesizer, 'synthesizeSection').mockResolvedValue({
      sectionTitle: 'Seção de Memória Caché',
      keyPoints: ['La cache evita E/S a disco'],
      markdown: 'Contenido profundo de la sección de caché.',
    });

    // Long text guaranteed to exceed one 4800-token chunk (target ≥2 chunks)
    const body = Array.from({ length: 34 }, () => 'abcdefghijklmnopqrstuvwxyz '.repeat(40).trim()).join('\n\n');

    const chunkCount = chunkTextBySections(body, INGEST_CHUNK_TOKENS).length;
    expect(chunkCount).toBeGreaterThanOrEqual(2);

    const job = createIngestJob({
      title: 'Documento de prueba multi-chunk',
      topic: 'Sistemas',
      totalSections: chunkCount,
    });

    await processDocumentInBackground(job.id, body);

    const final = getIngestJob(job.id);
    expect(final?.status).toBe('completed');
    expect(final?.completedSections.length).toBe(chunkCount);
    expect(final?.filePath).toBeTruthy();
    expect(fs.existsSync(final?.filePath || '')).toBe(true);

    // Entry was indexed with the job entryId
    const db = getDb();
    const expectedEntryId = job.entryId as string;
    const entryRow = db.prepare('SELECT id FROM entries WHERE id = ?').get(expectedEntryId) as
      | { id: string }
      | undefined;
    expect(entryRow?.id).toBe(expectedEntryId);

    const fileContent = fs.readFileSync(final?.filePath || '', 'utf-8');
    expect(fileContent).toContain('## 1. ');
    expect(fileContent).toContain('Pontos Nucleares');
  });

  it('keeps partial sections and marks job failed on synthesis error', async () => {
    const mocked = vi.spyOn(synthesizer, 'synthesizeSection');
    mocked.mockResolvedValueOnce({
      sectionTitle: 'Primera sección',
      keyPoints: ['Punto'],
      markdown: 'Contenido 1',
    });
    mocked.mockRejectedValueOnce(new Error('LLM timeout'));

    const body = Array.from({ length: 34 }, () => 'abcdefghijklmnopqrstuvwxyz '.repeat(40).trim()).join('\n\n');
    const chunkCount = chunkTextBySections(body, INGEST_CHUNK_TOKENS).length;

    const job = createIngestJob({
      title: 'Documento con fallo',
      topic: 'Sistemas',
      totalSections: chunkCount,
    });

    await processDocumentInBackground(job.id, body);

    const final = getIngestJob(job.id);
    expect(final?.status).toBe('failed');
    expect(final?.errorMessage).toContain('LLM timeout');
    // Partial progress is preserved for UI recovery
    expect(final?.completedSections.length).toBe(1);
  });

  it('reconciles stale processing jobs left by a previous server restart', () => {
    const db = getDb();

    // Insert a job row that is NOT running in this process: stale
    const staleJobId = `job_stale_${Date.now()}`;
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO ingest_jobs (
        id, title, topic, status, total_sections, completed_sections, file_path, entry_id, error_message, created_at, updated_at
      ) VALUES (?, 'Stale', 'Sistemas', 'processing', 2, '[]', NULL, NULL, NULL, ?, ?)
    `).run(staleJobId, now, now);

    const jobs = listRecentIngestJobs(20);
    const stale = jobs.find((j) => j.id === staleJobId);

    expect(stale).toBeDefined();
    expect(stale?.status).toBe('failed');
    expect(stale?.errorMessage).toContain('reinicio');
  });

  it('lists recent jobs descending by creation time', async () => {
    const db = getDb();
    void db;

    const a = createIngestJob({ title: 'Job A primer', topic: 'X', totalSections: 1 });
    await new Promise((r) => setTimeout(r, 5));
    const b = createIngestJob({ title: 'Job B segundo', topic: 'X', totalSections: 1 });

    const jobs = listRecentIngestJobs(20);
    const ids = jobs.map((j) => j.id);
    expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id));

    // Summaries on the list endpoint omit section content (continuity dispatch only)
    for (const j of jobs) {
      expect(j.completedSections).toEqual([]);
    }
  });
});
