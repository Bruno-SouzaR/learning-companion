import { describe, it, expect, beforeEach } from 'vitest';
import { GET as handleHistory } from '@/app/api/study/tutor/history/route';
import { POST as handleChat } from '@/app/api/study/tutor/chat/route';
import { createSession, recordTurn } from '@/server/session-manager';
import { getDb } from '@/server/db';

describe('Integration: Study Tutor Chat & History API Routes', () => {
  beforeEach(() => {
    const db = getDb();
    db.prepare("DELETE FROM session_turns WHERE session_id LIKE 'session_test%'").run();
    db.prepare("DELETE FROM study_sessions WHERE id LIKE 'session_test%'").run();
  });

  describe('GET /api/study/tutor/history', () => {
    it('returns 404 when session ID is not found', async () => {
      const req = new Request('http://localhost:3000/api/study/tutor/history?sessionId=non_existent_123');
      const res = await handleHistory(req);
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('não encontrada');
    });

    it('returns session and turns when session ID exists', async () => {
      const session = createSession({
        title: 'Sessão Teste Tutor',
        module: 'studies',
        topic: 'Otimização Linear',
        objective: 'Tirar dúvidas',
      });

      recordTurn(session.id, {
        role: 'user',
        content: 'O que é o Método Simplex?',
      });

      recordTurn(session.id, {
        role: 'assistant',
        content: 'O Método Simplex é um algoritmo de otimização...',
      });

      const req = new Request(`http://localhost:3000/api/study/tutor/history?sessionId=${session.id}`);
      const res = await handleHistory(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.session.id).toBe(session.id);
      expect(json.data.turns).toHaveLength(2);
      expect(json.data.turns[0].role).toBe('user');
      expect(json.data.turns[1].role).toBe('assistant');
    });

    it('returns list of study sessions when list=true is supplied', async () => {
      createSession({
        title: 'Sessão A',
        module: 'studies',
        topic: 'Tópico A',
        objective: 'Obj A',
      });

      const req = new Request('http://localhost:3000/api/study/tutor/history?list=true');
      const res = await handleHistory(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.sessions.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('POST /api/study/tutor/chat', () => {
    it('rejects empty messages with HTTP 400', async () => {
      const req = new Request('http://localhost:3000/api/study/tutor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: '   ' }),
      });

      const res = await handleChat(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('não pode estar vazia');
    });
  });
});
