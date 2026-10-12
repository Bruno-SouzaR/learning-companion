import { describe, it, expect } from 'vitest';
import { cosineSimilarity } from '@/server/embeddings';

describe('cosineSimilarity', () => {
  it('returns 1.0 for identical normalized vectors', () => {
    const vecA = [0.6, 0.8];
    const vecB = [0.6, 0.8];
    expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(1.0, 5);
  });

  it('returns 0.0 for orthogonal vectors', () => {
    const vecA = [1.0, 0.0];
    const vecB = [0.0, 1.0];
    expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(0.0, 5);
  });

  it('returns -1.0 for opposite vectors', () => {
    const vecA = [1.0, 0.0];
    const vecB = [-1.0, 0.0];
    expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(-1.0, 5);
  });

  it('safely handles empty or mismatched vectors', () => {
    expect(cosineSimilarity([], [1, 2])).toBe(0);
    expect(cosineSimilarity([1, 2], [])).toBe(0);
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    // @ts-expect-error testing null safety
    expect(cosineSimilarity(null, [1])).toBe(0);
  });
});
