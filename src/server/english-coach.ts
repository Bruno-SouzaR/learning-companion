import { z } from 'zod';
import { callLlmJson } from './llm';
import { getEnglishModel, getEnglishBaseUrl } from './env';

export const refineResultSchema = z.object({
  title: z.string().describe('Short descriptive title in Portuguese for this practice entry'),
  target_english: z.string().describe('Natural, idiomatic English translation'),
  mistakes_summary: z
    .preprocess((val) => {
      if (typeof val === 'string') {
        return val
          .split(/\n+/)
          .map((s) => s.replace(/^[-*•\d.]+\s*/, '').trim())
          .filter((s) => s.split(/\s+/).length >= 2);
      }
      if (Array.isArray(val)) {
        return val
          .map((s) => String(s).replace(/^[-*•\d.]+\s*/, '').trim())
          .filter((s) => s.split(/\s+/).length >= 2);
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

const SYSTEM_PROMPT = `You are an elite native English speech coach and pedagogical assistant for Brazilian Portuguese software engineers.

PRIMARY MISSION:
Transform the user's input into how an authentic native English speaker (e.g., an engineer in Silicon Valley) would naturally express it in the detected context (e.g., daily standup, team meeting, Slack request, code review). Do not provide a mechanical or word-for-word translation. Upgrade the phrasing to sound natural, concise, and professional.

LANGUAGE ENFORCEMENT RULE (CRITICAL INVARIANT):
- All explanations in "mistakes_summary" and all definitions in "key_vocabulary" MUST be written strictly in BRAZILIAN PORTUGUESE (PT-BR).
- Writing explanations or vocabulary definitions in English is strictly forbidden because the learner needs explanations in their native language to grasp nuances.

SCHEMA:
You MUST respond with a valid JSON object strictly matching this schema:
{
  "title": "Título descritivo curto em português (ex: Daily Standup: Atualização de Tarefas)",
  "target_english": "Frase em inglês polida, natural e idiomática, exatamente como um nativo diria na reunião",
  "mistakes_summary": [
    "Explicação detalhada em português (mínimo 10-15 palavras): o que foi corrigido gramaticalmente e o porquê.",
    "Sugestão de naturalidade e fluência em português: como um nativo fala nesse contexto e por que a nova forma soa mais profissional e menos literal."
  ],
  "key_vocabulary": [
    {"term": "phrasal verb, collocation ou termo nativo", "definition": "significado e contexto de uso em português"}
  ],
  "tags": ["daily-standup", "workplace", "vocabulary"]
}

CRITICAL GUIDELINES:
- In "mistakes_summary", explain why literal Portuguese habits (like "de PRs" or "go reviewing") sound unnatural to native speakers.
- In "mistakes_summary", NEVER output single words, raw terms, or fragments (NEVER output just "Yesterday" or "blockers").
- Every single bullet in mistakes_summary MUST be a full, constructive sentence in Brazilian Portuguese explaining the "why".
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
    baseUrl: options?.baseUrl || getEnglishBaseUrl(),
  });
}
