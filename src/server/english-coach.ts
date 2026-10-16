import { z } from 'zod';
import { callLlmJson } from './llm';
import { getEnglishModel } from './env';

export const refineResultSchema = z.object({
  title: z.string().describe('Short descriptive title in Portuguese for this practice entry'),
  target_english: z.string().describe('Natural, idiomatic English translation'),
  mistakes_summary: z
    .preprocess((val) => {
      if (typeof val === 'string') {
        return val
          .split(/\n+/)
          .map((s) => s.replace(/^[-*•\d.]+\s*/, '').trim())
          .filter((s) => s.length > 5);
      }
      if (Array.isArray(val)) {
        return val
          .map((s) => String(s).trim())
          .filter((s) => s.length > 3);
      }
      return [];
    }, z.array(z.string()))
    .default([])
    .describe('2-3 complete, detailed pedagogical bullet points in Portuguese explaining grammar and native phrasing upgrades'),
  key_vocabulary: z
    .array(
      z.object({
        term: z.string().describe('Phrasal verb, collocation, or key word'),
        definition: z.string().describe('Portuguese definition and meaning'),
      })
    )
    .default([])
    .describe('Key vocabulary terms and their Portuguese definitions'),
  tags: z.array(z.string()).default([]).describe('Topic and error category tags'),
});

export type RefineResult = z.infer<typeof refineResultSchema>;

const SYSTEM_PROMPT = `You are an elite English pedagogical assistant and language coach for a Brazilian Portuguese speaker.
Your mission is to help the user master natural, idiomatic, professional, and daily communication in English (standups, team chats, questions, requests to colleagues or AI).

Analyze the user's input (which may be in Portuguese, broken English, literal translations, or rough phrasing).

Provide comprehensive pedagogical coaching covering BOTH:
1. GRAMMAR & VOCABULARY CORRECTIONS: spelling, verb tenses (e.g. past tense consistency), prepositions, collocations.
2. NATURAL NATIVE PHRASING: Explain why certain expressions sound unnatural, literal, or robotic ("Portuguese calques"), and teach the idiomatic phrasing native speakers actually use in professional or daily contexts.

You MUST respond with a valid JSON object strictly matching this schema:
{
  "title": "Short descriptive title in Portuguese for this practice entry",
  "target_english": "Natural, idiomatic English sentence(s) that a native speaker would use",
  "mistakes_summary": [
    "Explicação clara e completa em português (mínimo 10-15 palavras) explicando a correção gramatical ou de tempo verbal e o porquê.",
    "Sugestão de naturalidade e fluência em português explicando por que a nova forma soa mais nativa e menos traduzida ao pé da letra."
  ],
  "key_vocabulary": [
    {"term": "phrasal verb, collocation or idiom", "definition": "significado em português com contexto de uso"}
  ],
  "tags": ["daily-standup", "grammar", "vocabulary"]
}

CRITICAL GUIDELINES:
- In mistakes_summary, NEVER output single words, raw terms, or fragments (NEVER output just "Yesterday" or "blockers").
- Every single bullet in mistakes_summary MUST be a full, constructive sentence in Brazilian Portuguese explaining the "why".
- If the user wrote in English with few grammar errors, focus your feedback on IDIOMATIC UPGRADES: how to sound more natural, concise, and professional.
- Output ONLY pure JSON. No markdown backticks, no conversational preamble.`;

/**
 * Domain module for English Pre-Flight coaching and prompt refinement.
 * Translates Brazilian Portuguese thoughts into idiomatic English with pedagogical feedback.
 */
export async function refinePrompt(
  rawInput: string,
  options?: { model?: string; baseUrl?: string }
): Promise<RefineResult> {
  if (!rawInput || rawInput.trim().length === 0) {
    throw new Error('Input text cannot be empty');
  }

  return callLlmJson({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: rawInput.trim() },
    ],
    schema: refineResultSchema,
    temperature: 0.2,
    model: options?.model || getEnglishModel(),
    baseUrl: options?.baseUrl,
  });
}
