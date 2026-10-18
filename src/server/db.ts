import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { getDataDir } from './paths';

let dbInstance: DatabaseSync | null = null;
let dbPathCache: string | null = null;

export function getDbPath(): string {
  if (dbPathCache) return dbPathCache;
  dbPathCache = path.join(getDataDir(), 'cache.db');
  return dbPathCache;
}

export function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance;

  const dataDir = getDataDir();
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  dbInstance = new DatabaseSync(getDbPath());

  // Initialize schema
  dbInstance.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;

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
      status TEXT NOT NULL DEFAULT 'active',
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_entries_module ON entries(module);
    CREATE INDEX IF NOT EXISTS idx_entries_created_at ON entries(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_entries_status ON entries(status);
    CREATE INDEX IF NOT EXISTS idx_entries_slug ON entries(slug);
    CREATE TABLE IF NOT EXISTS study_sessions (
      id TEXT PRIMARY KEY,
      entry_id TEXT,
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
      entry_id TEXT,
      error_message TEXT,
      current_step TEXT,
      started_at TEXT,
      is_dismissed INTEGER DEFAULT 0,
      raw_chunks TEXT DEFAULT '[]',
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
    CREATE TABLE IF NOT EXISTS question_attempts (
      id TEXT PRIMARY KEY,
      question_id TEXT NOT NULL,
      quiz_id TEXT NOT NULL,
      study_entry_id TEXT NOT NULL,
      attempt_number INTEGER NOT NULL DEFAULT 1,
      user_answer TEXT NOT NULL,
      score_percentage INTEGER NOT NULL DEFAULT 0,
      is_correct INTEGER NOT NULL DEFAULT 0,
      what_was_good TEXT,
      what_was_missing TEXT,
      misconceptions_feedback TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(question_id) REFERENCES quiz_questions(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON ingest_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_dismissed ON ingest_jobs(is_dismissed, status);
    CREATE INDEX IF NOT EXISTS idx_quizzes_entry ON study_quizzes(study_entry_id);
    CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz ON quiz_questions(quiz_id);
    CREATE INDEX IF NOT EXISTS idx_attempts_question ON question_attempts(question_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_attempts_entry ON question_attempts(study_entry_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_attempts_quiz ON question_attempts(quiz_id);
  `);

  migrateEntryColumns(dbInstance);
  migrateIngestJobColumns(dbInstance);
  migrateStudySessionColumns(dbInstance);
  migrateQuizQuestionColumns(dbInstance);
  migrateStudyQuizColumns(dbInstance);

  return dbInstance;
}

function migrateStudySessionColumns(db: DatabaseSync): void {
  const columns = db.prepare('PRAGMA table_info(study_sessions)').all() as Array<{ name: string }>;
  const names = new Set(columns.map((c) => c.name));

  if (!names.has('entry_id')) {
    db.exec(`ALTER TABLE study_sessions ADD COLUMN entry_id TEXT;`);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_entry ON study_sessions(entry_id);`);
}

function migrateEntryColumns(db: DatabaseSync): void {
  const columns = db.prepare('PRAGMA table_info(entries)').all() as Array<{ name: string }>;
  const names = new Set(columns.map((c) => c.name));

  if (!names.has('status')) {
    db.exec(`ALTER TABLE entries ADD COLUMN status TEXT DEFAULT 'active';`);
  }
  if (!names.has('version')) {
    db.exec(`ALTER TABLE entries ADD COLUMN version INTEGER DEFAULT 1;`);
  }
}
/**
 * Idempotent migration: adds columns introduced after the table was created
 * (existing local SQLite databases). Safe to run on every boot.
 */
function migrateIngestJobColumns(db: DatabaseSync): void {
  const columns = db.prepare('PRAGMA table_info(ingest_jobs)').all() as Array<{ name: string }>;
  const names = new Set(columns.map((c) => c.name));

  if (!names.has('entry_id')) {
    db.exec(`ALTER TABLE ingest_jobs ADD COLUMN entry_id TEXT;`);
  }
  if (!names.has('current_step')) {
    db.exec(`ALTER TABLE ingest_jobs ADD COLUMN current_step TEXT;`);
  }
  if (!names.has('started_at')) {
    db.exec(`ALTER TABLE ingest_jobs ADD COLUMN started_at TEXT;`);
  }
  if (!names.has('is_dismissed')) {
    db.exec(`ALTER TABLE ingest_jobs ADD COLUMN is_dismissed INTEGER DEFAULT 0;`);
  }
  if (!names.has('raw_chunks')) {
    db.exec(`ALTER TABLE ingest_jobs ADD COLUMN raw_chunks TEXT DEFAULT '[]';`);
  }
}

function migrateStudyQuizColumns(db: DatabaseSync): void {
  const columns = db.prepare('PRAGMA table_info(study_quizzes)').all() as Array<{ name: string }>;
  const names = new Set(columns.map((c) => c.name));

  if (!names.has('current_step')) {
    db.exec(`ALTER TABLE study_quizzes ADD COLUMN current_step TEXT;`);
  }
}

function migrateQuizQuestionColumns(db: DatabaseSync): void {
  const columns = db.prepare('PRAGMA table_info(quiz_questions)').all() as Array<{ name: string }>;
  const columnNames = new Set(columns.map((c) => c.name));

  if (!columnNames.has('score_percentage')) {
    db.exec(`ALTER TABLE quiz_questions ADD COLUMN score_percentage INTEGER DEFAULT 0;`);
  }
  if (!columnNames.has('what_was_good')) {
    db.exec(`ALTER TABLE quiz_questions ADD COLUMN what_was_good TEXT;`);
  }
  if (!columnNames.has('what_was_missing')) {
    db.exec(`ALTER TABLE quiz_questions ADD COLUMN what_was_missing TEXT;`);
  }
  if (!columnNames.has('misconceptions_feedback')) {
    db.exec(`ALTER TABLE quiz_questions ADD COLUMN misconceptions_feedback TEXT;`);
  }
}