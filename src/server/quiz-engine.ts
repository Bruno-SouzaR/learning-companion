import { z } from 'zod';
import { getDb } from './db';
import { callLlmJson } from './llm';
import { isExactMatch } from '../lib/text-matcher';
import { extractQuizContextSkeleton } from './quiz-context';

export interface QuizQuestion {
  id: string;
  quizId: string;
  sectionIndex: number;
  question: string;
  expectedAnswer: string;
  clozeHint?: string;
  userAnswer?: string | null;
  isCorrect?: boolean | null;
  feedback?: string | null;
}

export interface ClientQuizQuestion {
  id: string;
  sectionIndex: number;
  question: string;
  clozeHint?: string;
}

export interface QuizSession {
  id: string;
  studyEntryId: string;
  title: string;
  topic: string;
  status: 'pending' | 'completed';
  totalQuestions: number;
  score?: number | null;
  weakSections: number[];
  questions: ClientQuizQuestion[];
  createdAt: string;
}

export interface QuizEvaluationResult {
  quizId: string;
  score: number;
  totalQuestions: number;
  percentage: number;
  weakSections: number[];
  results: Array<{
    questionId: string;
    sectionIndex: number;
    question: string;
    userAnswer: string;
    expectedAnswer: string;
    isCorrect: boolean;
    feedback: string;
  }>;
}

const quizGenerationSchema = z.object({
  questions: z.array(
    z.object({
      section_index: z.number().describe('Index of the section this question covers (1, 2, 3...)'),
      question: z.string().describe('Clear conceptual question in Portuguese'),
      expected_answer: z.string().describe('Precise, direct expected answer'),
      cloze_hint: z.string().optional().describe('Optional fill-in-the-blank hint'),
    })
  ),
});

/**
 * Generate an interactive quiz from a summarized study entry.
 * Generates questions based on the dense summary, pre-stores answers in SQLite,
 * and returns client payload with expected answers hidden.
 */
