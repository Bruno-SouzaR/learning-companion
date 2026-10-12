import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { getDataDir, getWikiDir } from '@/server/paths';

describe('Unit: Isolated Data Directory Boundary', () => {
  it('points server data into the isolated test directory (never production data/)', () => {
    const dataDir = getDataDir();
    const configured = process.env.LEARNING_DATA_DIR;

    expect(configured).toBeTruthy();
    expect(dataDir).toBe(configured);
    // Production path would be <project>/data — tests must never resolve to it
    expect(path.basename(dataDir)).toMatch(/^learning-companion-test-/);
  });

  it('keeps wiki directory nested under the isolated data directory', () => {
    const wikiDir = getWikiDir();
    expect(path.dirname(wikiDir)).toBe(getDataDir());
    expect(path.basename(wikiDir)).toBe('wiki');
  });
});