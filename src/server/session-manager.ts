import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { getDb } from './db';
import { getWikiDir } from './paths';
import { slugify, saveEnglishPracticeEntry } from './wiki-store';

export interface SessionCheckpoint {
  current_goal: string;
  mastered_concepts: string[];
  weak_points: string[];
  last_turn_summary: string;
  updated_at: string;
}

export interface StudySession {
  id: string;
  title: string;
  module: 'english' | 'studies';
  topic: string;
  objective: string;
  status: 'active' | 'completed' | 'abandoned';
  checkpoint: SessionCheckpoint | null;
  total_turns: number;
  total_tokens: number;
  created_at: string;
  updated_at: string;
  ended_at?: string | null;
}

export interface SessionTurn {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  token_estimate: number;
  created_at: string;
}

const WIKI_DIR = getWikiDir();
const EPISODIC_DIR = path.join(WIKI_DIR, 'episodic');
const SEMANTIC_DIR = path.join(WIKI_DIR, 'semantic');

/**
 * Fast, conservative token estimator (~4 chars per token, minimum 1 token for non-empty text).
 */
export function estimateTokens(text: string): number {
  if (!text || text.trim().length === 0) return 0;
  return Math.max(1, Math.ceil(text.trim().length / 4));
}

/**
 * Create a new structured study session.
 */
