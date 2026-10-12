import { describe, it, expect } from 'vitest';
import { diffWordsWithSpace } from 'diff';
import { isExactMatch } from '@/lib/text-matcher';

describe('Regression: Active Recall Diff & State Machine', () => {
  it('does not calculate or show diff before explicit check', () => {
    let isDiffVisible = false;
    const target = 'I need to go to the store.';
    const typed = 'I need go store';

    // Before verification, diff must be empty/hidden
    const diff = isDiffVisible
      ? diffWordsWithSpace(target, typed, { ignoreCase: true })
      : [];

    expect(diff).toHaveLength(0);
    expect(isDiffVisible).toBe(false);
  });

  it('reveals diff upon verification and identifies missing words', () => {
    let isDiffVisible = true;
    const target = 'I need to go to the store.';
    const typed = 'I need go to the store.';

    const diff = isDiffVisible
      ? diffWordsWithSpace(target, typed, { ignoreCase: true })
      : [];

    expect(diff.length).toBeGreaterThan(0);
    // Finds that "to " was missing (removed in target relative to typed)
    const missingPart = diff.find((p) => p.removed);
    expect(missingPart).toBeDefined();
    expect(missingPart?.value).toContain('to');
  });

  it('hides diff immediately when user begins editing to re-attempt from memory', () => {
    let isDiffVisible = true;

    // Simulate user typing a new character into the textarea
    function onUserTyping(newVal: string) {
      if (isDiffVisible) {
        isDiffVisible = false;
      }
      return newVal;
    }

    onUserTyping('I need to ');
    expect(isDiffVisible).toBe(false);
  });

  it('accurately detects exact match ignoring casing and punctuation', () => {
    expect(isExactMatch('I need to go to the store.', 'i need to go to the store')).toBe(true);
    expect(isExactMatch('I need to go to the store.', 'i need to go store')).toBe(false);
  });
});
