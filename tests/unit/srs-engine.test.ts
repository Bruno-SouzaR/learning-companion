import { describe, it, expect } from 'vitest';
import { calculateSm2 } from '@/server/srs-engine';

describe('Unit: SM-2 Spaced Repetition Algorithm', () => {
  const fixedNow = new Date('2026-10-12T10:00:00.000Z');

  describe('Happy Path Calculations', () => {
    it('schedules first successful review (q=4) for 1 day', () => {
      const initial = { repetitions: 0, intervalDays: 1, easeFactor: 2.5 };
      const next = calculateSm2(initial, 4, fixedNow);

      expect(next.repetitions).toBe(1);
      expect(next.intervalDays).toBe(1);
      expect(next.easeFactor).toBe(2.5); // delta for q=4 is 0.1 - 1 * (0.08 + 0.02) = 0.0
      expect(next.nextReviewAt).toBe('2026-10-13T10:00:00.000Z');
    });

    it('schedules second successful review (q=4) for 6 days', () => {
      const state1 = { repetitions: 1, intervalDays: 1, easeFactor: 2.5 };
      const next = calculateSm2(state1, 4, fixedNow);

      expect(next.repetitions).toBe(2);
      expect(next.intervalDays).toBe(6);
      expect(next.nextReviewAt).toBe('2026-10-18T10:00:00.000Z');
    });

    it('scales interval by ease factor on third consecutive recall', () => {
      const state2 = { repetitions: 2, intervalDays: 6, easeFactor: 2.5 };
      const next = calculateSm2(state2, 5, fixedNow);

      expect(next.repetitions).toBe(3);
      expect(next.intervalDays).toBe(15); // Math.round(6 * 2.5)
      expect(next.easeFactor).toBeGreaterThan(2.5); // q=5 increases EF
    });
  });

  describe('Failure & Reset Behavior', () => {
    it('resets repetition streak and interval to 1 day on recall failure (q < 3)', () => {
      const masteredState = { repetitions: 5, intervalDays: 30, easeFactor: 2.6 };
      const failed = calculateSm2(masteredState, 1, fixedNow);

      expect(failed.repetitions).toBe(0);
      expect(failed.intervalDays).toBe(1);
      expect(failed.easeFactor).toBeLessThan(2.6);
      expect(failed.nextReviewAt).toBe('2026-10-13T10:00:00.000Z');
    });
  });

  describe('Edge Cases & Boundaries', () => {
    it('never allows ease factor to drop below the 1.30 floor', () => {
      let state = { repetitions: 0, intervalDays: 1, easeFactor: 1.35 };

      // Repeated total failures
      for (let i = 0; i < 5; i++) {
        state = calculateSm2(state, 0, fixedNow);
      }

      expect(state.easeFactor).toBe(1.3);
    });

    it('clamps quality scores outside the 0 to 5 range', () => {
      const state = { repetitions: 0, intervalDays: 1, easeFactor: 2.5 };
      const overMax = calculateSm2(state, 10, fixedNow);
      const underMin = calculateSm2(state, -5, fixedNow);

      expect(overMax.repetitions).toBe(1); // Treated as q=5
      expect(underMin.repetitions).toBe(0); // Treated as q=0
    });
  });
});
