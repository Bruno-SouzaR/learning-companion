import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { getDb } from './db';
import { getWikiDir } from './paths';
import { generateEmbedding, cosineSimilarity } from './embeddings';
import { scheduleNewEntry } from './srs-engine';

export interface WikiEntryFrontmatter {
  id: string;
  title: string;
  slug: string;
  module: 'english' | 'studies';
  created_at: string;
  updated_at?: string;
  tags: string[];
  input_pt?: string;
  target_en?: string;
}

export interface QuestionAttemptView {
  id: string;
  attemptNumber: number;
  userAnswer: string;
  scorePercentage: number;
  isCorrect: boolean;
  whatWasGood: string;
  whatWasMissing: string;
  misconceptionsFeedback?: string;
  createdAt: string;
}

export interface StudyQuestion {
  id: string;
  sectionIndex: number;
  question: string;
  expectedAnswer: string;
  clozeHint?: string;
  userAnswer?: string;
  isCorrect?: boolean;
  scorePercentage?: number;
  whatWasGood?: string;
  whatWasMissing?: string;
  misconceptionsFeedback?: string;
  attempts: QuestionAttemptView[];
}

export interface StoredEntry {
  id: string;
  title: string;
  slug: string;
  module: 'english' | 'studies';
  file_path: string;
  input_pt?: string;
  target_en?: string;
  explanation?: string;
  tags: string[];
  status?: 'active' | 'archived';
  version?: number;
  created_at: string;
  lastInteractedAt?: string;
  similarity?: number;
  questions?: StudyQuestion[];
}

function attachQuestionsToEntry(entry: StoredEntry): StoredEntry {
  if (entry.module !== 'studies') return entry;
  try {
    const db = getDb();
    let quizRow = db
      .prepare(`
        SELECT id
        FROM study_quizzes
        WHERE study_entry_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `)
      .get(entry.id) as { id: string } | undefined;

    // Fallback for legacy v1 entries where study_entry_id was saved as slug
    if (!quizRow && (entry.version === 1 || !entry.version)) {
      quizRow = db
        .prepare(`
          SELECT id
          FROM study_quizzes
          WHERE study_entry_id = ?
          ORDER BY created_at DESC
          LIMIT 1
        `)
        .get(entry.slug) as { id: string } | undefined;
    }

    if (quizRow) {
      const questions = db
        .prepare(`
          SELECT id, section_index, question, expected_answer, cloze_hint,
                 user_answer, is_correct, score_percentage, what_was_good, what_was_missing, misconceptions_feedback
          FROM quiz_questions
          WHERE quiz_id = ?
          ORDER BY section_index ASC
        `)
        .all(quizRow.id) as Array<{
          id: string;
          section_index: number;
          question: string;
          expected_answer: string;
          cloze_hint: string | null;
          user_answer: string | null;
          is_correct: number | null;
          score_percentage: number | null;
          what_was_good: string | null;
          what_was_missing: string | null;
          misconceptions_feedback: string | null;
        }>;

      const attemptRows = db
        .prepare(`
          SELECT id, question_id, attempt_number, user_answer, score_percentage, is_correct,
                 what_was_good, what_was_missing, misconceptions_feedback, created_at
          FROM question_attempts
          WHERE quiz_id = ?
          ORDER BY attempt_number ASC
        `)
        .all(quizRow.id) as Array<{
          id: string;
          question_id: string;
          attempt_number: number;
          user_answer: string;
          score_percentage: number;
          is_correct: number;
          what_was_good: string | null;
          what_was_missing: string | null;
          misconceptions_feedback: string | null;
          created_at: string;
        }>;

      const attemptsByQuestion: Record<string, QuestionAttemptView[]> = {};
      for (const att of attemptRows) {
        if (!attemptsByQuestion[att.question_id]) {
          attemptsByQuestion[att.question_id] = [];
        }
        attemptsByQuestion[att.question_id].push({
          id: att.id,
          attemptNumber: att.attempt_number,
          userAnswer: att.user_answer,
          scorePercentage: att.score_percentage,
          isCorrect: Boolean(att.is_correct),
          whatWasGood: att.what_was_good || '',
          whatWasMissing: att.what_was_missing || '',
          misconceptionsFeedback: att.misconceptions_feedback || undefined,
          createdAt: att.created_at,
        });
      }

      entry.questions = questions.map((q) => {
        const qAttempts = attemptsByQuestion[q.id] || [];
        const latestAttempt = qAttempts.slice(-1)[0];

        return {
          id: q.id,
          sectionIndex: q.section_index,
          question: q.question,
          expectedAnswer: q.expected_answer,
          clozeHint: q.cloze_hint || undefined,
          userAnswer: latestAttempt ? latestAttempt.userAnswer : (q.user_answer || undefined),
          isCorrect: latestAttempt ? latestAttempt.isCorrect : (q.is_correct !== null ? Boolean(q.is_correct) : undefined),
          scorePercentage: latestAttempt ? latestAttempt.scorePercentage : (q.score_percentage ?? undefined),
          whatWasGood: latestAttempt ? latestAttempt.whatWasGood : (q.what_was_good || undefined),
          whatWasMissing: latestAttempt ? latestAttempt.whatWasMissing : (q.what_was_missing || undefined),
          misconceptionsFeedback: latestAttempt ? latestAttempt.misconceptionsFeedback : (q.misconceptions_feedback || undefined),
          attempts: qAttempts,
        };
      });
    }

    const lastAttemptRow = db
      .prepare('SELECT MAX(created_at) as last_att FROM question_attempts WHERE study_entry_id = ?')
      .get(entry.id) as { last_att: string | null } | undefined;

    if (lastAttemptRow?.last_att) {
      entry.lastInteractedAt = lastAttemptRow.last_att;
    }
  } catch (err) {
    console.error('Failed to attach questions to study entry:', entry.id, err);
  }
  return entry;
}

