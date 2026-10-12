import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'cache.db');

let dbInstance: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  dbInstance = new DatabaseSync(DB_PATH);

  // Initialize schema
  dbInstance.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      file_path TEXT NOT NULL,
      module TEXT NOT NULL,
      title TEXT NOT NULL,
      input_pt TEXT,
      target_en TEXT,
      explanation TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      embedding TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_entries_module ON entries(module);
    CREATE INDEX IF NOT EXISTS idx_entries_created_at ON entries(created_at DESC);
  `);

  return dbInstance;
}
