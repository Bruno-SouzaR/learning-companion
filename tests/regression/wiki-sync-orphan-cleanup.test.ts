import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { saveEnglishPracticeEntry, syncWikiToDb } from '@/server/wiki-store';
import { getDb } from '@/server/db';

describe('Regression: Wiki Sync Orphan Cleanup', () => {
  it('purges database records when their markdown file is deleted from disk', async () => {
    // 1. Save an entry that creates a file and a row in SQLite
    const entry = await saveEnglishPracticeEntry({
      title: 'Arquivo Temporario Para Teste de Purga',
      input_pt: 'arquivo para ser deletado',
      target_en: 'file to be deleted.',
      mistakes_summary: [],
      key_vocabulary: [],
      tags: ['temp-delete'],
    });

    const db = getDb();

    // Verify row exists in DB
    const beforeCheck = db.prepare('SELECT id FROM entries WHERE id = ?').get(entry.id);
    expect(beforeCheck).toBeDefined();
    expect(fs.existsSync(entry.file_path)).toBe(true);

    // 2. Delete the physical file from disk
    fs.unlinkSync(entry.file_path);
    expect(fs.existsSync(entry.file_path)).toBe(false);

    // 3. Run syncWikiToDb
    await syncWikiToDb();

    // 4. Verify that the orphaned row was cleanly deleted from SQLite
    const afterCheck = db.prepare('SELECT id FROM entries WHERE id = ?').get(entry.id);
    expect(afterCheck).toBeUndefined();
  });
});