export async function generateQuizFromStudyEntry(
  studyEntryId: string,
  questionCount = 10
): Promise<QuizSession> {
  const db = getDb();
  let entry = db
    .prepare('SELECT id, title, explanation, tags FROM entries WHERE id = ?')
    .get(studyEntryId) as { id: string; title: string; explanation: string; tags: string } | undefined;

  // Fallback 1: Lookup via slug if client passed a slug
  if (!entry) {
    entry = db
      .prepare('SELECT id, title, explanation, tags FROM entries WHERE slug = ?')
      .get(studyEntryId) as { id: string; title: string; explanation: string; tags: string } | undefined;
  }

  // Fallback 2: Lookup via ingest_jobs if client passed jobId
  if (!entry) {
    const jobRow = db
      .prepare('SELECT entry_id FROM ingest_jobs WHERE id = ?')
      .get(studyEntryId) as { entry_id: string | null } | undefined;

    if (jobRow?.entry_id) {
      entry = db
        .prepare('SELECT id, title, explanation, tags FROM entries WHERE id = ?')
        .get(jobRow.entry_id) as { id: string; title: string; explanation: string; tags: string } | undefined;
    }
  }


  if (!entry) {
    throw new Error(`Study entry "${studyEntryId}" not found.`);
  }

  const now = new Date().toISOString();
  const quizId = `quiz_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const prompt = `You are an academic examiner.
Read the provided summarized textbook chapter "${entry.title}".
Generate exactly ${questionCount} high-yield active recall questions testing comprehension.
Distribute the questions evenly across the sections of the chapter.
Output ONLY pure JSON strictly matching this schema:
{
  "questions": [
    {
      "section_index": 1,
      "question": "Pergunta clara em português?",
      "expected_answer": "Resposta técnica direta e objetiva",
      "cloze_hint": "Dica com lacuna opcional"
    }
  ]
}`;

    const condensedContext = extractQuizContextSkeleton(entry.explanation);

    const generated = await callLlmJson({
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: condensedContext },
      ],
      schema: quizGenerationSchema,
      temperature: 0.2,
      maxTokens: 2000,
    });

  const parsedTags: string[] = JSON.parse(entry.tags || '[]');
  const topic = parsedTags[0] || 'Geral';

  // Insert quiz into database
  db.prepare(`
    INSERT INTO study_quizzes (
      id, study_entry_id, title, topic, status, total_questions, score, weak_sections, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'pending', ?, NULL, '[]', ?, ?)
  `).run(quizId, studyEntryId, entry.title, topic, generated.questions.length, now, now);

  const clientQuestions: ClientQuizQuestion[] = [];

  for (let idx = 0; idx < generated.questions.length; idx++) {
    const q = generated.questions[idx];
    const qId = `q_${quizId}_${idx + 1}`;

    db.prepare(`
      INSERT INTO quiz_questions (
        id, quiz_id, section_index, question, expected_answer, cloze_hint, user_answer, is_correct, feedback, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?)
    `).run(qId, quizId, q.section_index, q.question, q.expected_answer, q.cloze_hint || null, now);

    clientQuestions.push({
      id: qId,
      sectionIndex: q.section_index,
      question: q.question,
      clozeHint: q.cloze_hint,
    });
  }

  return {
    id: quizId,
    studyEntryId,
    title: entry.title,
    topic,
    status: 'pending',
    totalQuestions: clientQuestions.length,
    score: null,
    weakSections: [],
    questions: clientQuestions,
    createdAt: now,
  };
}

/**
 * Submit user answers, evaluate against pre-stored expected answers,
 * calculate score, identify weak sections, and reveal correction details.
 */
export async function submitQuizAnswers(
  quizId: string,
  answers: Record<string, string>
): Promise<QuizEvaluationResult> {
  const db = getDb();
  const quiz = db.prepare('SELECT * FROM study_quizzes WHERE id = ?').get(quizId) as
    | { id: string; total_questions: number; status: string }
    | undefined;

  if (!quiz) {
    throw new Error(`Quiz "${quizId}" not found.`);
  }

  const questions = db
    .prepare('SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY section_index ASC')
    .all(quizId) as Array<{
    id: string;
    section_index: number;
    question: string;
    expected_answer: string;
    cloze_hint: string | null;
  }>;

  let score = 0;
  const sectionFailureCounts: Record<number, number> = {};
  const results: QuizEvaluationResult['results'] = [];

  for (const q of questions) {
    const userAnswer = (answers[q.id] || '').trim();
    let isCorrect = false;

    if (userAnswer.length > 0) {
      if (isExactMatch(q.expected_answer, userAnswer)) {
        isCorrect = true;
      } else {
        // Evaluate key concepts overlap
        const expectedWords = q.expected_answer
          .toLowerCase()
          .replace(/[.,!?;:]/g, '')
          .split(/\s+/)
          .filter((w) => w.length > 3);

        const userLower = userAnswer.toLowerCase();
        const matchedCount = expectedWords.filter((w) => userLower.includes(w)).length;
        isCorrect = expectedWords.length > 0 && matchedCount / expectedWords.length >= 0.5;
      }
    }

    if (isCorrect) {
      score += 1;
    } else {
      sectionFailureCounts[q.section_index] = (sectionFailureCounts[q.section_index] || 0) + 1;
    }

    const feedback = isCorrect
      ? 'Correto! Excelente retenção do conceito.'
      : 'Incorreto ou incompleto. Revise o conceito esperado.';

    db.prepare(`
      UPDATE quiz_questions
      SET user_answer = ?, is_correct = ?, feedback = ?
      WHERE id = ?
    `).run(userAnswer, isCorrect ? 1 : 0, feedback, q.id);

    results.push({
      questionId: q.id,
      sectionIndex: q.section_index,
      question: q.question,
      userAnswer,
      expectedAnswer: q.expected_answer,
      isCorrect,
      feedback,
    });
  }

  // Identify sections with errors
  const weakSections = Object.entries(sectionFailureCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([sec]) => Number(sec));

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE study_quizzes
    SET status = 'completed', score = ?, weak_sections = ?, updated_at = ?
    WHERE id = ?
  `).run(score, JSON.stringify(weakSections), now, quizId);

  return {
    quizId,
    score,
    totalQuestions: questions.length,
    percentage: Math.round((score / Math.max(1, questions.length)) * 100),
    weakSections,
    results,
  };
}

