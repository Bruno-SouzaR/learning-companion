import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import {
  createSession,
  recordTurn,
  compactSession,
  endSession,
  getSession,
  listSessions,
} from '@/server/session-manager';
import { getDb } from '@/server/db';

describe('Integration: SessionManager Lifecycle & Tiered Wiki Persistence', () => {
  const createdFiles: string[] = [];

  afterEach(() => {
    for (const filePath of createdFiles) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    createdFiles.length = 0;
  });

  it('executes full study session lifecycle with compaction and 3-tier persistence', async () => {
    // 1. Create Session
    const session = createSession({
      title: 'Estudo de Transações ACID e Isolamento',
      module: 'studies',
      topic: 'Databases',
      objective: 'Dominar os 4 níveis de isolamento ANSI SQL',
    });

    expect(session.id).toBeDefined();
    expect(session.status).toBe('active');
    expect(session.checkpoint?.current_goal).toBe('Dominar os 4 níveis de isolamento ANSI SQL');

    // 2. Record Turns
    const turn1 = recordTurn(session.id, {
      role: 'user',
      content: 'Qual a diferença entre Read Committed e Repeatable Read?',
    });
    expect(turn1.id).toBeDefined();
    expect(turn1.token_estimate).toBeGreaterThan(0);

    const turn2 = recordTurn(session.id, {
      role: 'assistant',
      content: 'Read Committed evita dirty reads, enquanto Repeatable Read também evita non-repeatable reads.',
    });
    expect(turn2.role).toBe('assistant');

    // Verify DB reflection
    const sessionAfterTurns = getSession(session.id);
    expect(sessionAfterTurns?.total_turns).toBe(2);
    expect(sessionAfterTurns?.total_tokens).toBeGreaterThan(0);

    // 3. Compact Session
    const compacted = compactSession(session.id, {
      mastered_concepts: ['Read Committed', 'Dirty Reads'],
      weak_points: ['Phantom Reads'],
      last_turn_summary: 'Usuário compreendeu dirty reads e não-repetíveis.',
    });

    expect(compacted.checkpoint?.mastered_concepts).toContain('Dirty Reads');
    expect(compacted.total_tokens).toBe(0); // Invariant: tokens reset for active prompt window

    // 4. End Session with Takeaways and Distilled Semantic Rules
    const result = await endSession(session.id, {
      takeaways: [
        'Read Committed é o padrão no PostgreSQL.',
        'Repeatable Read usa snapshots multiversão (MVCC).',
      ],
      keyRules: [
        {
          title: 'Regra de Níveis de Isolamento ACID',
          content: 'Read Uncommitted permite Dirty Reads. Read Committed resolve Dirty Reads. Repeatable Read resolve Non-repeatable Reads. Serializable resolve Phantom Reads.',
        },
      ],
    });

    createdFiles.push(result.episodicPath);
    createdFiles.push(...result.semanticPaths);

    expect(result.session.status).toBe('completed');
    expect(fs.existsSync(result.episodicPath)).toBe(true);
    expect(result.semanticPaths).toHaveLength(1);
    expect(fs.existsSync(result.semanticPaths[0])).toBe(true);

    const episodicContent = fs.readFileSync(result.episodicPath, 'utf-8');
    expect(episodicContent).toContain('Estudo de Transações ACID e Isolamento');
    expect(episodicContent).toContain('Dirty Reads');

    const semanticContent = fs.readFileSync(result.semanticPaths[0], 'utf-8');
    expect(semanticContent).toContain('Regra de Níveis de Isolamento ACID');
    expect(semanticContent).toContain('Read Committed resolve Dirty Reads');
  });

  describe('Edge Cases & Invariants', () => {
    it('throws error when recording turn on non-existent session', () => {
      expect(() => {
        recordTurn('invalid_session_id', { role: 'user', content: 'test' });
      }).toThrow(/not found/i);
    });

    it('throws error when recording turn on already completed session', async () => {
      const session = createSession({
        title: 'Sessão Rápida',
        module: 'english',
        topic: 'Verbos',
        objective: 'Testar encerramento',
      });

      const { episodicPath } = await endSession(session.id);
      createdFiles.push(episodicPath);

      expect(() => {
        recordTurn(session.id, { role: 'user', content: 'tentando falar após encerrar' });
      }).toThrow(/Cannot record turn in session with status "completed"/i);
    });

    it('filters sessions by module and status in listSessions', () => {
      const activeEnglish = createSession({
        title: 'English Active Session',
        module: 'english',
        topic: 'Vocabulary',
        objective: 'Learn new terms',
      });

      const sessions = listSessions({ module: 'english', status: 'active' });
      expect(sessions.length).toBeGreaterThan(0);
      expect(sessions.some((s) => s.id === activeEnglish.id)).toBe(true);
    });
  });
});
