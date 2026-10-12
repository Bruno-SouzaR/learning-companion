import path from 'node:path';

/**
 * Root data directory for all persistent state.
 * Production/dev uses `data/` under the project root.
 * Tests MUST override this via LEARNING_DATA_DIR to keep the real data clean.
 */
export function getDataDir(): string {
  return process.env.LEARNING_DATA_DIR?.trim() || path.join(process.cwd(), 'data');
}

export function getWikiDir(): string {
  return path.join(getDataDir(), 'wiki');
}