/**
 * Generate adaptive reinforcement questions focusing on the user's weakest section.
 */
export async function generateReinforcementQuiz(
  quizId: string,
  weakSectionIndex: number,
  count = 5
): Promise<QuizSession> {
  const db = getDb();
  const quiz = db
    .prepare('SELECT study_entry_id, title FROM study_quizzes WHERE id = ?')
    .get(quizId) as { study_entry_id: string; title: string } | undefined;

  if (!quiz) {
    throw new Error(`Quiz "${quizId}" not found.`);
  }

  const entry = db
    .prepare('SELECT explanation, tags FROM entries WHERE id = ?')
    .get(quiz.study_entry_id) as { explanation: string; tags: string } | undefined;

  if (!entry) {
    throw new Error(`Study entry "${quiz.study_entry_id}" not found.`);
  }

  const now = new Date().toISOString();
  const newQuizId = `quiz_reinf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const prompt = `You are a specialized adaptive tutor.
The student took a test on "${quiz.title}" and made errors in Section ${weakSectionIndex}.
Generate exactly ${count} target questions focusing exclusively on Section ${weakSectionIndex}.
IMPORTANT: Ask questions from different practical angles and real-world scenarios to ensure deep retention.
Output ONLY pure JSON strictly matching this schema:
{
  "questions": [
    {
      "section_index": ${weakSectionIndex},
      "question": "Pergunta focada em português?",
      "expected_answer": "Resposta técnica precisa",
      "cloze_hint": "Dica opcional"
    }
  ]
}`;

  const generated = await callLlmJson({
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: entry.explanation },
    ],
    schema: quizGenerationSchema,
    temperature: 0.3,
    maxTokens: 2000,
  });

  const parsedTags: string[] = JSON.parse(entry.tags || '[]');
  const topic = parsedTags[0] || 'Reforço';

  db.prepare(`
    INSERT INTO study_quizzes (
      id, study_entry_id, title, topic, status, total_questions, score, weak_sections, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'pending', ?, NULL, '[]', ?, ?)
  `).run(newQuizId, quiz.study_entry_id, `${quiz.title} (Reforço Seção ${weakSectionIndex})`, topic, generated.questions.length, now, now);

  const clientQuestions: ClientQuizQuestion[] = [];

  for (let idx = 0; idx < generated.questions.length; idx++) {
    const q = generated.questions[idx];
    const qId = `q_${newQuizId}_${idx + 1}`;

    db.prepare(`
      INSERT INTO quiz_questions (
        id, quiz_id, section_index, question, expected_answer, cloze_hint, user_answer, is_correct, feedback, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?)
    `).run(qId, newQuizId, weakSectionIndex, q.question, q.expected_answer, q.cloze_hint || null, now);

    clientQuestions.push({
      id: qId,
      sectionIndex: weakSectionIndex,
      question: q.question,
      clozeHint: q.cloze_hint,
    });
  }

  return {
    id: newQuizId,
    studyEntryId: quiz.study_entry_id,
    title: `${quiz.title} (Reforço Seção ${weakSectionIndex})`,
    topic,
    status: 'pending',
    totalQuestions: clientQuestions.length,
    score: null,
    weakSections: [],
    questions: clientQuestions,
    createdAt: now,
  };
}
