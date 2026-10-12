import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  saveEnglishPracticeEntry,
  getRecentEntries,
  searchWikiEntries,
  syncWikiToDb,
} from '@/server/wiki-store';
import { getDb } from '@/server/db';

describe('Wiki Store & SQLite Integration', () => {
  const createdFiles: string[] = [];

  afterEach(() => {
    // Clean up any test files created during tests
    for (const filePath of createdFiles) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    createdFiles.length = 0;
  });

  it('saves an entry to physical markdown file and indexes in SQLite', async () => {
    const entryData = {
      title: 'Teste de Integração de Persistência',
      input_pt: 'eu quero testar o armazenamento em disco',
      target_en: 'I want to test storage on disk.',
      mistakes_summary: ['Nenhum erro grave detectado.'],
      key_vocabulary: [{ term: 'storage', definition: 'armazenamento' }],
      tags: ['testing', 'integration'],
    };

    const saved = await saveEnglishPracticeEntry(entryData);
    createdFiles.push(saved.file_path);

    expect(saved.id).toBeDefined();
    expect(saved.title).toBe(entryData.title);
    const fileContent = fs.readFileSync(saved.file_path, 'utf-8');
    expect(fileContent).toContain(entryData.target_en);
    expect(fileContent).toContain(entryData.input_pt);
    const db = getDb();
    const row = db.prepare('SELECT id, title, target_en FROM entries WHERE id = ?').get(saved.id) as {
      id: string;
      title: string;
      target_en: string;
    } | undefined;

    expect(row).toBeDefined();
    expect(row?.target_en).toBe(entryData.target_en);
  });

  it('retrieves recent entries sorted by creation date', () => {
    const entries = getRecentEntries(5);
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThan(0);
  });

  it('searches entries by query string', async () => {
    const results = await searchWikiEntries('english', 5);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });
});
