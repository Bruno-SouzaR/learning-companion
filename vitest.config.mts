import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { TEST_DATA_DIR } from './tests/support/isolate';

// Isolated test data directory is prepared BEFORE loading vitest config modules
// that may import server modules resolving data paths.
if (fs.existsSync(TEST_DATA_DIR)) {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
}
fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
process.env.LEARNING_DATA_DIR = TEST_DATA_DIR;

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    fileParallelism: false,
    globalSetup: ['tests/support/teardown.ts'],
    setupFiles: [],
    env: {
      LEARNING_DATA_DIR: TEST_DATA_DIR,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
});