export function createSession(params: {
  title: string;
  module: 'english' | 'studies';
  topic: string;
  objective: string;
}): StudySession {
  const db = getDb();
  const now = new Date().toISOString();
  const id = `session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const initialCheckpoint: SessionCheckpoint = {
    current_goal: params.objective.trim(),
    mastered_concepts: [],
    weak_points: [],
    last_turn_summary: 'Sessão iniciada.',
    updated_at: now,
  };

  const checkpointJson = JSON.stringify(initialCheckpoint);

  db.prepare(`
    INSERT INTO study_sessions (
      id, title, module, topic, objective, status, checkpoint, total_turns, total_tokens, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'active', ?, 0, 0, ?, ?)
  `).run(
    id,
    params.title.trim(),
    params.module,
    params.topic.trim(),
    params.objective.trim(),
    checkpointJson,
    now,
    now
  );

  return {
    id,
    title: params.title.trim(),
    module: params.module,
    topic: params.topic.trim(),
    objective: params.objective.trim(),
    status: 'active',
    checkpoint: initialCheckpoint,
    total_turns: 0,
    total_tokens: 0,
    created_at: now,
    updated_at: now,
    ended_at: null,
  };
}

/**
 * Record a dialogue turn in the active study session.
 */
export function recordTurn(
  sessionId: string,
  turn: { role: 'user' | 'assistant' | 'system'; content: string }
): SessionTurn {
  const db = getDb();
  const session = getSession(sessionId);

  if (!session) {
    throw new Error(`Session with id "${sessionId}" not found.`);
  }

  if (session.status !== 'active') {
    throw new Error(`Cannot record turn in session with status "${session.status}".`);
  }

  const now = new Date().toISOString();
  const turnId = `turn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const tokenCount = estimateTokens(turn.content);

  db.prepare(`
    INSERT INTO session_turns (id, session_id, role, content, token_estimate, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(turnId, sessionId, turn.role, turn.content, tokenCount, now);

  const updatedTurns = session.total_turns + 1;
  const updatedTokens = session.total_tokens + tokenCount;

  db.prepare(`
    UPDATE study_sessions
    SET total_turns = ?, total_tokens = ?, updated_at = ?
    WHERE id = ?
  `).run(updatedTurns, updatedTokens, now, sessionId);

  return {
    id: turnId,
    session_id: sessionId,
    role: turn.role,
    content: turn.content,
    token_estimate: tokenCount,
    created_at: now,
  };
}

/**
 * Evaluate if the session reached the token or turn threshold requiring compaction.
 */
export function shouldTriggerCompaction(
  session: StudySession,
  options: { maxTokens?: number; maxTurns?: number } = {}
): boolean {
  const maxTokens = options.maxTokens ?? 3000;
  const maxTurns = options.maxTurns ?? 6;

  return session.total_tokens >= maxTokens || session.total_turns >= maxTurns;
}

/**
 * Compact the session state by updating the condensed checkpoint and resetting turn counters.
 */
export function compactSession(
  sessionId: string,
  synthesizedCheckpoint: Partial<SessionCheckpoint>
): StudySession {
  const db = getDb();
  const session = getSession(sessionId);

  if (!session) {
    throw new Error(`Session with id "${sessionId}" not found.`);
  }

  const now = new Date().toISOString();
  const currentCheckpoint = session.checkpoint || {
    current_goal: session.objective,
    mastered_concepts: [],
    weak_points: [],
    last_turn_summary: '',
    updated_at: now,
  };

  const newCheckpoint: SessionCheckpoint = {
    current_goal: synthesizedCheckpoint.current_goal || currentCheckpoint.current_goal,
    mastered_concepts: Array.from(
      new Set([...currentCheckpoint.mastered_concepts, ...(synthesizedCheckpoint.mastered_concepts || [])])
    ),
    weak_points: Array.from(
      new Set([...currentCheckpoint.weak_points, ...(synthesizedCheckpoint.weak_points || [])])
    ),
    last_turn_summary: synthesizedCheckpoint.last_turn_summary || currentCheckpoint.last_turn_summary,
    updated_at: now,
  };

  db.prepare(`
    UPDATE study_sessions
    SET checkpoint = ?, total_tokens = 0, updated_at = ?
    WHERE id = ?
  `).run(JSON.stringify(newCheckpoint), now, sessionId);

  return {
    ...session,
    checkpoint: newCheckpoint,
    total_tokens: 0,
    updated_at: now,
  };
}

/**
 * Build a minimal prompt context for the LLM to prevent context bloat.
 * Injects system prompt + condensed checkpoint + last 2 turns only.
 */
export function buildPromptContext(
  sessionId: string,
  baseSystemPrompt: string
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const db = getDb();
  const session = getSession(sessionId);

  if (!session) {
    return [{ role: 'system', content: baseSystemPrompt }];
  }

  let augmentedSystemPrompt = baseSystemPrompt;

  if (session.checkpoint) {
    const cp = session.checkpoint;
    augmentedSystemPrompt += `\n\n[ACTIVE SESSION CONTEXT]\nGoal: ${cp.current_goal}\nMastered: ${cp.mastered_concepts.join(', ') || 'None yet'}\nAreas for Improvement: ${cp.weak_points.join(', ') || 'None identified'}\nProgress Summary: ${cp.last_turn_summary}`;
  }

  const turns = db
    .prepare(`
      SELECT role, content
      FROM session_turns
      WHERE session_id = ?
      ORDER BY created_at DESC, rowid DESC
      LIMIT 2
    `)
    .all(sessionId) as Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;

  const recentDialogue = turns.reverse().map((t) => ({
    role: t.role,
    content: t.content,
  }));

  return [{ role: 'system', content: augmentedSystemPrompt }, ...recentDialogue];
}

/**
 * End the study session, generate physical episodic markdown log, and distill semantic concept cards.
 */
export async function endSession(
  sessionId: string,
  summary?: {
    takeaways?: string[];
    keyRules?: Array<{ title: string; content: string }>;
  }
): Promise<{
  session: StudySession;
  episodicPath: string;
  semanticPaths: string[];
}> {
  const db = getDb();
  const session = getSession(sessionId);

  if (!session) {
    throw new Error(`Session with id "${sessionId}" not found.`);
  }

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const endedAtIso = now.toISOString();

  // Mark session completed in DB
  db.prepare(`
    UPDATE study_sessions
    SET status = 'completed', ended_at = ?, updated_at = ?
    WHERE id = ?
  `).run(endedAtIso, endedAtIso, sessionId);

  // Retrieve all turns to construct episodic history
  const turns = db
    .prepare(`
      SELECT role, content, created_at
      FROM session_turns
      WHERE session_id = ?
      ORDER BY created_at ASC
    `)
    .all(sessionId) as Array<{ role: string; content: string; created_at: string }>;

  if (!fs.existsSync(EPISODIC_DIR)) {
    fs.mkdirSync(EPISODIC_DIR, { recursive: true });
  }

  const episodicSlug = `${dateStr}-${slugify(session.title)}`;
  const episodicFilename = `${episodicSlug}.md`;
  const episodicPath = path.join(EPISODIC_DIR, episodicFilename);

  const episodicFrontmatter = {
    id: `episodic_${sessionId}`,
    title: session.title,
    module: session.module,
    topic: session.topic,
    objective: session.objective,
    total_turns: session.total_turns,
    mastered: session.checkpoint?.mastered_concepts || [],
    weak_points: session.checkpoint?.weak_points || [],
    created_at: session.created_at,
    ended_at: endedAtIso,
  };

  const turnsText = turns
    .map((t) => `### ${t.role.toUpperCase()} (${t.created_at})\n${t.content}`)
    .join('\n\n');

  const takeawaysText = (summary?.takeaways || [])
    .map((item) => `- ${item}`)
    .join('\n');

  const episodicBody = `
# Relatório de Sessão: ${session.title}

## Objetivo
> ${session.objective}

## Pontos Dominados
${(session.checkpoint?.mastered_concepts || []).map((c) => `- ${c}`).join('\n') || '- Nenhum registrado.'}

## Pontos de Atenção
${(session.checkpoint?.weak_points || []).map((w) => `- ${w}`).join('\n') || '- Nenhum registrado.'}

## Principais Aprendizados (Takeaways)
${takeawaysText || '- Sessão concluída com sucesso.'}

## Histórico de Interações
${turnsText || 'Nenhuma interação registrada.'}
`.trim();

  fs.writeFileSync(episodicPath, matter.stringify(episodicBody, episodicFrontmatter), 'utf-8');

  // Distill semantic cards if keyRules are provided
  const semanticPaths: string[] = [];
  if (summary?.keyRules && summary.keyRules.length > 0) {
    if (!fs.existsSync(SEMANTIC_DIR)) {
      fs.mkdirSync(SEMANTIC_DIR, { recursive: true });
    }

    for (const rule of summary.keyRules) {
      const ruleSlug = slugify(rule.title);
      const rulePath = path.join(SEMANTIC_DIR, `${ruleSlug}.md`);

      const ruleFrontmatter = {
        id: `semantic_${ruleSlug}`,
        title: rule.title,
        module: session.module,
        topic: session.topic,
        source_session: sessionId,
        created_at: endedAtIso,
        updated_at: endedAtIso,
      };

      const ruleBody = `
# ${rule.title}

## Conceito & Regra
${rule.content}

## Origem
Destilado automaticamente da sessão de estudo "${session.title}" (${session.topic}).
`.trim();

      fs.writeFileSync(rulePath, matter.stringify(ruleBody, ruleFrontmatter), 'utf-8');
      semanticPaths.push(rulePath);
    }
  }

  return {
    session: {
      ...session,
      status: 'completed',
      ended_at: endedAtIso,
      updated_at: endedAtIso,
    },
    episodicPath,
    semanticPaths,
  };
}

/**
 * Retrieve session by ID.
 */
export function getSession(sessionId: string): StudySession | null {
  const db = getDb();
  const row = db
    .prepare(`
      SELECT id, title, module, topic, objective, status, checkpoint, total_turns, total_tokens, created_at, updated_at, ended_at
      FROM study_sessions
      WHERE id = ?
    `)
    .get(sessionId) as {
      id: string;
      title: string;
      module: 'english' | 'studies';
      topic: string;
      objective: string;
      status: 'active' | 'completed' | 'abandoned';
      checkpoint: string | null;
      total_turns: number;
      total_tokens: number;
      created_at: string;
      updated_at: string;
      ended_at: string | null;
    } | undefined;

  if (!row) return null;

  let parsedCheckpoint: SessionCheckpoint | null = null;
  if (row.checkpoint) {
    try {
      parsedCheckpoint = JSON.parse(row.checkpoint);
    } catch {
      parsedCheckpoint = null;
    }
  }

  return {
    ...row,
    checkpoint: parsedCheckpoint,
  };
}

/**
 * List study sessions with optional module and status filters.
 */
export function listSessions(filters?: {
  module?: 'english' | 'studies';
  status?: 'active' | 'completed' | 'abandoned';
}): StudySession[] {
  const db = getDb();
  let query = `
    SELECT id, title, module, topic, objective, status, checkpoint, total_turns, total_tokens, created_at, updated_at, ended_at
    FROM study_sessions
  `;
  const params: string[] = [];
  const clauses: string[] = [];

  if (filters?.module) {
    clauses.push('module = ?');
    params.push(filters.module);
  }

  if (filters?.status) {
    clauses.push('status = ?');
    params.push(filters.status);
  }

  if (clauses.length > 0) {
    query += ` WHERE ${clauses.join(' AND ')}`;
  }

  query += ' ORDER BY created_at DESC';

  const rows = db.prepare(query).all(...params) as Array<{
    id: string;
    title: string;
    module: 'english' | 'studies';
    topic: string;
    objective: string;
    status: 'active' | 'completed' | 'abandoned';
    checkpoint: string | null;
    total_turns: number;
    total_tokens: number;
    created_at: string;
    updated_at: string;
    ended_at: string | null;
  }>;

  return rows.map((r) => {
    let cp: SessionCheckpoint | null = null;
    if (r.checkpoint) {
      try {
        cp = JSON.parse(r.checkpoint);
      } catch {
        cp = null;
      }
    }
    return {
      ...r,
      checkpoint: cp,
    };
  });
}
