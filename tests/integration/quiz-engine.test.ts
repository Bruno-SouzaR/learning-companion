import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  generateQuizFromStudyEntry,
  submitQuizAnswers,
  generateReinforcementQuiz,
} from '@/server/quiz-engine';
import * as llmModule from '@/server/llm';
import { getDb } from '@/server/db';

describe('Integration: QuizEngine & Adaptive Reinforcement', () => {
  const db = getDb();
  const testEntryId = `entry_test_${Date.now()}`;

  // Insert mock study entry into entries table for the quiz engine to query
  db.prepare(`
    INSERT OR REPLACE INTO entries (
      id, slug, file_path, module, title, input_pt, target_en, explanation, tags, created_at, updated_at
    ) VALUES (?, ?, ?, 'studies', ?, NULL, NULL, ?, ?, ?, ?)
  `).run(
    testEntryId,
    'teste-quiz',
    '/mock/path.md',
    'Capítulo de Redes de Computadores',
    '## 1. Camada de Transporte\nTCP oferece controle de fluxo e confiabilidade através de handshake triplo.\n\n## 2. Camada de Rede\nO protocolo IP realiza roteamento de pacotes através de tabelas de rotas.',
    JSON.stringify(['redes', 'tcp-ip']),
    new Date().toISOString(),
    new Date().toISOString()
  );

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('generates a quiz with hidden answers on the client payload and saves questions to SQLite', async () => {
    vi.spyOn(llmModule, 'callLlmJson').mockResolvedValue({
      questions: [
        {
          section_index: 1,
          question: 'Qual o papel do handshake triplo no TCP?',
          expected_answer: 'Estabelecer sincronização de números de sequência e alocação de buffers.',
          cloze_hint: 'Estabelecer [sincronização] no TCP',
        },
        {
          section_index: 2,
          question: 'O que o protocolo IP faz na camada de rede?',
          expected_answer: 'Roteamento e endereçamento lógico de pacotes.',
        },
      ],
    });

    const quizSession = await generateQuizFromStudyEntry(testEntryId, 2);

    expect(quizSession.id).toBeDefined();
    expect(quizSession.title).toBe('Capítulo de Redes de Computadores');
    expect(quizSession.totalQuestions).toBe(2);
    expect(quizSession.questions).toHaveLength(2);

    // CRITICAL SECURITY INVARIANT: Client questions must NOT contain expectedAnswer!
    for (const q of quizSession.questions) {
      expect((q as unknown as Record<string, unknown>).expectedAnswer).toBeUndefined();
      expect(q.question).toBeDefined();
    }

    // Verify questions were persisted in SQLite
    const stored = db.prepare('SELECT id, question, expected_answer FROM quiz_questions WHERE quiz_id = ?').all(quizSession.id);
    expect(stored).toHaveLength(2);
  });

  it('evaluates submitted answers, computes score, and identifies weak sections', async () => {
    vi.spyOn(llmModule, 'callLlmJson').mockResolvedValue({
      questions: [
        {
          section_index: 1,
          question: 'Defina controle de fluxo.',
          expected_answer: 'Mecanismo que impede o transmissor de sobrecarregar o receptor.',
        },
        {
          section_index: 2,
          question: 'O que é TTL no cabeçalho IP?',
          expected_answer: 'Time to Live evita que pacotes circulem em loops infinitos.',
        },
      ],
    });

    const quizSession = await generateQuizFromStudyEntry(testEntryId, 2);
    const q1Id = quizSession.questions[0].id;
    const q2Id = quizSession.questions[1].id;

    // Submit 1 correct and 1 incorrect answer
    const evaluation = await submitQuizAnswers(quizSession.id, {
      [q1Id]: 'Mecanismo que impede o transmissor de sobrecarregar o receptor.', // Correct
      [q2Id]: 'Uma porta serial física', // Completely wrong
    });

    expect(evaluation.score).toBe(1);
    expect(evaluation.totalQuestions).toBe(2);
    expect(evaluation.percentage).toBe(50);

    // Weak sections must flag Section 2
    expect(evaluation.weakSections).toContain(2);

    // Results array reveals expected answers
    const q2Result = evaluation.results.find((r) => r.questionId === q2Id);
    expect(q2Result?.isCorrect).toBe(false);
    expect(q2Result?.expectedAnswer).toContain('Time to Live');
  });

  it('generates an adaptive reinforcement quiz targeting the identified weak section', async () => {
    vi.spyOn(llmModule, 'callLlmJson').mockResolvedValue({
      questions: [
        {
          section_index: 2,
          question: 'Pergunta focada de reforço: Por que o TTL é decrementado a cada roteador?',
          expected_answer: 'Para descartar o pacote quando o valor chega a zero, quebrando loops de roteamento.',
        },
      ],
    });

    // Mock an existing completed quiz
    const existingQuizId = `quiz_mock_${Date.now()}`;
    db.prepare(`
      INSERT INTO study_quizzes (
        id, study_entry_id, title, topic, status, total_questions, score, weak_sections, created_at, updated_at
      ) VALUES (?, ?, 'Quiz Anterior', 'Redes', 'completed', 2, 1, '[2]', ?, ?)
    `).run(existingQuizId, testEntryId, new Date().toISOString(), new Date().toISOString());

    const reinforcement = await generateReinforcementQuiz(existingQuizId, 2, 1);

    expect(reinforcement.id).toBeDefined();
    expect(reinforcement.title).toContain('Reforço Seção 2');
    expect(reinforcement.questions).toHaveLength(1);
    expect(reinforcement.questions[0].sectionIndex).toBe(2);
  });

  describe('Edge Cases', () => {
    it('throws error when studyEntryId is not found', async () => {
      await expect(generateQuizFromStudyEntry('invalid_entry_123', 5)).rejects.toThrow(/not found/i);
    });

    it('throws error when quizId is not found on submit', async () => {
      await expect(submitQuizAnswers('invalid_quiz_123', {})).rejects.toThrow(/not found/i);
    });
  });
});
