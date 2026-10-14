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

export interface QuestionAttempt {
  id: string;
  questionId: string;
  quizId: string;
  studyEntryId: string;
  attemptNumber: number;
  userAnswer: string;
  scorePercentage: number;
  isCorrect: boolean;
  whatWasGood: string;
  whatWasMissing: string;
  misconceptionsFeedback?: string;
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
    scorePercentage: number;
    whatWasGood: string;
    whatWasMissing: string;
    misconceptionsFeedback?: string;
    feedback: string;
  }>;
}

export const semanticEvaluationSchema = z.object({
  score_percentage: z.number().min(0).max(100).describe('Pontuação percentual de 0 a 100 de precisão e completude conceitual'),
  is_correct: z.boolean().describe('true se a resposta demonstrar domínio dos conceitos essenciais (score >= 70)'),
  what_was_good: z.string().describe('O que o usuário explicou corretamente em português'),
  what_was_missing: z.string().describe('O que faltou ou poderia ser melhor formulado em português'),
  misconceptions_feedback: z.string().default('').describe('Esclarecimento didático caso o usuário tenha afirmado algo incorreto'),
});

export type SemanticEvaluation = z.infer<typeof semanticEvaluationSchema>;
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
    .prepare('SELECT id, title, explanation, tags, version FROM entries WHERE id = ?')
    .get(studyEntryId) as { id: string; title: string; explanation: string; tags: string; version: number } | undefined;

  // Fallback 1: Lookup via slug if client passed a slug (respecting latest version)
  if (!entry) {
    entry = db
      .prepare('SELECT id, title, explanation, tags, version FROM entries WHERE slug = ? ORDER BY version DESC LIMIT 1')
      .get(studyEntryId) as { id: string; title: string; explanation: string; tags: string; version: number } | undefined;
  }

  // Fallback 2: Lookup via ingest_jobs if client passed jobId
  if (!entry) {
    const jobRow = db
      .prepare('SELECT entry_id FROM ingest_jobs WHERE id = ?')
      .get(studyEntryId) as { entry_id: string | null } | undefined;

    if (jobRow?.entry_id) {
      entry = db
        .prepare('SELECT id, title, explanation, tags, version FROM entries WHERE id = ?')
        .get(jobRow.entry_id) as { id: string; title: string; explanation: string; tags: string; version: number } | undefined;
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
  `).run(quizId, entry.id, entry.title, topic, generated.questions.length, now, now);

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

  // Fetch study_entry_id for question_attempts records
  const quizRow = db
    .prepare('SELECT study_entry_id FROM study_quizzes WHERE id = ?')
    .get(quizId) as { study_entry_id: string } | undefined;
  const studyEntryId = quizRow?.study_entry_id || '';

  for (const q of questions) {
    const userAnswer = (answers[q.id] || '').trim();
    const evaluation = await evaluateUserAnswer({
      question: q.question,
      expectedAnswer: q.expected_answer,
      userAnswer,
    });

    if (evaluation.is_correct) {
      score += 1;
    } else {
      sectionFailureCounts[q.section_index] = (sectionFailureCounts[q.section_index] || 0) + 1;
    }

    const feedback = evaluation.what_was_good
      ? evaluation.what_was_good
      : evaluation.what_was_missing || 'Conceito avaliado.';

    // Save or update latest question row
    db.prepare(`
      UPDATE quiz_questions
      SET user_answer = ?,
          is_correct = ?,
          score_percentage = ?,
          what_was_good = ?,
          what_was_missing = ?,
          misconceptions_feedback = ?,
          feedback = ?
      WHERE id = ?
    `).run(
      userAnswer,
      evaluation.is_correct ? 1 : 0,
      evaluation.score_percentage,
      evaluation.what_was_good,
      evaluation.what_was_missing,
      evaluation.misconceptions_feedback || '',
      feedback,
      q.id
    );

    // Record permanent attempt in question_attempts history timeline
    if (userAnswer.length > 0) {
      const prevAttempts = db
        .prepare('SELECT COUNT(*) as count FROM question_attempts WHERE question_id = ?')
        .get(q.id) as { count: number };
      const attemptNumber = (prevAttempts?.count || 0) + 1;
      const attemptId = `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO question_attempts (
          id, question_id, quiz_id, study_entry_id, attempt_number, user_answer,
          score_percentage, is_correct, what_was_good, what_was_missing, misconceptions_feedback, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        attemptId,
        q.id,
        quizId,
        studyEntryId,
        attemptNumber,
        userAnswer,
        evaluation.score_percentage,
        evaluation.is_correct ? 1 : 0,
        evaluation.what_was_good,
        evaluation.what_was_missing,
        evaluation.misconceptions_feedback || '',
        now
      );
    }

    results.push({
      questionId: q.id,
      sectionIndex: q.section_index,
      question: q.question,
      userAnswer,
      expectedAnswer: q.expected_answer,
      isCorrect: evaluation.is_correct,
      scorePercentage: evaluation.score_percentage,
      whatWasGood: evaluation.what_was_good,
      whatWasMissing: evaluation.what_was_missing,
      misconceptionsFeedback: evaluation.misconceptions_feedback,
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
 * Evaluate a single user answer conceptually using LLM-as-a-judge with heuristic fallback.
 */
export async function evaluateUserAnswer(params: {
  question: string;
  expectedAnswer: string;
  userAnswer: string;
}): Promise<SemanticEvaluation> {
  const trimmed = params.userAnswer.trim();
  if (!trimmed) {
    return {
      score_percentage: 0,
      is_correct: false,
      what_was_good: '',
      what_was_missing: 'Nenhuma resposta foi enviada. Revise a resposta esperada para consolidar o conceito.',
      misconceptions_feedback: '',
    };
  }

  if (isExactMatch(params.expectedAnswer, trimmed)) {
    return {
      score_percentage: 100,
      is_correct: true,
      what_was_good: 'Resposta exata e idêntica ao conceito esperado!',
      what_was_missing: '',
      misconceptions_feedback: '',
    };
  }

  try {
    const evaluation = await callLlmJson({
      messages: [
        {
          role: 'system',
          content: `You are a rigorous and encouraging Computer Science pedagogical evaluator.
Analyze the student's answer against the expected answer for a study question.

CRITICAL EVALUATION RULES:
1. DO NOT require exact word-by-word matches. Evaluate whether the student conceptually understood the answer.
2. If the user explained the underlying mechanism in their own words or with synonyms (even if informal), give generous credit (e.g. 70-100%).
3. Award score_percentage from 0 to 100:
   - 90-100%: Accurate and complete conceptual understanding.
   - 70-89%: Core concept is correct, though minor terminology or precision could be improved.
   - 40-69%: Partially correct, touched on the idea but missed the main mechanism.
   - 0-39%: Incorrect, unrelated, or conceptually wrong.
4. Set is_correct to true if score_percentage >= 70, otherwise false.
5. Provide all feedback strictly in Brazilian Portuguese (PT-BR). NUNCA use espanhol.
   - what_was_good: Explain in Portuguese what the student got right.
   - what_was_missing: Explain constructively what could be improved or added.
   - misconceptions_feedback: If the student stated something technically false, explain why it is wrong and clarify the true concept.`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            question: params.question,
            expected_answer: params.expectedAnswer,
            student_answer: trimmed,
          }),
        },
      ],
      schema: semanticEvaluationSchema,
      temperature: 0.1,
    });
    if (evaluation && typeof evaluation.score_percentage === 'number') {
      return evaluation;
    }
    throw new Error('Invalid evaluation payload');
  } catch {
    // Graceful fallback to keyword overlap if LLM is unreachable or in un-mocked unit tests
    const expectedWords = params.expectedAnswer
      .toLowerCase()
      .replace(/[.,!?;:]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3);
    const userLower = trimmed.toLowerCase();
    const matchedCount = expectedWords.filter((w) => userLower.includes(w)).length;
    const ratio = expectedWords.length > 0 ? matchedCount / expectedWords.length : 0;
    const score = Math.round(ratio * 100);
    const isCorrect = score >= 50;

    return {
      score_percentage: isCorrect ? Math.max(70, score) : score,
      is_correct: isCorrect,
      what_was_good: isCorrect ? 'Você cobriu conceitos fundamentais da resposta esperada.' : '',
      what_was_missing: isCorrect ? '' : 'Faltaram conceitos essenciais da resposta esperada.',
      misconceptions_feedback: '',
    };
  }
}

/**
 * Evaluate an individual question attempt (e.g. retry from Caderno timeline) and record in history.
 */
export async function evaluateSingleQuestionAttempt(params: {
  questionId: string;
  userAnswer: string;
}): Promise<QuestionAttempt> {
  const db = getDb();
  const q = db
    .prepare(`
      SELECT qq.id, qq.quiz_id, qq.question, qq.expected_answer, qq.section_index, sq.study_entry_id
      FROM quiz_questions qq
      JOIN study_quizzes sq ON qq.quiz_id = sq.id
      WHERE qq.id = ?
    `)
    .get(params.questionId) as {
      id: string;
      quiz_id: string;
      question: string;
      expected_answer: string;
      section_index: number;
      study_entry_id: string;
    } | undefined;

  if (!q) {
    throw new Error(`Question ${params.questionId} not found`);
  }

  const evaluation = await evaluateUserAnswer({
    question: q.question,
    expectedAnswer: q.expected_answer,
    userAnswer: params.userAnswer,
  });

  const prevAttempts = db
    .prepare('SELECT COUNT(*) as count FROM question_attempts WHERE question_id = ?')
    .get(q.id) as { count: number };
  const attemptNumber = (prevAttempts?.count || 0) + 1;

  const attemptId = `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO question_attempts (
      id, question_id, quiz_id, study_entry_id, attempt_number, user_answer,
      score_percentage, is_correct, what_was_good, what_was_missing, misconceptions_feedback, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    attemptId,
    q.id,
    q.quiz_id,
    q.study_entry_id,
    attemptNumber,
    params.userAnswer.trim(),
    evaluation.score_percentage,
    evaluation.is_correct ? 1 : 0,
    evaluation.what_was_good,
    evaluation.what_was_missing,
    evaluation.misconceptions_feedback || '',
    now
  );

  const feedback = evaluation.what_was_good
    ? evaluation.what_was_good
    : evaluation.what_was_missing || 'Avaliação registrada.';

  db.prepare(`
    UPDATE quiz_questions
    SET user_answer = ?,
        is_correct = ?,
        score_percentage = ?,
        what_was_good = ?,
        what_was_missing = ?,
        misconceptions_feedback = ?,
        feedback = ?
    WHERE id = ?
  `).run(
    params.userAnswer.trim(),
    evaluation.is_correct ? 1 : 0,
    evaluation.score_percentage,
    evaluation.what_was_good,
    evaluation.what_was_missing,
    evaluation.misconceptions_feedback || '',
    feedback,
    q.id
  );

  return {
    id: attemptId,
    questionId: q.id,
    quizId: q.quiz_id,
    studyEntryId: q.study_entry_id,
    attemptNumber,
    userAnswer: params.userAnswer.trim(),
    scorePercentage: evaluation.score_percentage,
    isCorrect: evaluation.is_correct,
    whatWasGood: evaluation.what_was_good,
    whatWasMissing: evaluation.what_was_missing,
    misconceptionsFeedback: evaluation.misconceptions_feedback || '',
    createdAt: now,
  };
}

/**
 * Get full chronological attempt history for a specific question.
 */
export function getQuestionAttempts(questionId: string): QuestionAttempt[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM question_attempts WHERE question_id = ? ORDER BY attempt_number ASC')
    .all(questionId) as Array<{
      id: string;
      question_id: string;
      quiz_id: string;
      study_entry_id: string;
      attempt_number: number;
      user_answer: string;
      score_percentage: number;
      is_correct: number;
      what_was_good: string | null;
      what_was_missing: string | null;
      misconceptions_feedback: string | null;
      created_at: string;
    }>;

  return rows.map((r) => ({
    id: r.id,
    questionId: r.question_id,
    quizId: r.quiz_id,
    studyEntryId: r.study_entry_id,
    attemptNumber: r.attempt_number,
    userAnswer: r.user_answer,
    scorePercentage: r.score_percentage,
    isCorrect: Boolean(r.is_correct),
    whatWasGood: r.what_was_good || '',
    whatWasMissing: r.what_was_missing || '',
    misconceptionsFeedback: r.misconceptions_feedback || '',
    createdAt: r.created_at,
  }));
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
