import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Regression: Context Isolation & Clean Artifacts', () => {
  it('verifies that no internal tools or conversations are referenced in codebase', () => {
    const forbiddenPatterns = [
      /\bai-memory\b/i,
      /\bteach skill\b/i,
    ];

    const filesToCheck = [
      path.join(process.cwd(), 'src/app/page.tsx'),
      path.join(process.cwd(), 'src/components/active-recall.tsx'),
      path.join(process.cwd(), 'docs/prd/learning-companion.md'),
      path.join(process.cwd(), 'AGENTS.md'),
    ];

    for (const filePath of filesToCheck) {
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, 'utf-8');

      for (const pattern of forbiddenPatterns) {
        expect(
          pattern.test(content),
          `File ${filePath} contains forbidden external reference matching ${pattern}`
        ).toBe(false);
      }
    }
  });
});
