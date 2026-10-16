import { z } from 'zod';
import { callLlmJson } from './llm';
import { getEnglishModel } from './env';

export const refineResultSchema = z.object({
  title: z.string().describe('Short descriptive title in Portuguese for this practice entry'),
  target_english: z.string().describe('Natural, idiomatic English translation'),
  mistakes_summary: z
    .array(z.string())
    .default([])
    .describe('2-3 concise bullet points in Portuguese explaining grammar, prepositions, or vocabulary mistakes'),
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

const SYSTEM_PROMPT = `You are a high-level English pedagogical assistant and language coach for a Brazilian Portuguese speaker.
Your goal is to help the user master natural, daily communication in English (casual conversations, questions, requests to AI or colleagues, context explanations with parentheses, etc.).

Analyze the user's input (in Portuguese, broken English, or mixed language).
You MUST respond with a valid JSON object strictly matching this schema:
{
  "title": "Short descriptive title in Portuguese",
  "target_english": "Natural, idiomatic English sentence(s)",
  "mistakes_summary": [
    "Ponto 1 em português explicando erro ou melhora",
    "Ponto 2 em português"
  ],
  "key_vocabulary": [
    {"term": "phrasal verb or key word", "definition": "significado em português"}
  ],
  "tags": ["prepositions", "daily-conversation", "etc"]
}

Guidelines:
- Make target_english sound natural and fluent, preserving the user's original intent and tone.
- In mistakes_summary, be direct, encouraging, and explain the "why" in Portuguese (e.g., prepositions, false friends, word order).
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
