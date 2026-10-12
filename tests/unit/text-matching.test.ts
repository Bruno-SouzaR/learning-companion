import { describe, it, expect } from 'vitest';
import { isExactMatch } from '@/lib/text-matcher';

describe('isExactMatch', () => {
  it('matches identical sentences', () => {
    expect(isExactMatch('I need to go now', 'I need to go now')).toBe(true);
  });

  it('ignores casing differences', () => {
    expect(isExactMatch('I Need To Go Now', 'i need to go now')).toBe(true);
  });

  it('ignores punctuation differences', () => {
    expect(isExactMatch('I need to go now.', 'I need to go now')).toBe(true);
    expect(isExactMatch('Hello, world!', 'hello world')).toBe(true);
    expect(isExactMatch('Are you ready?', 'are you ready')).toBe(true);
  });

  it('normalizes variable whitespace between words', () => {
    expect(isExactMatch('I   need to   go', 'I need to go')).toBe(true);
  });

  it('rejects sentences with missing or divergent words', () => {
    expect(isExactMatch('I want to learn English', 'I want learn English')).toBe(false);
    expect(isExactMatch('I went to school', 'I go to school')).toBe(false);
  });

  it('handles empty or blank inputs safely', () => {
    expect(isExactMatch('', 'hello')).toBe(false);
    expect(isExactMatch('hello', '')).toBe(false);
    expect(isExactMatch('   ', '   ')).toBe(false);
  });
});