const WIKI_DIR = getWikiDir();
const ENGLISH_DIR = path.join(getWikiDir(), 'english');

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 40) || 'entry';
}

/**
 * Save an English practice entry to physical markdown file and index into SQLite.
 */
export async function saveEnglishPracticeEntry(data: {
  title: string;
  input_pt: string;
  target_en: string;
  mistakes_summary: string[];
  key_vocabulary: Array<{ term: string; definition: string }>;
  tags: string[];
}): Promise<StoredEntry> {
  if (!fs.existsSync(ENGLISH_DIR)) {
    fs.mkdirSync(ENGLISH_DIR, { recursive: true });
  }

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const slug = slugify(data.title || data.target_en);
  const id = `eng_${Date.now()}`;
  const filename = `${dateStr}-${slug}.md`;
  const filePath = path.join(ENGLISH_DIR, filename);

  const frontmatter: WikiEntryFrontmatter = {
    id,
    title: data.title,
    slug,
    module: 'english',
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    tags: data.tags,
    input_pt: data.input_pt,
    target_en: data.target_en,
  };

  const mistakesSection = data.mistakes_summary.map((m) => `- ${m}`).join('\n');
  const vocabSection = data.key_vocabulary.map((v) => `- \`${v.term}\`: ${v.definition}`).join('\n');

  const markdownBody = `
# ${data.title}

## Original Input (Português)
> ${data.input_pt}

## Target English (Inglês Idiomático)
> ${data.target_en}

## Mistakes & Notes
${mistakesSection || '- Nenhuma observação crítica.'}

## Key Vocabulary
${vocabSection || '- Nenhum vocabulário destacado.'}
`.trim();

  const fileContent = matter.stringify(markdownBody, frontmatter);
  fs.writeFileSync(filePath, fileContent, 'utf-8');

  // Generate vector embedding for semantic search
  const textToEmbed = `${data.target_en} ${data.input_pt} ${data.tags.join(' ')}`;
  const vector = await generateEmbedding(textToEmbed);

  // Index into SQLite cache
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO entries (
      id, slug, file_path, module, title, input_pt, target_en, explanation, tags, embedding, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const explanation = `${mistakesSection}\n\n${vocabSection}`;
  stmt.run(
    id,
    slug,
    filePath,
    'english',
    data.title,
    data.input_pt,
    data.target_en,
    explanation,
    JSON.stringify(data.tags),
    vector.length > 0 ? JSON.stringify(vector) : null,
    now.toISOString(),
    now.toISOString()
  );

  try {
    scheduleNewEntry(id, 'english');
  } catch (err) {
    console.error('Failed to schedule SRS item for entry:', id, err);
  }

  return {
    id,
    title: data.title,
    slug,
    module: 'english',
    file_path: filePath,
    input_pt: data.input_pt,
    target_en: data.target_en,
    explanation,
    tags: data.tags,
    created_at: now.toISOString(),
  };
}

export interface StudySectionContent {
  sectionIndex: number;
  sectionTitle: string;
  keyPoints: string[];
  markdown: string;
}

export interface SaveStudyProgressParams {
  id: string;
  title: string;
  topic: string;
  slug: string;
  version: number;
  dateStr: string;
  totalChunks: number;
  completedChunks: number;
  totalTokens: number;
  sections: StudySectionContent[];
  createdAt?: string;
}

export interface FinalizeStudyDocumentParams {
  id: string;
  title: string;
  topic: string;
  slug: string;
  version: number;
  dateStr: string;
  totalChunks: number;
  totalTokens: number;
  sections: StudySectionContent[];
  createdAt?: string;
}

/**
 * Resolve next version number for a study slug based on existing entries.
 */
export function resolveNextStudyVersion(slug: string): number {
  const db = getDb();
  const existingRow = db
    .prepare('SELECT MAX(version) as max_v FROM entries WHERE slug = ?')
    .get(slug) as { max_v: number | null } | undefined;
  return (existingRow?.max_v || 0) + 1;
}

/**
 * Get standard file path for a study document version on disk.
 */
export function getStudyDocumentPath(slug: string, dateStr: string, version: number): string {
  const studiesDir = path.join(WIKI_DIR, 'studies');
  if (!fs.existsSync(studiesDir)) {
    fs.mkdirSync(studiesDir, { recursive: true });
  }
  const fileName = version > 1 ? `${dateStr}-${slug}-v${version}.md` : `${dateStr}-${slug}.md`;
  return path.join(studiesDir, fileName);
}

/**
 * Progressively write study document markdown to disk as sections are completed.
 */
export function saveStudyDocumentProgress(params: SaveStudyProgressParams): string {
  const filePath = getStudyDocumentPath(params.slug, params.dateStr, params.version);
  const now = new Date();

  const frontmatter = {
    id: params.id,
    title: params.title.trim(),
    slug: params.slug,
    version: params.version,
    module: 'studies',
    topic: params.topic.trim(),
    total_chunks: params.totalChunks,
    completed_chunks: params.completedChunks,
    total_tokens: params.totalTokens,
    created_at: params.createdAt || now.toISOString(),
    updated_at: now.toISOString(),
  };

  const sectionsMarkdown = params.sections
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
# ${params.title.trim()}

**Tema:** ${params.topic.trim()} &bull; **Data:** ${params.dateStr}

${sectionsMarkdown}
`.trim();

  fs.writeFileSync(filePath, matter.stringify(fullMarkdown, frontmatter), 'utf-8');
  return filePath;
}

/**
 * Finalize study document: writes physical file, generates vector embeddings,
 * and indexes clean markdown body into SQLite entries table.
 */
export async function finalizeStudyDocument(
  params: FinalizeStudyDocumentParams
): Promise<{ id: string; filePath: string }> {
  const filePath = saveStudyDocumentProgress({
    ...params,
    completedChunks: params.totalChunks,
  });

  const fullContent = fs.readFileSync(filePath, 'utf-8');
  const cleanBodyForDb = matter(fullContent).content.trim();
  const textToEmbed = `${params.title} ${params.topic} ${params.sections.map((s) => s.sectionTitle).join(' ')}`;
  const vector = await generateEmbedding(textToEmbed);

  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT OR REPLACE INTO entries (
      id, slug, file_path, module, title, input_pt, target_en, explanation, tags, embedding, status, version, created_at, updated_at
    ) VALUES (?, ?, ?, 'studies', ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
  `).run(
    params.id,
    params.slug,
    filePath,
    params.title.trim(),
    params.topic.trim(),
    null,
    cleanBodyForDb,
    JSON.stringify([params.topic.toLowerCase()]),
    vector.length > 0 ? JSON.stringify(vector) : null,
    params.version,
    params.createdAt || now,
    now
  );

  return { id: params.id, filePath };
}

