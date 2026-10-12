import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import {
  scheduleNewEntry,
  reviewItem,
  getDueReviewItems,
  getSrsOverview,
} from '@/server/srs-engine';
import { saveEnglishPracticeEntry } from '@/server/wiki-store';

describe('Integration: SRS Engine Database Operations', () => {
  const createdFiles: string[] = [];

  afterEach(() => {
    for (const filePath of createdFiles) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    createdFiles.length = 0;
  });

  it('schedules an entry, retrieves it in due queue, and updates state on review', async () => {
    // 1. Create a real entry
    const entry = await saveEnglishPracticeEntry({
      title: 'SRS Integration Test Entry',
      input_pt: 'revisar vocabulario de teste',
      target_en: 'Review test vocabulary.',
      mistakes_summary: [],
      key_vocabulary: [{ term: 'vocabulary', definition: 'vocabulario' }],
      tags: ['srs-test'],
    });
    createdFiles.push(entry.file_path);

    // 2. Schedule for immediate review (initialInterval = 0 days / right now)
    const scheduled = scheduleNewEntry(entry.id, 'english', 0);
    expect(scheduled.entry_id).toBe(entry.id);
    expect(scheduled.repetitions).toBe(0);

    // 3. Query due items
    const dueItems = getDueReviewItems({ module: 'english' });
    const found = dueItems.find((item) => item.entry_id === entry.id);
    expect(found).toBeDefined();
    expect(found?.target_en).toBe(entry.target_en);

    // 4. Submit successful review
    const reviewed = reviewItem(entry.id, 5);
    expect(reviewed.repetitions).toBe(1);
    expect(reviewed.interval_days).toBe(1);

    // 5. Submit second review with failure
    const failed = reviewItem(entry.id, 1);
    expect(failed.repetitions).toBe(0);
    expect(failed.interval_days).toBe(1);

    // 6. Check overview stats
    const overview = getSrsOverview();
    expect(overview.totalItems).toBeGreaterThan(0);
  });
});
