import { getDb } from './db';

export interface SrsItem {
  id: string;
  entry_id: string;
  module: 'english' | 'studies';
  repetitions: number;
  interval_days: number;
  ease_factor: number;
  next_review_at: string;
  last_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SrsDueItem {
  id: string;
  entry_id: string;
  module: string;
  title: string;
  input_pt: string | null;
  target_en: string | null;
  explanation: string | null;
  tags: string[];
  repetitions: number;
  interval_days: number;
  ease_factor: number;
  next_review_at: string;
}

export interface SrsOverview {
  totalItems: number;
  dueToday: number;
  masteredItems: number;
}

/**
 * Pure SM-2 spaced repetition calculation.
 * Quality rating: 0 (blackout) to 5 (perfect recall).
 */
export function calculateSm2(
  current: { repetitions: number; intervalDays: number; easeFactor: number },
  quality: number,
  now: Date = new Date()
): {
  repetitions: number;
  intervalDays: number;
  easeFactor: number;
  nextReviewAt: string;
} {
  const q = Math.max(0, Math.min(5, Math.round(quality)));
  let repetitions = current.repetitions;
  let intervalDays = current.intervalDays;
  let easeFactor = current.easeFactor;

  if (q >= 3) {
    if (repetitions === 0) {
      intervalDays = 1;
    } else if (repetitions === 1) {
      intervalDays = 6;
    } else {
      intervalDays = Math.max(1, Math.round(intervalDays * easeFactor));
    }
    repetitions += 1;
  } else {
    // Reset streak on failure
    repetitions = 0;
    intervalDays = 1;
  }

  // Calculate new Ease Factor: EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  const delta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
  easeFactor = Math.max(1.3, Number((easeFactor + delta).toFixed(2)));

  const nextDate = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);

  return {
    repetitions,
    intervalDays,
    easeFactor,
    nextReviewAt: nextDate.toISOString(),
  };
}

/**
 * Schedule a new knowledge entry into the SRS queue.
 */
export function scheduleNewEntry(
  entryId: string,
  module: 'english' | 'studies',
  initialIntervalDays = 1
): SrsItem {
  const db = getDb();
  const now = new Date();
  const id = `srs_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const nextReviewDate = new Date(now.getTime() + initialIntervalDays * 24 * 60 * 60 * 1000).toISOString();
  const nowIso = now.toISOString();

  db.prepare(`
    INSERT OR REPLACE INTO srs_items (
      id, entry_id, module, repetitions, interval_days, ease_factor, next_review_at, last_reviewed_at, created_at, updated_at
    ) VALUES (?, ?, ?, 0, ?, 2.5, ?, NULL, ?, ?)
  `).run(id, entryId, module, initialIntervalDays, nextReviewDate, nowIso, nowIso);

  return {
    id,
    entry_id: entryId,
    module,
    repetitions: 0,
    interval_days: initialIntervalDays,
    ease_factor: 2.5,
    next_review_at: nextReviewDate,
    last_reviewed_at: null,
    created_at: nowIso,
    updated_at: nowIso,
  };
}

/**
 * Record a review attempt for an entry and advance its SM-2 schedule.
 */
export function reviewItem(entryId: string, quality: number): SrsItem {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM srs_items WHERE entry_id = ?')
    .get(entryId) as SrsItem | undefined;

  const now = new Date();
  const nowIso = now.toISOString();

  const current = row
    ? {
        repetitions: row.repetitions,
        intervalDays: row.interval_days,
        easeFactor: row.ease_factor,
      }
    : { repetitions: 0, intervalDays: 1, easeFactor: 2.5 };

  const calculated = calculateSm2(current, quality, now);
  const id = row?.id || `srs_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const module = row?.module || 'english';

  db.prepare(`
    INSERT OR REPLACE INTO srs_items (
      id, entry_id, module, repetitions, interval_days, ease_factor, next_review_at, last_reviewed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    entryId,
    module,
    calculated.repetitions,
    calculated.intervalDays,
    calculated.easeFactor,
    calculated.nextReviewAt,
    nowIso,
    row?.created_at || nowIso,
    nowIso
  );

  return {
    id,
    entry_id: entryId,
    module,
    repetitions: calculated.repetitions,
    interval_days: calculated.intervalDays,
    ease_factor: calculated.easeFactor,
    next_review_at: calculated.nextReviewAt,
    last_reviewed_at: nowIso,
    created_at: row?.created_at || nowIso,
    updated_at: nowIso,
  };
}

/**
 * Fetch entries due for review (where next_review_at <= now), joined with full entry details.
 */
export function getDueReviewItems(options?: {
  module?: 'english' | 'studies';
  limit?: number;
  now?: string;
}): SrsDueItem[] {
  const db = getDb();
  const targetTime = options?.now || new Date().toISOString();
  const limit = options?.limit || 20;

  let query = `
    SELECT 
      s.id, s.entry_id, s.module, s.repetitions, s.interval_days, s.ease_factor, s.next_review_at,
      e.title, e.input_pt, e.target_en, e.explanation, e.tags
    FROM srs_items s
    INNER JOIN entries e ON s.entry_id = e.id
    WHERE s.next_review_at <= ?
  `;
  const params: (string | number)[] = [targetTime];

  if (options?.module) {
    query += ' AND s.module = ?';
    params.push(options.module);
  }

  query += ' ORDER BY s.next_review_at ASC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(query).all(...params) as Array<{
    id: string;
    entry_id: string;
    module: string;
    repetitions: number;
    interval_days: number;
    ease_factor: number;
    next_review_at: string;
    title: string;
    input_pt: string | null;
    target_en: string | null;
    explanation: string | null;
    tags: string;
  }>;

  return rows.map((r) => {
    let parsedTags: string[] = [];
    try {
      parsedTags = JSON.parse(r.tags);
    } catch {
      parsedTags = [];
    }

    return {
      id: r.id,
      entry_id: r.entry_id,
      module: r.module,
      title: r.title,
      input_pt: r.input_pt,
      target_en: r.target_en,
      explanation: r.explanation,
      tags: parsedTags,
      repetitions: r.repetitions,
      interval_days: r.interval_days,
      ease_factor: r.ease_factor,
      next_review_at: r.next_review_at,
    };
  });
}

/**
 * Compute aggregate SRS metrics for dashboard display.
 */
export function getSrsOverview(now: Date = new Date()): SrsOverview {
  const db = getDb();
  const nowIso = now.toISOString();

  const totalRow = db.prepare('SELECT COUNT(*) as count FROM srs_items').get() as { count: number };
  const dueRow = db
    .prepare('SELECT COUNT(*) as count FROM srs_items WHERE next_review_at <= ?')
    .get(nowIso) as { count: number };
  const masteredRow = db
    .prepare('SELECT COUNT(*) as count FROM srs_items WHERE repetitions >= 4')
    .get() as { count: number };

  return {
    totalItems: totalRow.count,
    dueToday: dueRow.count,
    masteredItems: masteredRow.count,
  };
}
