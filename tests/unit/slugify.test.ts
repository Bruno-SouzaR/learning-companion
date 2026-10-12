import { describe, it, expect } from 'vitest';
import { slugify } from '@/server/wiki-store';

describe('slugify', () => {
  it('converts portuguese accents to clean ascii', () => {
    expect(slugify('Atenção e Comunicação')).toBe('atencao-e-comunicacao');
    expect(slugify('Lembrete de Reunião Rápida')).toBe('lembrete-de-reuniao-rapida');
  });

  it('replaces spaces and punctuation with dashes', () => {
    expect(slugify('hello, world! how are you?')).toBe('hello-world-how-are-you');
  });

  it('truncates slug length to at most 40 characters', () => {
    const longTitle = 'este e um titulo excessivamente longo para demonstrar a truncagem';
    const slug = slugify(longTitle);
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug).not.toMatch(/-$/);
  });

  it('falls back to "entry" when given empty or non-alphanumeric input', () => {
    expect(slugify('')).toBe('entry');
    expect(slugify('---')).toBe('entry');
    expect(slugify('!@#$%')).toBe('entry');
  });
});
