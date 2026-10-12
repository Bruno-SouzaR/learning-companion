import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TEST_DATA_DIR } from './isolate';

export default function teardown() {
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
  const dir = path.join(os.tmpdir(), `learning-companion-test-${process.pid}`);
  if (dir !== TEST_DATA_DIR && fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}