import { describe, it, expect } from 'vitest';
import {
  estimateTokens,
  shouldTriggerCompaction,
  buildPromptContext,
  createSession,
  recordTurn,
  compactSession,
} from '@/server/session-manager';
import type { StudySession } from '@/server/session-manager';

describe('Unit: SessionManager Core Logic', () => {
  describe('estimateTokens', () => {
    it('returns 0 for empty or whitespace-only strings', () => {
      expect(estimateTokens('')).toBe(0);
      expect(estimateTokens('   ')).toBe(0);
    });

    it('returns a positive estimate for non-empty text', () => {
      expect(estimateTokens('hello')).toBeGreaterThanOrEqual(1);
      const text = 'This is an example sentence designed to test token estimation length.';
      expect(estimateTokens(text)).toBeGreaterThanOrEqual(10);
    });
  });

  describe('shouldTriggerCompaction', () => {
    const baseSession: StudySession = {
      id: 'session_mock',
      title: 'Mock Session',
      module: 'studies',
      topic: 'Databases',
      objective: 'Learn SQL',
      status: 'active',
      checkpoint: null,
      total_turns: 2,
      total_tokens: 500,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    it('returns false when session is well below turn and token thresholds', () => {
      expect(shouldTriggerCompaction(baseSession)).toBe(false);
    });

    it('returns true when turn count meets or exceeds maxTurns', () => {
      const highTurnSession: StudySession = {
        ...baseSession,
        total_turns: 6,
      };
      expect(shouldTriggerCompaction(highTurnSession)).toBe(true);
    });

    it('returns true when token count meets or exceeds maxTokens', () => {
      const highTokenSession: StudySession = {
        ...baseSession,
        total_tokens: 3500,
      };
      expect(shouldTriggerCompaction(highTokenSession)).toBe(true);
    });

    it('respects custom threshold options', () => {
      expect(shouldTriggerCompaction(baseSession, { maxTurns: 2 })).toBe(true);
      expect(shouldTriggerCompaction(baseSession, { maxTokens: 400 })).toBe(true);
    });
  });

  describe('buildPromptContext', () => {
    it('returns minimal system prompt for non-existent session', () => {
      const basePrompt = 'You are a tutor.';
      const context = buildPromptContext('non_existent_id', basePrompt);
      expect(context).toHaveLength(1);
      expect(context[0].role).toBe('system');
      expect(context[0].content).toBe(basePrompt);
    });

    it('augments system prompt with active checkpoint and limits recent turns to 2', () => {
      const session = createSession({
        title: 'Unit Test Context Session',
        module: 'english',
        topic: 'Prepositions',
        objective: 'Master in, on, at',
      });

      recordTurn(session.id, { role: 'user', content: 'Turn 1: How do I use "at"?' });
      recordTurn(session.id, { role: 'assistant', content: 'Turn 1 answer: "At" is used for specific times.' });
      recordTurn(session.id, { role: 'user', content: 'Turn 2: And what about "in"?' });
      recordTurn(session.id, { role: 'assistant', content: 'Turn 2 answer: "In" is used for months or years.' });
      recordTurn(session.id, { role: 'user', content: 'Turn 3: Give me an exercise.' });

      compactSession(session.id, {
        mastered_concepts: ['at for specific times'],
        weak_points: ['in vs on'],
        last_turn_summary: 'User understood "at" and is moving to "in".',
      });

      const promptContext = buildPromptContext(session.id, 'You are an English coach.');

      // Invariant: Prompt context must contain system prompt + at most last 2 turns
      expect(promptContext.length).toBeLessThanOrEqual(3);

      const systemMessage = promptContext.find((m) => m.role === 'system');
      expect(systemMessage).toBeDefined();
      expect(systemMessage?.content).toContain('[ACTIVE SESSION CONTEXT]');
      expect(systemMessage?.content).toContain('Master in, on, at');
      expect(systemMessage?.content).toContain('at for specific times');

      // The last user message should be in the context
      const lastMessage = promptContext[promptContext.length - 1];
      expect(lastMessage.content).toBe('Turn 3: Give me an exercise.');
    });
  });
});
