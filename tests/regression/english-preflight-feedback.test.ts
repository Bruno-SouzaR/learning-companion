import { describe, it, expect } from 'vitest';
import { refineResultSchema } from '@/server/english-coach';
import {
  QWEN_SAMPLING_PROFILE,
  GEMMA_SAMPLING_PROFILE,
  resolveModelSamplingProfile,
} from '@/server/llm';

describe('Regression: English Pre-Flight Feedback & Sampling Invariants', () => {
  it('filters out single-word fragments like ["Yesterday"] from mistakes_summary', () => {
    // Reproduces the exact bug where presence penalty caused Qwen to collapse to ["Yesterday"]
    const rawPayload = {
      title: 'Daily Update',
      target_english:
        "Hello everyone! Yesterday I focused on my project, and today I'll continue.",
      mistakes_summary: ['Yesterday'], // Single word fragment (< 4 chars after trimming)
      key_vocabulary: [
        { term: 'focused', definition: 'concentrou a atenção no passado' },
      ],
      tags: ['standup'],
    };

    const parsed = refineResultSchema.parse(rawPayload);
    // Single-word fragment should be cleanly filtered out, never presented as a lone bullet
    expect(parsed.mistakes_summary).toEqual([]);
  });

  it('keeps substantive pedagogical explanations and filters out raw noise', () => {
    const rawPayload = {
      title: 'Daily Update',
      target_english:
        "Hello everyone! Yesterday I focused on my project, and today I'll continue.",
      mistakes_summary: [
        'Yesterday', // Noise / fragment
        "O verbo 'focus' no passado simples deve ser grafado como 'focused'.", // Substantive
        'a', // Noise
        'A estrutura soa mais natural com contração idiomática.', // Substantive
      ],
      key_vocabulary: [],
      tags: ['standup'],
    };

    const parsed = refineResultSchema.parse(rawPayload);
    expect(parsed.mistakes_summary).toEqual([
      "O verbo 'focus' no passado simples deve ser grafado como 'focused'.",
      'A estrutura soa mais natural com contração idiomática.',
    ]);
  });

  it('coerces single string paragraphs from LLM into clean array bullets', () => {
    const rawPayload = {
      title: 'Daily Update',
      target_english: 'Hello everyone!',
      mistakes_summary:
        "Primeiro, 'westerday' está incorreto; use 'yesterday'.\nSegundo, o tempo verbal deve ser 'focused'.",
      key_vocabulary: [],
      tags: ['standup'],
    };

    const parsed = refineResultSchema.parse(rawPayload);
    expect(parsed.mistakes_summary).toHaveLength(2);
    expect(parsed.mistakes_summary[0]).toContain("use 'yesterday'");
    expect(parsed.mistakes_summary[1]).toContain("deve ser 'focused'");
  });

  it('enforces presence_penalty === 0.0 on Qwen to prevent JSON corruption and truncation loops', () => {
    // Invariant: Qwen must NEVER have presence_penalty > 0 because it causes
    // token panic on repeating words from target_english, corrupting the JSON payload.
    expect(QWEN_SAMPLING_PROFILE.presencePenalty).toBe(0.0);
    expect(resolveModelSamplingProfile('qwen3.5:2b-q8').presencePenalty).toBe(0.0);
  });

  it('enforces presence_penalty === 0.0 on Gemma to prevent lexical vocabulary panic', () => {
    expect(GEMMA_SAMPLING_PROFILE.presencePenalty).toBe(0.0);
    expect(resolveModelSamplingProfile('gemma-4-e4b').presencePenalty).toBe(0.0);
  });
});
