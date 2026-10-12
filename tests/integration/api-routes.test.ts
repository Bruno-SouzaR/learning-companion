import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import { POST as handleSave } from '@/app/api/save/route';
import { GET as handleSearch } from '@/app/api/search/route';
import { POST as handleRefine } from '@/app/api/refine/route';

describe('API Route Handlers Integration', () => {
  const createdFiles: string[] = [];

  afterEach(() => {
    for (const filePath of createdFiles) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    createdFiles.length = 0;
  });

  describe('POST /api/save', () => {
    it('rejects invalid or empty payloads with status 400', async () => {
      const req = new Request('http://localhost:3000/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '' }),
      });

      const res = await handleSave(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it('persists valid entries and returns status 200 with saved data', async () => {
      const payload = {
        title: 'API Save Route Integration Test',
        input_pt: 'teste de rota salvar',
        target_en: 'Route save integration test.',
        mistakes_summary: ['Nenhum erro'],
        key_vocabulary: [{ term: 'save', definition: 'salvar' }],
        tags: ['test', 'api'],
      };

      const req = new Request('http://localhost:3000/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res = await handleSave(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.title).toBe(payload.title);

      if (json.data.file_path) {
        createdFiles.push(json.data.file_path);
      }
    });
  });

  describe('GET /api/search', () => {
    it('returns recent entries when query is empty', async () => {
      const req = new Request('http://localhost:3000/api/search');
      const res = await handleSearch(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
    });

    it('returns filtered results when query is provided', async () => {
      const req = new Request('http://localhost:3000/api/search?q=english');
      const res = await handleSearch(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
    });
  });

  describe('POST /api/refine', () => {
    it('rejects empty input string with status 400', async () => {
      const req = new Request('http://localhost:3000/api/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: '   ' }),
      });

      const res = await handleRefine(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('vazio');
    });
  });
});
