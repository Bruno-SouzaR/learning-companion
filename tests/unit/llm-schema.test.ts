import { describe, it, expect } from 'vitest';
import { refineResultSchema } from '@/server/llm';

describe('refineResultSchema', () => {
  it('validates a complete and correct pedagogical payload', () => {
    const validData = {
      title: 'Agendar reunião com a equipe',
      target_english: 'I need to schedule a meeting with the team.',
      mistakes_summary: ['Use "schedule" for formal appointments.'],
      key_vocabulary: [
        { term: 'schedule', definition: 'agendar ou programar' }
      ],
      tags: ['business', 'daily-conversation'],
    };

    const parsed = refineResultSchema.safeParse(validData);
    expect(parsed.success).toBe(true);
  });

  it('fails when target_english or title is missing', () => {
    const invalidData = {
      title: 'Faltando campo',
      mistakes_summary: [],
      key_vocabulary: [],
      tags: [],
    };

    const parsed = refineResultSchema.safeParse(invalidData);
    expect(parsed.success).toBe(false);
  });

  it('fails when vocabulary objects miss term or definition', () => {
    const invalidVocab = {
      title: 'Vocab incompleto',
      target_english: 'Example sentence',
      mistakes_summary: [],
      key_vocabulary: [{ term: 'only-term' }],
      tags: [],
    };

    const parsed = refineResultSchema.safeParse(invalidVocab);
    expect(parsed.success).toBe(false);
  });
});
