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

    CREATE TABLE IF NOT EXISTS study_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      module TEXT NOT NULL,
      topic TEXT NOT NULL,
      objective TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      checkpoint TEXT,
      total_turns INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      ended_at TEXT
    );

    CREATE TABLE IF NOT EXISTS session_turns (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      token_estimate INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(session_id) REFERENCES study_sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_status ON study_sessions(status);
    CREATE INDEX IF NOT EXISTS idx_turns_session_id ON session_turns(session_id);

    CREATE TABLE IF NOT EXISTS srs_items (
      id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL UNIQUE,
      module TEXT NOT NULL,
      repetitions INTEGER NOT NULL DEFAULT 0,
      interval_days INTEGER NOT NULL DEFAULT 1,
      ease_factor REAL NOT NULL DEFAULT 2.5,
      next_review_at TEXT NOT NULL,
      last_reviewed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(entry_id) REFERENCES entries(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_srs_next_review ON srs_items(next_review_at ASC);
    CREATE INDEX IF NOT EXISTS idx_srs_module ON srs_items(module);

    CREATE TABLE IF NOT EXISTS ingest_jobs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      topic TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      total_sections INTEGER NOT NULL DEFAULT 0,
      completed_sections TEXT NOT NULL DEFAULT '[]',
      file_path TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS study_quizzes (
      id TEXT PRIMARY KEY,
      study_entry_id TEXT NOT NULL,
      title TEXT NOT NULL,
      topic TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      total_questions INTEGER NOT NULL DEFAULT 0,
      score INTEGER,
      weak_sections TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quiz_questions (
      id TEXT PRIMARY KEY,
      quiz_id TEXT NOT NULL,
      section_index INTEGER NOT NULL DEFAULT 0,
      question TEXT NOT NULL,
      expected_answer TEXT NOT NULL,
      cloze_hint TEXT,
      user_answer TEXT,
      is_correct INTEGER,
      feedback TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(quiz_id) REFERENCES study_quizzes(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_status ON ingest_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_quizzes_entry ON study_quizzes(study_entry_id);
    CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz ON quiz_questions(quiz_id);
  `);

  return dbInstance;
}
