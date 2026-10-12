import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { getDb } from './db';
import { generateEmbedding, cosineSimilarity } from './embeddings';

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
  created_at: string;
  similarity?: number;
}

const WIKI_DIR = path.join(process.cwd(), 'data', 'wiki');
const ENGLISH_DIR = path.join(WIKI_DIR, 'english');

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
        const createdAt = data.created_at || new Date().toISOString();
        const updatedAt = data.updated_at || createdAt;

        // Check if already indexed with embedding
        const existing = db.prepare('SELECT embedding FROM entries WHERE id = ?').get(id) as { embedding?: string } | undefined;

        let embeddingStr = existing?.embedding;
        if (!embeddingStr) {
          const textToEmbed = `${data.target_en || ''} ${data.input_pt || ''} ${title} ${tags.join(' ')}`;
          const vec = await generateEmbedding(textToEmbed);
          if (vec.length > 0) {
            embeddingStr = JSON.stringify(vec);
          }
        }

        const upsert = db.prepare(`
          INSERT OR REPLACE INTO entries (
            id, slug, file_path, module, title, input_pt, target_en, explanation, tags, embedding, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    SELECT id, title, slug, module, file_path, input_pt, target_en, explanation, tags, created_at
    FROM entries
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
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    module: r.module,
    file_path: r.file_path,
    input_pt: r.input_pt || undefined,
    target_en: r.target_en || undefined,
    explanation: r.explanation || undefined,
    tags: JSON.parse(r.tags || '[]'),
    created_at: r.created_at,
  }));
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
    SELECT id, title, slug, module, file_path, input_pt, target_en, explanation, tags, embedding, created_at
    FROM entries
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

    return {
      id: r.id,
      title: r.title,
      slug: r.slug,
      module: r.module,
      file_path: r.file_path,
      input_pt: r.input_pt || undefined,
      target_en: r.target_en || undefined,
      explanation: r.explanation || undefined,
      tags: JSON.parse(r.tags || '[]'),
      created_at: r.created_at,
      similarity: Number(totalScore.toFixed(3)),
    };
  });

  scored.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
  return scored.slice(0, limit);
}