/**
 * Surgically replace a single section within an existing study markdown file
 * and re-index the updated clean body and embeddings in SQLite.
 */
export async function replaceStudySectionInFile(
  filePath: string,
  updatedSection: StudySectionContent,
  topic: string
): Promise<boolean> {
  if (!fs.existsSync(filePath)) return false;

  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = matter(raw);
  const data = parsed.data as Record<string, unknown>;
  const content = parsed.content;

  // Split into sections by ## \d+\.
  const sectionHeaderRegex = new RegExp(`(^|\\n)##\\s+${updatedSection.sectionIndex}\\.\\s+[^\\n]*`, 'm');
  const match = content.match(sectionHeaderRegex);
  if (!match || match.index === undefined) return false;

  const sectionStart = match.index + (match[1] ? match[1].length : 0);

  // Find where this section ends: either next section separator \n\n---\n\n## \d+\. or end of sections / ## Questões
  const afterSection = content.slice(sectionStart);
  const nextSectionMatch = afterSection.slice(5).match(/(\n\n---\s*\n\n##\s+|\n\n##\s+(?:Questões|Exercícios)|\n\n---\s*\n\n##\s+Questões)/i);

  const sectionEnd =
    nextSectionMatch && nextSectionMatch.index !== undefined
      ? sectionStart + 5 + nextSectionMatch.index
      : content.length;

  const newSectionBlock = `## ${updatedSection.sectionIndex}. ${updatedSection.sectionTitle}

### Pontos Nucleares
${updatedSection.keyPoints.map((kp) => `- ${kp}`).join('\n')}

${updatedSection.markdown}`;

  const updatedContent = content.slice(0, sectionStart) + newSectionBlock + content.slice(sectionEnd);

  data.updated_at = new Date().toISOString();
  fs.writeFileSync(filePath, matter.stringify(updatedContent.trim(), data), 'utf-8');

  // Re-index into SQLite entries table
  const db = getDb();
  const entryId = (data.id as string) || path.basename(filePath, '.md');
  const cleanBody = updatedContent.trim();
  const title = (data.title as string) || '';
  const textToEmbed = `${title} ${topic} ${updatedSection.sectionTitle}`;
  const vector = await generateEmbedding(textToEmbed);

  db.prepare(`
    UPDATE entries
    SET explanation = ?, embedding = ?, updated_at = ?
    WHERE id = ? OR file_path = ?
  `).run(
    cleanBody,
    vector.length > 0 ? JSON.stringify(vector) : null,
    new Date().toISOString(),
    entryId,
    filePath
  );

  return true;
}
/**
 * Scan all markdown files in data/wiki and synchronize the SQLite cache.
 */
export async function syncWikiToDb(): Promise<number> {
  const db = getDb();
  if (!fs.existsSync(WIKI_DIR)) return 0;

  let indexedCount = 0;
  const modules = ['english', 'studies'] as const;

  for (const mod of modules) {
    const dir = path.join(WIKI_DIR, mod);
    if (!fs.existsSync(dir)) continue;

    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
    for (const file of files) {
      const fullPath = path.join(dir, file);
      try {
        const raw = fs.readFileSync(fullPath, 'utf-8');
        const parsed = matter(raw);
        const data = parsed.data as Partial<WikiEntryFrontmatter>;

        const id = data.id || `${mod}_${file.replace(/\.md$/, '')}`;
        const slug = data.slug || file.replace(/\.md$/, '');
        const title = data.title || file.replace(/\.md$/, '');
        const tags = Array.isArray(data.tags) ? data.tags : [];
        const anyData = data as Record<string, unknown>;
        const rawCreated = anyData.created_at;
        const createdAt =
          typeof rawCreated === 'string'
            ? rawCreated
            : rawCreated instanceof Date
            ? (rawCreated as Date).toISOString()
            : new Date().toISOString();

        const rawUpdated = anyData.updated_at;
        const updatedAt =
          typeof rawUpdated === 'string'
            ? rawUpdated
            : rawUpdated instanceof Date
            ? (rawUpdated as Date).toISOString()
            : createdAt;
        const version =
          typeof anyData.version === 'number'
            ? anyData.version
            : /-v(\d+)\.md$/i.test(file)
            ? parseInt(file.match(/-v(\d+)\.md$/i)?.[1] || '1', 10)
            : 1;

        // Check if already indexed with embedding and status
        const existing = db.prepare('SELECT embedding, status FROM entries WHERE id = ?').get(id) as { embedding?: string; status?: string } | undefined;
        const status = existing?.status === 'archived' ? 'archived' : (anyData.status as string) || 'active';
        let embeddingStr = existing?.embedding;
        if (!embeddingStr) {
          const textToEmbed = `${data.target_en || ''} ${data.input_pt || ''} ${title} ${tags.join(' ')}`;
          const vec = await generateEmbedding(textToEmbed);
          if (vec.length > 0) {
            embeddingStr = JSON.stringify(vec);
          }
        }

        // Clean up any stale/orphan record pointing to this same physical file with an outdated id
        db.prepare('DELETE FROM entries WHERE file_path = ? AND id != ?').run(fullPath, id);

        const upsert = db.prepare(`
          INSERT OR REPLACE INTO entries (
            id, slug, file_path, module, title, input_pt, target_en, explanation, tags, embedding, status, version, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        upsert.run(
          id,
          slug,
          fullPath,
          mod,
          title,
          data.input_pt || null,
          data.target_en || null,
          parsed.content,
          JSON.stringify(tags),
          embeddingStr || null,
          status,
          version,
          createdAt,
          updatedAt
        );
        indexedCount++;
      } catch (e) {
        console.error(`Failed to sync file ${fullPath}:`, e);
      }
    }
  }
  // Clean up stale database records for deleted files
  try {
    const allRecords = db.prepare('SELECT id, file_path FROM entries').all() as Array<{ id: string; file_path: string }>;
    for (const record of allRecords) {
      if (!fs.existsSync(record.file_path)) {
        db.prepare('DELETE FROM entries WHERE id = ?').run(record.id);
      }
    }
  } catch (err) {
    console.error('Failed to cleanup stale entries during sync:', err);
  }

  return indexedCount;
}

/**
 * Get recent entries from SQLite cache.
 */
export function getRecentEntries(limit = 20): StoredEntry[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, title, slug, module, file_path, input_pt, target_en, explanation, tags, status, version, created_at
    FROM entries
    WHERE (status IS NULL OR status = 'active')
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit) as Array<{
    id: string;
    title: string;
    slug: string;
    module: 'english' | 'studies';
    file_path: string;
    input_pt: string | null;
    target_en: string | null;
    explanation: string | null;
    tags: string;
    status: 'active' | 'archived' | null;
    version: number | null;
    created_at: string;
  }>;

  return rows.map((r) => {
    const entry: StoredEntry = {
      id: r.id,
      title: r.title,
      slug: r.slug,
      module: r.module,
      file_path: r.file_path,
      input_pt: r.input_pt || undefined,
      target_en: r.target_en || undefined,
      explanation: r.explanation || undefined,
      tags: JSON.parse(r.tags || '[]'),
      status: r.status || 'active',
      version: r.version || 1,
      created_at: r.created_at,
    };
    if (entry.explanation) {
      entry.explanation = entry.explanation.replace(/^---[\s\S]*?---\s*/m, '').trim();
    }
    return attachQuestionsToEntry(entry);
  });
}

/**
 * Search entries using semantic vector similarity and keyword matching.
 */
export async function searchWikiEntries(query: string, limit = 10): Promise<StoredEntry[]> {
  const db = getDb();
  if (!query || query.trim().length === 0) {
    return getRecentEntries(limit);
  }

  const queryVector = await generateEmbedding(query);
  const rows = db.prepare(`
    SELECT id, title, slug, module, file_path, input_pt, target_en, explanation, tags, status, version, embedding, created_at
    FROM entries
    WHERE (status IS NULL OR status = 'active')
  `).all() as Array<{
    id: string;
    title: string;
    slug: string;
    module: 'english' | 'studies';
    file_path: string;
    input_pt: string | null;
    target_en: string | null;
    explanation: string | null;
    tags: string;
    status: 'active' | 'archived' | null;
    version: number | null;
    embedding: string | null;
    created_at: string;
  }>;

  const qLower = query.toLowerCase();

  const scored = rows.map((r) => {
    let similarity = 0;
    if (queryVector.length > 0 && r.embedding) {
      try {
        const vec = JSON.parse(r.embedding);
        similarity = cosineSimilarity(queryVector, vec);
      } catch {
        similarity = 0;
      }
    }

    // Keyword match bonus
    let keywordScore = 0;
    const combinedText = `${r.title} ${r.input_pt || ''} ${r.target_en || ''} ${r.tags}`.toLowerCase();
    if (combinedText.includes(qLower)) {
      keywordScore = 0.35;
    }

    const totalScore = similarity * 0.65 + keywordScore;

    const entry: StoredEntry = {
      id: r.id,
      title: r.title,
      slug: r.slug,
      module: r.module,
      file_path: r.file_path,
      input_pt: r.input_pt || undefined,
      target_en: r.target_en || undefined,
      explanation: r.explanation || undefined,
      tags: JSON.parse(r.tags || '[]'),
      status: r.status || 'active',
      version: r.version || 1,
      created_at: r.created_at,
      similarity: Number(totalScore.toFixed(3)),
    };
    if (entry.explanation) {
      entry.explanation = entry.explanation.replace(/^---[\s\S]*?---\s*/m, '').trim();
    }
    return attachQuestionsToEntry(entry);
  });
  scored.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
  return scored.slice(0, limit);
}
/**
 * Soft-delete an entry by setting its status to 'archived'.
 * Keeps all data, files, and question attempts intact in SQLite and disk,
 * but hides the entry from user-facing frontend queries.
 */
export function archiveEntry(entryId: string): boolean {
  const db = getDb();
  const now = new Date().toISOString();

  const row = db
    .prepare('SELECT id, file_path FROM entries WHERE id = ?')
    .get(entryId) as { id: string; file_path: string | null } | undefined;

  const res = db
    .prepare(`
      UPDATE entries
      SET status = 'archived', updated_at = ?
      WHERE id = ?
    `)
    .run(now, entryId);

  if (row?.file_path && fs.existsSync(row.file_path)) {
    try {
      fs.unlinkSync(row.file_path);
    } catch (e) {
      console.warn(`[archiveEntry] failed to unlink physical file ${row.file_path}:`, e);
    }
  }

  return res.changes > 0;
}
