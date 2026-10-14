import { NextResponse } from 'next/server';
import { z } from 'zod';
import { extractTextFromPdf, cleanExtractedText, chunkTextBySections } from '@/server/pdf-extractor';
import {
  INGEST_CHUNK_TOKENS,
  createIngestJob,
  getIngestJob,
  listRecentIngestJobs,
  processDocumentInBackground,
} from '@/server/ingest-job-manager';
import { getDb } from '@/server/db';
import type { QuizSession } from '@/server/quiz-engine';

const jsonIngestSchema = z.object({
  title: z.string().trim().min(1, 'O título do documento é obrigatório'),
  topic: z.string().trim().min(1, 'O tópico do documento é obrigatório'),
  content: z.string().trim().min(1, 'O conteúdo do documento não pode estar vazio'),
  tags: z.array(z.string()).optional(),
});

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let title = '';
    let topic = '';
    let text = '';

    // Handle multipart/form-data (PDF file upload)
    if (contentType.includes('multipart/form-data')) {
      let formData: FormData;
      try {
        formData = await request.formData();
      } catch {
        return NextResponse.json(
          { success: false, error: 'Formato multipart inválido ou arquivo ausente.' },
          { status: 400 }
        );
      }

      const file = formData.get('file') as File | null;
      title = (formData.get('title') as string) || '';
      topic = (formData.get('topic') as string) || '';

      if (!file) {
        return NextResponse.json(
          { success: false, error: 'Nenhum arquivo enviado.' },
          { status: 400 }
        );
      }

      if (!title.trim() || !topic.trim()) {
        return NextResponse.json(
          { success: false, error: 'Título e tópico são campos obrigatórios.' },
          { status: 400 }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const extracted = await extractTextFromPdf(buffer);
      text = extracted.text;
    } else {
      // Handle application/json (Raw text or pasted document)
      const json = await request.json();
      const parsed = jsonIngestSchema.safeParse(json);

      if (!parsed.success) {
        return NextResponse.json(
          {
            success: false,
            error: parsed.error.errors[0]?.message || 'Dados inválidos para ingestão de documento',
          },
          { status: 400 }
        );
      }

      title = parsed.data.title;
      topic = parsed.data.topic;
      text = parsed.data.content;
    }

    const cleaned = cleanExtractedText(text);
    if (!cleaned) {
      return NextResponse.json(
        { success: false, error: 'O conteúdo de texto extraído está vazio.' },
        { status: 400 }
      );
    }

    const chunks = chunkTextBySections(cleaned, INGEST_CHUNK_TOKENS);
    const totalSections = Math.max(1, chunks.length);

    // Create background job
    const job = createIngestJob({
      title: title.trim(),
      topic: topic.trim(),
      totalSections,
    });

    // Launch background asynchronous synthesis (does not block HTTP response)
    void processDocumentInBackground(job.id, cleaned);

    return NextResponse.json({
      success: true,
      data: {
        jobId: job.id,
        entryId: job.entryId,
        title: job.title,
        topic: job.topic,
        totalSections: job.totalSections,
        status: job.status,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Falha ao iniciar processamento do documento';
    console.error('API /api/study/ingest POST error:', error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    const entryId = searchParams.get('entryId');

    // If entryId is provided, load the consolidated material directly into the study view
    if (entryId && entryId.trim()) {
      const db = getDb();
      const entry = db
        .prepare('SELECT id, title, explanation, tags, created_at, updated_at FROM entries WHERE id = ?')
        .get(entryId.trim()) as
        | {
            id: string;
            title: string;
            explanation: string | null;
            tags: string;
            created_at: string;
            updated_at: string;
          }
        | undefined;

      if (!entry) {
        return NextResponse.json(
          { success: false, error: `Material com id "${entryId}" não encontrado.` },
          { status: 404 }
        );
      }

      const parsedTags = JSON.parse(entry.tags || '[]');
      const topic = parsedTags[0] || 'Geral';
      const cleanExp = (entry.explanation || '').replace(/^---[\s\S]*?---\s*/m, '').trim();

      // Split sections by \n## or ---
      const rawSections = cleanExp.split(/\n(?=##\s+\d+)/g).filter(Boolean);
      const completedSections = (rawSections.length > 0 ? rawSections : [cleanExp]).map((sec, idx) => {
        const lines = sec.trim().split('\n');
        const titleLine = lines[0] || `Seção ${idx + 1}`;
        const sectionTitle = titleLine.replace(/^##\s*(?:\d+\.\s*)?/, '').trim();
        return {
          sectionIndex: idx + 1,
          sectionTitle: sectionTitle || `Seção ${idx + 1}`,
          keyPoints: [],
          markdown: sec.trim(),
        };
      });

      const syntheticJob = {
        id: `entry_${entry.id}`,
        title: entry.title,
        topic,
        status: 'completed',
        totalSections: Math.max(1, completedSections.length),
        completedSections,
        entryId: entry.id,
        currentStep: 'Síntese pronta para leitura e simulado.',
        createdAt: entry.created_at,
        updatedAt: entry.updated_at,
      };

      let latestQuiz: QuizSession | null = null;
      const quizRow = db
        .prepare(`
          SELECT id, study_entry_id, title, topic, status, total_questions, score, weak_sections, created_at
          FROM study_quizzes
          WHERE study_entry_id = ?
          ORDER BY created_at DESC
          LIMIT 1
        `)
        .get(entry.id) as
        | {
            id: string;
            study_entry_id: string;
            title: string;
            topic: string;
            status: string;
            total_questions: number;
            score: number | null;
            weak_sections: string;
            created_at: string;
          }
        | undefined;

      if (quizRow) {
        const questions = db
          .prepare(`
            SELECT id, section_index, question, cloze_hint
            FROM quiz_questions
            WHERE quiz_id = ?
            ORDER BY section_index ASC
          `)
          .all(quizRow.id) as Array<{
            id: string;
            section_index: number;
            question: string;
            cloze_hint: string | null;
          }>;

        latestQuiz = {
          id: quizRow.id,
          studyEntryId: quizRow.study_entry_id,
          title: quizRow.title,
          topic: quizRow.topic,
          status: quizRow.status as 'pending' | 'completed',
          totalQuestions: quizRow.total_questions,
          score: quizRow.score,
          weakSections: JSON.parse(quizRow.weak_sections || '[]'),
          questions: questions.map((q) => ({
            id: q.id,
            sectionIndex: q.section_index,
            question: q.question,
            clozeHint: q.cloze_hint || undefined,
          })),
          createdAt: quizRow.created_at,
        };
      }

      return NextResponse.json({
        success: true,
        data: syntheticJob,
        quiz: latestQuiz,
      });
    }

    // No jobId → list recent jobs for UI continuity (limit 3, failed excluded)
    if (!jobId || !jobId.trim()) {
      const recent = listRecentIngestJobs(3, { includeFailed: false, includeDismissed: false });
      return NextResponse.json({
        success: true,
        data: { jobs: recent },
      });
    }
    const job = getIngestJob(jobId.trim());

    if (!job) {
      return NextResponse.json(
        { success: false, error: `Job com id "${jobId}" não encontrado.` },
        { status: 404 }
      );
    }

    let latestQuiz: QuizSession | null = null;
    if (job.entryId) {
      const db = getDb();
      const quizRow = db
        .prepare(`
          SELECT id, study_entry_id, title, topic, status, total_questions, score, weak_sections, created_at
          FROM study_quizzes
          WHERE study_entry_id = ?
          ORDER BY created_at DESC
          LIMIT 1
        `)
        .get(job.entryId) as
        | {
            id: string;
            study_entry_id: string;
            title: string;
            topic: string;
            status: string;
            total_questions: number;
            score: number | null;
            weak_sections: string;
            created_at: string;
          }
        | undefined;

      if (quizRow) {
        const questions = db
          .prepare(`
            SELECT id, section_index, question, cloze_hint
            FROM quiz_questions
            WHERE quiz_id = ?
            ORDER BY section_index ASC
          `)
          .all(quizRow.id) as Array<{
            id: string;
            section_index: number;
            question: string;
            cloze_hint: string | null;
          }>;

        latestQuiz = {
          id: quizRow.id,
          studyEntryId: quizRow.study_entry_id,
          title: quizRow.title,
          topic: quizRow.topic,
          status: quizRow.status as 'pending' | 'completed',
          totalQuestions: quizRow.total_questions,
          score: quizRow.score,
          weakSections: JSON.parse(quizRow.weak_sections || '[]'),
          questions: questions.map((q) => ({
            id: q.id,
            sectionIndex: q.section_index,
            question: q.question,
            clozeHint: q.cloze_hint || undefined,
          })),
          createdAt: quizRow.created_at,
        };
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        ...job,
        latestQuiz,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Falha ao consultar status da ingestão';
    console.error('API /api/study/ingest GET error:', error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}