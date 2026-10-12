import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import { POST as handleStart } from '@/app/api/session/start/route';
import { POST as handleTurn } from '@/app/api/session/turn/route';
import { POST as handleEnd } from '@/app/api/session/end/route';
import { GET as handleList } from '@/app/api/session/route';
import { GET as handleQueue } from '@/app/api/review/queue/route';
import { POST as handleSubmitReview } from '@/app/api/review/submit/route';

describe('Integration: Session & Review API Handlers', () => {
  const createdFiles: string[] = [];

  afterEach(() => {
    for (const filePath of createdFiles) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    createdFiles.length = 0;
  });

  describe('Session Lifecycle Endpoints', () => {
    it('creates a session, logs turns, and ends with physical report generation', async () => {
      // 1. POST /api/session/start
      const startReq = new Request('http://localhost:3000/api/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Sessão API Test',
          module: 'studies',
          topic: 'Arquitetura de Software',
          objective: 'Aprender microsserviços',
        }),
      });

      const startRes = await handleStart(startReq);
      expect(startRes.status).toBe(200);

      const startJson = await startRes.json();
      expect(startJson.success).toBe(true);
      const sessionId = startJson.data.id;

      // 2. POST /api/session/turn
      const turnReq = new Request('http://localhost:3000/api/session/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          role: 'user',
          content: 'O que é um API Gateway?',
        }),
      });

      const turnRes = await handleTurn(turnReq);
      expect(turnRes.status).toBe(200);

      const turnJson = await turnRes.json();
      expect(turnJson.success).toBe(true);
      expect(turnJson.data.turn.token_estimate).toBeGreaterThan(0);

      // 3. GET /api/session
      const listReq = new Request('http://localhost:3000/api/session?module=studies');
      const listRes = await handleList(listReq);
      expect(listRes.status).toBe(200);

      const listJson = await listRes.json();
      expect(listJson.success).toBe(true);
      expect(listJson.data.some((s: { id: string }) => s.id === sessionId)).toBe(true);

      // 4. POST /api/session/end
      const endReq = new Request('http://localhost:3000/api/session/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          takeaways: ['API Gateway centraliza roteamento e auth.'],
          keyRules: [{ title: 'Regra API Gateway', content: 'Centralizar autenticação e rate limiting.' }],
        }),
      });

      const endRes = await handleEnd(endReq);
      expect(endRes.status).toBe(200);

      const endJson = await endRes.json();
      expect(endJson.success).toBe(true);
      expect(endJson.data.session.status).toBe('completed');

      if (endJson.data.episodicPath) createdFiles.push(endJson.data.episodicPath);
      if (endJson.data.semanticPaths) createdFiles.push(...endJson.data.semanticPaths);
    });

    it('rejects invalid inputs on start and turn with 400', async () => {
      const invalidStart = new Request('http://localhost:3000/api/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '' }),
      });
      const resStart = await handleStart(invalidStart);
      expect(resStart.status).toBe(400);

      const invalidTurn = new Request('http://localhost:3000/api/session/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: '', role: 'user', content: '' }),
      });
      const resTurn = await handleTurn(invalidTurn);
      expect(resTurn.status).toBe(400);
    });
  });

  describe('Review Queue Endpoints', () => {
    it('returns review queue and overview metrics', async () => {
      const req = new Request('http://localhost:3000/api/review/queue');
      const res = await handleQueue(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data.items)).toBe(true);
      expect(json.data.overview.totalItems).toBeDefined();
    });

    it('validates review submission input boundaries', async () => {
      const invalidReview = new Request('http://localhost:3000/api/review/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId: 'test', quality: 10 }), // max is 5
      });

      const res = await handleSubmitReview(invalidReview);
      expect(res.status).toBe(400);
    });
  });
});
