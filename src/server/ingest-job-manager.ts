import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { getDb } from './db';
import { slugify } from './wiki-store';
import { generateEmbedding } from './embeddings';
import { callLlmJson } from './llm';
import { chunkTextBySections, cleanExtractedText, estimateDocumentTokens } from './pdf-extractor';
import { sectionAnalysisSchema } from './document-ingestor';

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
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

const WIKI_DIR = path.join(process.cwd(), 'data', 'wiki');
const STUDIES_DIR = path.join(WIKI_DIR, 'studies');

/**
 * Create a new background ingestion job record in SQLite.
 */
export function createIngestJob(params: {
  title: string;
  topic: string;
  totalSections: number;
}): IngestJob {
  const db = getDb();
  const now = new Date().toISOString();
  const id = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  db.prepare(`
    INSERT INTO ingest_jobs (
      id, title, topic, status, total_sections, completed_sections, file_path, error_message, created_at, updated_at
    ) VALUES (?, ?, ?, 'processing', ?, '[]', NULL, NULL, ?, ?)
  `).run(id, params.title.trim(), params.topic.trim(), params.totalSections, now, now);

  return {
    id,
    title: params.title.trim(),
    topic: params.topic.trim(),
    status: 'processing',
    totalSections: params.totalSections,
    completedSections: [],
    filePath: null,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Retrieve current status and completed sections for an ingestion job.
 */
export function getIngestJob(jobId: string): IngestJob | null {
  const db = getDb();
  const row = db
    .prepare(`
      SELECT id, title, topic, status, total_sections, completed_sections, file_path, error_message, created_at, updated_at
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
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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

/**
 * Execute background progressive synthesis for a document.
 * Runs autonomously in server background without blocking HTTP requests.
 */
export async function processDocumentInBackground(params: {
  jobId: string;
  title: string;
  topic: string;
  rawText: string;
  sourceFilename?: string;
  tags?: string[];
}): Promise<void> {
  const cleaned = cleanExtractedText(params.rawText);
  const chunks = chunkTextBySections(cleaned, 4800);
  const totalTokens = estimateDocumentTokens(cleaned);

  if (!fs.existsSync(STUDIES_DIR)) {
    fs.mkdirSync(STUDIES_DIR, { recursive: true });
  }

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const slug = slugify(params.title);
  const docId = `studies_${Date.now()}_${slug}`;
  const filename = `${dateStr}-${slug}.md`;
  const filePath = path.join(STUDIES_DIR, filename);

  const accumulatedSections: CompletedSectionData[] = [];

  try {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const systemPrompt = `You are an academic computer science professor and author of high-level textbooks.
Your objective is to produce an exhaustive, deep, and beautifully structured textbook chapter in Portuguese from section ${i + 1} of "${params.title}" (Topic: ${params.topic}).
STRICT RULES:
1. NO META-COMMENTARY: Do NOT mention "o autor lista", "o documento enumera" or "inventário técnico". Write directly and formally as the textbook author.
2. CONCRETE DEPTH: For each concept, provide:
   - Definição Teórica (exact and concise)
   - Mecanismo & Aplicação Prática (how it works internally)
   - Exemplo Prático ou Código (concrete real-world engineering scenario or closed markdown code block)
3. TRADE-OFF MATRIX: Provide a clear comparison markdown table highlighting advantages, disadvantages, and trade-offs.
Output ONLY pure JSON strictly matching this schema:
{
  "section_title": "Título da Seção em português",
  "key_points": ["Ponto conceitual 1", "Ponto conceitual 2"],
  "summary_markdown": "Texto profundo e estruturado do capítulo em markdown...",
  "active_recall_drills": []
}`;

      const analysis = await callLlmJson({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: chunk.content },
        ],
        schema: sectionAnalysisSchema,
        temperature: 0.2,
        maxTokens: 2500,
      });

      const sectionData: CompletedSectionData = {
        sectionIndex: i + 1,
        sectionTitle: analysis.section_title,
        keyPoints: analysis.key_points,
        markdown: analysis.summary_markdown,
      };

      accumulatedSections.push(sectionData);

      // Record progressive update in SQLite job store
      updateJobSection(params.jobId, sectionData);

      // Progressively update physical markdown file on disk
      const frontmatter = {
        id: docId,
        title: params.title.trim(),
        slug,
        module: 'studies',
        topic: params.topic.trim(),
        source_filename: params.sourceFilename || null,
        total_chunks: chunks.length,
        completed_chunks: i + 1,
        total_tokens: totalTokens,
        tags: params.tags || [params.topic.toLowerCase()],
        created_at: now.toISOString(),
        updated_at: new Date().toISOString(),
      };

      const sectionsMarkdown = accumulatedSections
        .map(
          (s) => `
## ${s.sectionIndex}. ${s.sectionTitle}

### Pontos Chave
${s.keyPoints.map((kp) => `- ${kp}`).join('\n')}

${s.markdown}
`
        )
        .join('\n\n---\n');

      const fullMarkdown = `
# ${params.title}

**Tópico:** ${params.topic} &bull; **Data:** ${dateStr}

${sectionsMarkdown}
`.trim();

      fs.writeFileSync(filePath, matter.stringify(fullMarkdown, frontmatter), 'utf-8');
    }

    // Index consolidated document in SQLite entries table
    const fullContent = fs.readFileSync(filePath, 'utf-8');
    const textToEmbed = `${params.title} ${params.topic} ${accumulatedSections.map((s) => s.sectionTitle).join(' ')}`;
    const vector = await generateEmbedding(textToEmbed);

    const db = getDb();
    db.prepare(`
      INSERT OR REPLACE INTO entries (
        id, slug, file_path, module, title, input_pt, target_en, explanation, tags, embedding, created_at, updated_at
      ) VALUES (?, ?, ?, 'studies', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      docId,
      slug,
      filePath,
      params.title.trim(),
      params.topic.trim(),
      null,
      fullContent,
      JSON.stringify(params.tags || [params.topic.toLowerCase()]),
      vector.length > 0 ? JSON.stringify(vector) : null,
      now.toISOString(),
      now.toISOString()
    );

    completeIngestJob(params.jobId, filePath);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error during background synthesis';
    console.error(`[IngestJob ${params.jobId}] Background synthesis failed:`, error);
    failIngestJob(params.jobId, message);
  }
}
