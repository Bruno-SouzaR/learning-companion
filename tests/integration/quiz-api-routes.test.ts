import { describe, it, expect, vi, afterEach } from 'vitest';
import { POST as handleGenerate } from '@/app/api/study/quiz/generate/route';
import { POST as handleSubmit } from '@/app/api/study/quiz/submit/route';
import { POST as handleReinforce } from '@/app/api/study/quiz/reinforce/route';
import * as quizEngine from '@/server/quiz-engine';

describe('Integration: Quiz Engine API Handlers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/study/quiz/generate', () => {
    it('returns 200 with generated quiz session on valid request', async () => {
      vi.spyOn(quizEngine, 'generateQuizFromStudyEntry').mockResolvedValue({
        id: 'quiz_123',
        studyEntryId: 'entry_123',
        title: 'Quiz de Teste',
        topic: 'Testes',
        status: 'pending',
        totalQuestions: 2,
        weakSections: [],
        questions: [
          { id: 'q1', sectionIndex: 1, question: 'Pergunta 1' },
          { id: 'q2', sectionIndex: 2, question: 'Pergunta 2' },
        ],
        createdAt: new Date().toISOString(),
      });

      const req = new Request('http://localhost:3000/api/study/quiz/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studyEntryId: 'entry_123', questionCount: 2 }),
      });

      const res = await handleGenerate(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe('quiz_123');
      expect(json.data.questions).toHaveLength(2);
    });

    it('rejects missing studyEntryId with 400', async () => {
      const req = new Request('http://localhost:3000/api/study/quiz/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studyEntryId: '' }),
      });

      const res = await handleGenerate(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBeDefined();
    });
  });

  describe('POST /api/study/quiz/submit', () => {
    it('returns 200 with evaluation metrics on valid submission', async () => {
      vi.spyOn(quizEngine, 'submitQuizAnswers').mockResolvedValue({
        quizId: 'quiz_123',
        score: 2,
        totalQuestions: 2,
        percentage: 100,
        weakSections: [],
        results: [
          {
            questionId: 'q1',
            sectionIndex: 1,
            question: 'P1',
            userAnswer: 'R1',
            expectedAnswer: 'R1',
            isCorrect: true,
            feedback: 'Excelente',
          },
        ],
      });

      const req = new Request('http://localhost:3000/api/study/quiz/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quizId: 'quiz_123', answers: { q1: 'R1' } }),
      });

      const res = await handleSubmit(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.score).toBe(2);
      expect(json.data.percentage).toBe(100);
    });

    it('rejects missing quizId with 400', async () => {
      const req = new Request('http://localhost:3000/api/study/quiz/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quizId: '', answers: {} }),
      });

      const res = await handleSubmit(req);
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/study/quiz/reinforce', () => {
    it('returns 200 with targeted reinforcement quiz session', async () => {
      vi.spyOn(quizEngine, 'generateReinforcementQuiz').mockResolvedValue({
        id: 'quiz_reinf_123',
        studyEntryId: 'entry_123',
        title: 'Quiz Reforço',
        topic: 'Reforço',
        status: 'pending',
        totalQuestions: 5,
        weakSections: [],
        questions: [{ id: 'qr1', sectionIndex: 2, question: 'Pergunta de reforço' }],
        createdAt: new Date().toISOString(),
      });

      const req = new Request('http://localhost:3000/api/study/quiz/reinforce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quizId: 'quiz_123', weakSectionIndex: 2, count: 5 }),
      });

      const res = await handleReinforce(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe('quiz_reinf_123');
    });

    it('rejects missing weakSectionIndex with 400', async () => {
      const req = new Request('http://localhost:3000/api/study/quiz/reinforce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quizId: 'quiz_123' }),
      });

      const res = await handleReinforce(req);
      expect(res.status).toBe(400);
    });
  });
});
