import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import matter from 'gray-matter';
import { getDb } from './db';
import { generateEmbedding } from './embeddings';
import { slugify } from './wiki-store';
import { scheduleNewEntry } from './srs-engine';
import { callLlmJson } from './llm';
import { chunkTextBySections, cleanExtractedText, estimateDocumentTokens } from './pdf-extractor';

export const sectionAnalysisSchema = z.object({
  section_title: z.string().describe('Title of this conceptual section'),
  key_points: z.array(z.string()).describe('Core conceptual bullet points in Portuguese'),
  summary_markdown: z.string().describe('Comprehensive educational summary in Portuguese'),
  active_recall_drills: z.array(
    z.object({
      question: z.string().describe('Pedagogical question testing retention'),
      expected_answer: z.string().describe('Clear, accurate expected answer'),
      cloze_hint: z.string().optional().describe('Optional fill-in-the-blank hint'),
    })
  ).describe('2 to 4 active recall questions testing this section'),
});

export type SectionAnalysis = z.infer<typeof sectionAnalysisSchema>;

export interface ActiveRecallDrill {
  id: string;
  question: string;
  expectedAnswer: string;
  clozeHint?: string;
  topic: string;
}

export interface IngestDocumentParams {
  title: string;
  topic: string;
  rawText: string;
  sourceFilename?: string;
  tags?: string[];
  maxChunkTokens?: number;
}

export interface IngestDocumentResult {
  id: string;
  title: string;
  topic: string;
  slug: string;
  filePath: string;
  sections: Array<{
    sectionTitle: string;
    keyPoints: string[];
    summaryText: string;
  }>;
  drills: ActiveRecallDrill[];
  totalTokens: number;
  srsScheduledCount: number;
}

const WIKI_DIR = path.join(process.cwd(), 'data', 'wiki');
const STUDIES_DIR = path.join(WIKI_DIR, 'studies');

/**
 * Ingest, chunk, summarize, and generate Active Recall drills from a study document or PDF.
 */
export async function ingestDocument(params: IngestDocumentParams): Promise<IngestDocumentResult> {
  const cleaned = cleanExtractedText(params.rawText);

  if (!cleaned || cleaned.trim().length === 0) {
    throw new Error('Document content cannot be empty.');
  }

  if (!params.title || params.title.trim().length === 0) {
    throw new Error('Document title is required.');
  }

  const chunks = chunkTextBySections(cleaned, params.maxChunkTokens || 4500);
  const totalTokens = estimateDocumentTokens(cleaned);
  const sections: IngestDocumentResult['sections'] = [];
  const allDrills: ActiveRecallDrill[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const systemPrompt = `You are a high-level academic tutor and software engineering professor.
Analyze the provided material from chapter/section ${i + 1} of "${params.title}" (Topic: ${params.topic}).
Provide a deep, structured pedagogical explanation in Portuguese and extract 2-3 active recall questions with clear expected answers.
Output ONLY pure JSON strictly matching this schema:
{
  "section_title": "Título do Tópico em português",
  "key_points": ["Ponto 1", "Ponto 2"],
  "summary_markdown": "Resumo detalhado em markdown...",
  "active_recall_drills": [
    {
      "question": "Pergunta conceitual para fixação?",
      "expected_answer": "Resposta esperada detalhada",
      "cloze_hint": "Dica com lacuna opcional"
    }
  ]
}`;

    const analysis = await callLlmJson({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: chunk.content },
      ],
      schema: sectionAnalysisSchema,
      temperature: 0.2,
      maxTokens: 1200,
    });

    sections.push({
      sectionTitle: analysis.section_title,
      keyPoints: analysis.key_points,
      summaryText: analysis.summary_markdown,
    });

    for (const drill of analysis.active_recall_drills) {
      allDrills.push({
        id: `drill_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        question: drill.question,
        expectedAnswer: drill.expected_answer,
        clozeHint: drill.cloze_hint,
        topic: params.topic,
      });
    }
  }

  // Ensure studies wiki directory exists
  if (!fs.existsSync(STUDIES_DIR)) {
    fs.mkdirSync(STUDIES_DIR, { recursive: true });
  }

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const slug = slugify(params.title);
  const docId = `studies_${Date.now()}_${slug}`;
  const filename = `${dateStr}-${slug}.md`;
  const filePath = path.join(STUDIES_DIR, filename);

  const frontmatter = {
    id: docId,
    title: params.title.trim(),
    slug,
    module: 'studies',
    topic: params.topic.trim(),
    source_filename: params.sourceFilename || null,
    total_chunks: chunks.length,
    total_tokens: totalTokens,
    total_drills: allDrills.length,
    tags: params.tags || [params.topic.toLowerCase()],
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };

  const sectionsMarkdown = sections
    .map(
      (s, idx) => `
## Seção ${idx + 1}: ${s.sectionTitle}

### Pontos Chave
${s.keyPoints.map((kp) => `- ${kp}`).join('\n')}

### Resumo e Conceitos
${s.summaryText}
`
    )
    .join('\n\n---\n');

  const drillsMarkdown = allDrills
    .map(
      (d, idx) => `
#### Questão ${idx + 1}: ${d.question}
> **Resposta Esperada:** ${d.expectedAnswer}
${d.clozeHint ? `*Dica/Lacuna:* \`${d.clozeHint}\`` : ''}
`
    )
    .join('\n');

  const fullMarkdownBody = `
# ${params.title}

**Tópico:** ${params.topic} &bull; **Data:** ${dateStr}

${sectionsMarkdown}

---

## Questões de Fixação e Active Recall
${drillsMarkdown || 'Nenhuma questão gerada.'}
`.trim();

  fs.writeFileSync(filePath, matter.stringify(fullMarkdownBody, frontmatter), 'utf-8');

  // Generate vector embeddings and index into SQLite entries table
  const textToEmbed = `${params.title} ${params.topic} ${sections.map((s) => s.sectionTitle).join(' ')}`;
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
    fullMarkdownBody,
    JSON.stringify(frontmatter.tags),
    vector.length > 0 ? JSON.stringify(vector) : null,
    now.toISOString(),
    now.toISOString()
  );

  // Automatically schedule each active recall drill into the SRS queue
  let srsScheduledCount = 0;
  for (const drill of allDrills) {
    try {
      const drillEntryId = `entry_${drill.id}`;
      // Register individual drill entry for granular repetition
      db.prepare(`
        INSERT OR REPLACE INTO entries (
          id, slug, file_path, module, title, input_pt, target_en, explanation, tags, created_at, updated_at
        ) VALUES (?, ?, ?, 'studies', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        drillEntryId,
        slugify(drill.question),
        filePath,
        drill.question,
        drill.question,
        drill.expectedAnswer,
        drill.clozeHint || drill.expectedAnswer,
        JSON.stringify([params.topic.toLowerCase(), 'drill']),
        now.toISOString(),
        now.toISOString()
      );

      scheduleNewEntry(drillEntryId, 'studies', 1);
      srsScheduledCount++;
    } catch (err) {
      console.error('Failed to schedule SRS drill:', drill.id, err);
    }
  }

  return {
    id: docId,
    title: params.title.trim(),
    topic: params.topic.trim(),
    slug,
    filePath,
    sections,
    drills: allDrills,
    totalTokens,
    srsScheduledCount,
  };
}
