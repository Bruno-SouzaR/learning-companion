import { describe, it, expect, vi, beforeEach } from 'vitest';
import { evaluateUserAnswer, evaluateSingleQuestionAttempt, getQuestionAttempts } from '@/server/quiz-engine';
import { getDb } from '@/server/db';
import * as llmModule from '@/server/llm';

describe('Unit: Semantic Evaluation & Question Attempts', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('awards 100% immediately for exact matches without calling the LLM', async () => {
    const spy = vi.spyOn(llmModule, 'callLlmJson');

    const result = await evaluateUserAnswer({
      question: 'O que é um superbloco?',
      expectedAnswer: 'Metadados globais do sistema de arquivos.',
      userAnswer: 'Metadados globais do sistema de arquivos.',
    });

    expect(result.score_percentage).toBe(100);
    expect(result.is_correct).toBe(true);
    expect(result.what_was_good).toContain('exata');
    expect(spy).not.toHaveBeenCalled();
  });

  it('assigns 0% for empty or whitespace answers', async () => {
    const spy = vi.spyOn(llmModule, 'callLlmJson');

    const result = await evaluateUserAnswer({
      question: 'O que é um superbloco?',
      expectedAnswer: 'Metadados globais do sistema de arquivos.',
      userAnswer: '   ',
    });

    expect(result.score_percentage).toBe(0);
    expect(result.is_correct).toBe(false);
    expect(result.what_was_missing).toContain('Nenhuma resposta');
    expect(spy).not.toHaveBeenCalled();
  });

  it('evaluates conceptual similarity via LLM and accepts rephrased answers', async () => {
    vi.spyOn(llmModule, 'callLlmJson').mockResolvedValueOnce({
      score_percentage: 85,
      is_correct: true,
      what_was_good: 'Você explicou com precisão que o CRON roda em background e não tem terminal interativo.',
      what_was_missing: 'Poderia ter mencionado que o processo fica travado aguardando o descritor de entrada.',
      misconceptions_feedback: '',
    });

    const result = await evaluateUserAnswer({
      question: 'Por que sudo no CRON falha?',
      expectedAnswer: 'O CRON não possui interface gráfica ou prompt de senha interativo.',
      userAnswer: 'O CRON não tem tela nem prompt para colocar senha, travando o comando.',
    });

    expect(result.score_percentage).toBe(85);
    expect(result.is_correct).toBe(true);
    expect(result.what_was_good).toContain('CRON');
  });

  it('records sequential attempts in question_attempts timeline', async () => {
    const db = getDb();
    const quizId = `quiz_att_${Date.now()}`;
    const entryId = `entry_att_${Date.now()}`;
    const questionId = `q_att_${Date.now()}`;

    db.prepare(`
      INSERT INTO study_quizzes (id, study_entry_id, title, topic, status, total_questions, created_at, updated_at)
      VALUES (?, ?, 'Quiz Test', 'Sistemas', 'pending', 1, datetime('now'), datetime('now'))
    `).run(quizId, entryId);

    db.prepare(`
      INSERT INTO quiz_questions (id, quiz_id, section_index, question, expected_answer, created_at)
      VALUES (?, ?, 1, 'O que é um inode?', 'Estrutura que armazena atributos e ponteiros de blocos do arquivo.', datetime('now'))
    `).run(questionId, quizId);

    // Mock LLM evaluation for attempt 1
    vi.spyOn(llmModule, 'callLlmJson')
      .mockResolvedValueOnce({
        score_percentage: 50,
        is_correct: false,
        what_was_good: 'Você mencionou que guarda informações do arquivo.',
        what_was_missing: 'Faltou mencionar os ponteiros diretos e indiretos para os blocos de dados.',
        misconceptions_feedback: '',
      })
      .mockResolvedValueOnce({
        score_percentage: 95,
        is_correct: true,
        what_was_good: 'Explicação completa com metadados e blocos de dados.',
        what_was_missing: '',
        misconceptions_feedback: '',
      });

    // Attempt 1
    const att1 = await evaluateSingleQuestionAttempt({
      questionId,
      userAnswer: 'Guarda informações do arquivo',
    });
    expect(att1.attemptNumber).toBe(1);
    expect(att1.scorePercentage).toBe(50);
    expect(att1.isCorrect).toBe(false);

    // Attempt 2 (Retry)
    const att2 = await evaluateSingleQuestionAttempt({
      questionId,
      userAnswer: 'É a estrutura do sistema de arquivos que guarda metadados e os ponteiros para os blocos de dados no disco.',
    });
    expect(att2.attemptNumber).toBe(2);
    expect(att2.scorePercentage).toBe(95);
    expect(att2.isCorrect).toBe(true);

    // Verify chronological history
    const history = getQuestionAttempts(questionId);
    expect(history).toHaveLength(2);
    expect(history[0].attemptNumber).toBe(1);
    expect(history[0].scorePercentage).toBe(50);
    expect(history[1].attemptNumber).toBe(2);
    expect(history[1].scorePercentage).toBe(95);
  });
});
