import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { getDb } from './db';
import { getWikiDir } from './paths';
import { slugify } from './wiki-store';
import { generateEmbedding } from './embeddings';
import { chunkTextBySections, cleanExtractedText, estimateDocumentTokens } from './pdf-extractor';
import { synthesizeSection } from './section-synthesizer';

export interface CompletedSectionData {
  sectionIndex: number;
  sectionTitle: string;
  markdown: string;
  keyPoints: string[];
}

export interface IngestJob {
  id: string;
  title: string;
  topic: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  totalSections: number;
  completedSections: CompletedSectionData[];
  filePath?: string | null;
  entryId?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

export const INGEST_CHUNK_TOKENS = 4800;
export const INGEST_RECENT_LIMIT = 10;

const WIKI_DIR = getWikiDir();
const STUDIES_DIR = path.join(WIKI_DIR, 'studies');

// Jobs actively running in THIS server process. Used to detect jobs orphaned
// by a previous process restart (stale "processing" rows).
let runningJobIds: Set<string> | null = null;
function getRunningJobs(): Set<string> {
  // Keep a process-global registry that survives module duplication across bundles
  const g = globalThis as { __lcRunningJobs?: Set<string> };
  if (!g.__lcRunningJobs) {
    g.__lcRunningJobs = new Set();
  }
  return g.__lcRunningJobs;
}

/**
 * Create a background ingestion job with a resolved entryId generated at
 * creation time so quizzes can reference it immediately.
 */
export function createIngestJob(params: {
  title: string;
  topic: string;
  totalSections: number;
}): IngestJob {
  const db = getDb();
  const now = new Date().toISOString();
  const id = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const entryId = `studies_${Date.now()}_${slugify(params.title)}`;

  db.prepare(`
    INSERT INTO ingest_jobs (
      id, title, topic, status, total_sections, completed_sections, file_path, entry_id, error_message, created_at, updated_at
    ) VALUES (?, ?, ?, 'processing', ?, '[]', NULL, ?, NULL, ?, ?)
  `).run(id, params.title.trim(), params.topic.trim(), params.totalSections, entryId, now, now);

  return {
    id,
    title: params.title.trim(),
    topic: params.topic.trim(),
    status: 'processing',
    totalSections: params.totalSections,
    completedSections: [],
    filePath: null,
    entryId,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Retrieve full status including completed sections for an ingestion job.
 */
export function getIngestJob(jobId: string): IngestJob | null {
  const db = getDb();
  const row = db
    .prepare(`
      SELECT id, title, topic, status, total_sections, completed_sections, file_path, entry_id, error_message, created_at, updated_at
      FROM ingest_jobs
      WHERE id = ?
    `)
    .get(jobId) as {
      id: string;
      title: string;
      topic: string;
      status: 'queued' | 'processing' | 'completed' | 'failed';
      total_sections: number;
      completed_sections: string;
      file_path: string | null;
      entry_id: string | null;
      error_message: string | null;
      created_at: string;
      updated_at: string;
    } | undefined;

  if (!row) return null;

  let completed: CompletedSectionData[] = [];
  try {
    completed = JSON.parse(row.completed_sections);
  } catch {
    completed = [];
  }

  return {
    id: row.id,
    title: row.title,
    topic: row.topic,
    status: row.status,
    totalSections: row.total_sections,
    completedSections: completed,
    filePath: row.file_path,
    entryId: row.entry_id,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * List recent ingest jobs. Danger: this drives UI continuity, so it must also
 * reconcile jobs orphaned by a server restart into a visible failed state.
 */
export function listRecentIngestJobs(limit = INGEST_RECENT_LIMIT): IngestJob[] {
  const db = getDb();

  rawReconcileStaleJobs();

  const rows = db
    .prepare(`
      SELECT id, title, topic, status, total_sections, completed_sections, file_path, entry_id, error_message, created_at, updated_at
      FROM ingest_jobs
      ORDER BY created_at DESC
      LIMIT ?
    `)
    .all(limit) as Array<{
      id: string;
      title: string;
      topic: string;
      status: string;
      total_sections: number;
      completed_sections: string;
      file_path: string | null;
      entry_id: string | null;
      error_message: string | null;
      created_at: string;
      updated_at: string;
    }>;

  return rows.map((row) => {
    let completed: CompletedSectionData[] = [];
    try {
      completed = JSON.parse(row.completed_sections);
    } catch {
      completed = [];
    }

    const statusNorm = row.status as 'queued' | 'processing' | 'completed' | 'failed';
    return {
      id: row.id,
      title: row.title,
      topic: row.topic,
      status: statusNorm,
      totalSections: row.total_sections,
      completedSections: [],
      filePath: row.file_path,
      entryId: row.entry_id,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

/**
 * Record a newly synthesized section onto the active job.
 */
export function updateJobSection(jobId: string, section: CompletedSectionData): IngestJob {
  const db = getDb();
  const job = getIngestJob(jobId);

  if (!job) {
    throw new Error(`Job "${jobId}" not found.`);
  }

  const updatedSections = [...job.completedSections, section];
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE ingest_jobs
    SET completed_sections = ?, updated_at = ?
    WHERE id = ?
  `).run(JSON.stringify(updatedSections), now, jobId);

  return {
    ...job,
    completedSections: updatedSections,
    updatedAt: now,
  };
}

/**
 * Mark job as successfully completed and link physical markdown file.
 */
export function completeIngestJob(jobId: string, filePath: string): IngestJob {
  const db = getDb();
  const job = getIngestJob(jobId);

  if (!job) {
    throw new Error(`Job "${jobId}" not found.`);
  }

  const now = new Date().toISOString();

  db.prepare(`
    UPDATE ingest_jobs
    SET status = 'completed', file_path = ?, updated_at = ?
    WHERE id = ?
  `).run(filePath, now, jobId);

  return {
    ...job,
    status: 'completed',
    filePath,
    updatedAt: now,
  };
}

/**
 * Mark job as failed with specific error message.
 */
export function failIngestJob(jobId: string, error: string): IngestJob {
  const db = getDb();
  const job = getIngestJob(jobId);

  if (!job) {
    throw new Error(`Job "${jobId}" not found.`);
  }

  const now = new Date().toISOString();

  db.prepare(`
    UPDATE ingest_jobs
    SET status = 'failed', error_message = ?, updated_at = ?
    WHERE id = ?
  `).run(error, now, jobId);

  return {
    ...job,
    status: 'failed',
    errorMessage: error,
    updatedAt: now,
  };
}

function rawReconcileStaleJobs(): void {
  const db = getDb();
  const running = getRunningJobs();

  const orphans = db
    .prepare(`SELECT id FROM ingest_jobs WHERE status = 'processing'`)
    .all() as Array<{ id: string }>;

  const nowIso = new Date().toISOString();
  for (const orphan of orphans) {
    if (!running.has(orphan.id)) {
      db.prepare(`
        UPDATE ingest_jobs
        SET status = 'failed', error_message = 'Proceso interrumpido por reinicio del servidor.', updated_at = ?
        WHERE id = ? AND status = 'processing'
      `).run(nowIso, orphan.id);
    }
  }
}

/**
 * Execute background progressive synthesis for a document with Markdown output.
 * Runs autonomously without blocking HTTP requests; survives browser tab changes.
 */
export async function processDocumentInBackground(jobId: string, rawText: string): Promise<void> {
  const db = getDb();
  const job = getIngestJob(jobId);

  if (!job) {
    console.error(`[IngestJob ${jobId}] no encontrado para procesar`);
    return;
  }

  // Register AS running synchronously BEFORE first await
  const running = getRunningJobs();
  running.add(jobId);

  const accumulated: CompletedSectionData[] = [];

  try {
    const cleaned = cleanExtractedText(rawText);
    const chunks = chunkTextBySections(cleaned, INGEST_CHUNK_TOKENS);
    const totalTokens = estimateDocumentTokens(cleaned);
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const slug = slugify(job.title);
    const filePath = path.join(STUDIES_DIR, `${dateStr}-${slug}.md`);

    if (!fs.existsSync(STUDIES_DIR)) {
      fs.mkdirSync(STUDIES_DIR, { recursive: true });
    }

    for (let i = 0; i < chunks.length; i++) {
      const section = await synthesizeSection({
        title: job.title,
        topic: job.topic,
        sectionIndex: i + 1,
        totalSections: chunks.length,
        chunkContent: chunks[i].content,
      });

      const sectionData: CompletedSectionData = {
        sectionIndex: i + 1,
        sectionTitle: section.sectionTitle,
        keyPoints: section.keyPoints,
        markdown: section.markdown,
      };
      accumulated.push(sectionData);
      updateJobSection(jobId, sectionData);

      const frontmatter = {
        id: job.entryId,
        title: job.title,
        slug,
        module: 'studies',
        topic: job.topic,
        total_chunks: chunks.length,
        completed_chunks: i + 1,
        total_tokens: totalTokens,
        created_at: now.toISOString(),
        updated_at: new Date().toISOString(),
      };

      const sectionsMarkdown = accumulated
        .map(
          (s) => `
## ${s.sectionIndex}. ${s.sectionTitle}

### Pontos Nucleares
${s.keyPoints.map((kp) => `- ${kp}`).join('\n')}

${s.markdown}
`
        )
        .join('\n\n---\n');

      const fullMarkdown = `
# ${job.title}

**Tema:** ${job.topic} &bull; **Fecha:** ${dateStr}

${sectionsMarkdown}
`.trim();

      fs.writeFileSync(filePath, matter.stringify(fullMarkdown, frontmatter), 'utf-8');
    }

// Index the consolidated document into SQLite entries table
    const fullContent = fs.readFileSync(filePath, 'utf-8');
    // Store only clean markdown body (strip YAML frontmatter) in the explanation column
    const fullMarkdown = matter(fullContent).content.trim();
    const textToEmbed = `${job.title} ${job.topic} ${accumulated.map((s) => s.sectionTitle).join(' ')}`;
    const vector = await generateEmbedding(textToEmbed);

    const finalEntryId = job.entryId || `studies_${Date.now()}_${slug}`;
    db.prepare(`
      INSERT OR REPLACE INTO entries (
        id, slug, file_path, module, title, input_pt, target_en, explanation, tags, embedding, created_at, updated_at
      ) VALUES (?, ?, ?, 'studies', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      finalEntryId,
      slug,
      filePath,
      job.title,
      job.topic,
      null,
      fullMarkdown,
      JSON.stringify([job.topic.toLowerCase()]),
      vector.length > 0 ? JSON.stringify(vector) : null,
      now.toISOString(),
      now.toISOString()
    );

    completeIngestJob(jobId, filePath);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido na síntese';
    console.error(`[IngestJob ${jobId}] síntese em segundo plano falhou:`, error);
    failIngestJob(jobId, message);
  } finally {
    running.delete(jobId);
  }
}

