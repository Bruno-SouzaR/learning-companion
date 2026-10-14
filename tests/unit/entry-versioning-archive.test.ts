import { describe, it, expect, beforeEach } from 'vitest';
import { getDb } from '@/server/db';
import { archiveEntry, getRecentEntries, searchWikiEntries } from '@/server/wiki-store';
import { createIngestJob } from '@/server/ingest-job-manager';

describe('Unit: Entry Versioning and Soft-Delete Archival', () => {
  beforeEach(() => {
    const db = getDb();
    db.prepare("DELETE FROM entries WHERE slug LIKE 'test-version%'").run();
  });

  it('soft-deletes an entry by setting status to archived without deleting the row', () => {
    const db = getDb();
    const id = `studies_test_${Date.now()}`;
    const slug = `test-version-archive`;

    db.prepare(`
      INSERT INTO entries (id, slug, file_path, module, title, status, version, created_at, updated_at)
      VALUES (?, ?, '/fake/path.md', 'studies', 'Test Archive', 'active', 1, datetime('now'), datetime('now'))
    `).run(id, slug);

    // Initial check: active
    const activeRecent = getRecentEntries(50).filter((e) => e.id === id);
    expect(activeRecent).toHaveLength(1);

    // Call archiveEntry
    const archived = archiveEntry(id);
    expect(archived).toBe(true);

    // Row still exists in SQLite! (Not deleted)
    const rawRow = db.prepare('SELECT id, status FROM entries WHERE id = ?').get(id) as { id: string; status: string };
    expect(rawRow).toBeDefined();
    expect(rawRow.status).toBe('archived');

    // But query for frontend hides it!
    const hiddenRecent = getRecentEntries(50).filter((e) => e.id === id);
    expect(hiddenRecent).toHaveLength(0);
  });

  it('increments version for subsequent ingest jobs with the same slug', () => {
    const db = getDb();
    const slug = 'test-version-increment';
    const now = new Date().toISOString();

    // Create v1 in DB
    db.prepare(`
      INSERT INTO entries (id, slug, file_path, module, title, status, version, created_at, updated_at)
      VALUES ('entry_v1', ?, '/fake/path.md', 'studies', 'Test Version Increment', 'active', 1, ?, ?)
    `).run(slug, now, now);

    // Create new ingest job with same title
    const jobV2 = createIngestJob({
      title: 'Test Version Increment',
      topic: 'Sistemas',
      totalSections: 2,
    });

    // Job entryId should have v2 suffix
    expect(jobV2.entryId).toContain('test-version-increment_v2');

    // Create v2 in DB
    db.prepare(`
      INSERT INTO entries (id, slug, file_path, module, title, status, version, created_at, updated_at)
      VALUES (?, ?, '/fake/path_v2.md', 'studies', 'Test Version Increment', 'active', 2, ?, ?)
    `).run(jobV2.entryId!, slug, now, now);
    const jobV3 = createIngestJob({
      title: 'Test Version Increment',
      topic: 'Sistemas',
      totalSections: 2,
    });
    expect(jobV3.entryId).toContain('test-version-increment_v3');
  });
});
