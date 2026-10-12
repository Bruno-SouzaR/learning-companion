import { describe, it, expect } from 'vitest';
import {
  createIngestJob,
  getIngestJob,
  updateJobSection,
  completeIngestJob,
  failIngestJob,
} from '@/server/ingest-job-manager';

describe('Unit: IngestJobManager State Machine', () => {
  it('creates an ingest job in processing state', () => {
    const job = createIngestJob({
      title: 'Capítulo 1: Sistemas de Arquivos',
      topic: 'Sistemas Operacionais',
      totalSections: 4,
    });

    expect(job.id).toBeDefined();
    expect(job.status).toBe('processing');
    expect(job.totalSections).toBe(4);
    expect(job.completedSections).toHaveLength(0);
    expect(job.filePath).toBeNull();
  });

  it('progressively appends completed sections to active job', () => {
    const job = createIngestJob({
      title: 'Progressive Test',
      topic: 'Testing',
      totalSections: 2,
    });

    const updated1 = updateJobSection(job.id, {
      sectionIndex: 1,
      sectionTitle: 'Seção 1: Introdução',
      markdown: 'Conteúdo da seção 1...',
      keyPoints: ['Ponto 1'],
    });

    expect(updated1.completedSections).toHaveLength(1);
    expect(updated1.completedSections[0].sectionTitle).toBe('Seção 1: Introdução');

    const updated2 = updateJobSection(job.id, {
      sectionIndex: 2,
      sectionTitle: 'Seção 2: Estrutura',
      markdown: 'Conteúdo da seção 2...',
      keyPoints: ['Ponto 2'],
    });

    expect(updated2.completedSections).toHaveLength(2);
    expect(updated2.completedSections[1].sectionTitle).toBe('Seção 2: Estrutura');

    // Verify retrieval from SQLite matches
    const retrieved = getIngestJob(job.id);
    expect(retrieved?.completedSections).toHaveLength(2);
  });

  it('marks job as completed with physical file path', () => {
    const job = createIngestJob({
      title: 'Completion Test',
      topic: 'Testing',
      totalSections: 1,
    });

    const completed = completeIngestJob(job.id, '/path/to/test.md');
    expect(completed.status).toBe('completed');
    expect(completed.filePath).toBe('/path/to/test.md');

    const retrieved = getIngestJob(job.id);
    expect(retrieved?.status).toBe('completed');
  });

  it('marks job as failed with specific error message', () => {
    const job = createIngestJob({
      title: 'Failure Test',
      topic: 'Testing',
      totalSections: 1,
    });

    const failed = failIngestJob(job.id, 'Memory limit exceeded');
    expect(failed.status).toBe('failed');
    expect(failed.errorMessage).toBe('Memory limit exceeded');

    const retrieved = getIngestJob(job.id);
    expect(retrieved?.status).toBe('failed');
    expect(retrieved?.errorMessage).toBe('Memory limit exceeded');
  });

  it('returns null for non-existent job ID', () => {
    expect(getIngestJob('non_existent_job_12345')).toBeNull();
  });
});
