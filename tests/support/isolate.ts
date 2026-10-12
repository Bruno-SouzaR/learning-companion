import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const TEST_DATA_DIR = path.join(
  os.tmpdir(),
  `learning-companion-test-${process.pid}`
);

/**
 * Registers the isolated test data directory BEFORE any server module is imported.
 * Verified by tests/unit/paths.test.ts.
 */
export function prepareTestDataDir(): string {
  process.env.LEARNING_DATA_DIR = TEST_DATA_DIR;
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  return TEST_DATA_DIR;
}