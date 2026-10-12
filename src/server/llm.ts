import { z } from 'zod';
import { getEnv } from './env';

export const refineResultSchema = z.object({
  title: z.string().describe('Short descriptive title in Portuguese for this practice entry'),
  target_english: z.string().describe('Natural, idiomatic English translation'),
  mistakes_summary: z.array(z.string()).describe('2-3 concise bullet points in Portuguese explaining grammar, prepositions, or vocabulary mistakes'),
  key_vocabulary: z.array(
    z.object({
      term: z.string().describe('Phrasal verb, collocation, or key word'),
      definition: z.string().describe('Portuguese definition and meaning'),
    })
  ).describe('Key vocabulary terms and their Portuguese definitions'),
  tags: z.array(z.string()).describe('Topic and error category tags'),
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
    "Punto 1 em português explicando erro ou melhora",
    "Punto 2 em português"
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

export interface LlmResponse {
  content: string;
  finishReason: 'stop' | 'length' | 'content_filter' | 'tool_calls' | '';
}

/**
 * Low-level chat completion request against the configured local/remote LLM.
 */
export async function requestChatCompletion(params: {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}): Promise<LlmResponse> {
  const env = getEnv();
  const endpoint = `${env.LLM_BASE_URL.replace(/\/+$/, '')}/chat/completions`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (env.LLM_API_KEY && env.LLM_API_KEY.trim() !== '') {
    headers['Authorization'] = `Bearer ${env.LLM_API_KEY.trim()}`;
  }

  const payload: Record<string, unknown> = {
    model: env.LLM_MODEL,
    messages: params.messages,
    temperature: params.temperature ?? 0.2,
  };

  if (params.jsonMode) {
    payload.response_format = { type: 'json_object' };
  }

  if (params.maxTokens) {
    payload.max_tokens = params.maxTokens;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM request failed (${response.status}): ${errorText || response.statusText}. Please verify LLM_BASE_URL, LLM_API_KEY, and LLM_MODEL in your .env file.`
    );
  }

  const data = await response.json();
  const rawContent = data.choices?.[0]?.message?.content;
  const finishReason = data.choices?.[0]?.finish_reason || '';

  if (!rawContent) {
    throw new Error('LLM returned an empty response');
  }

  return {
    content: rawContent,
    finishReason,
  };
}

/**
 * Structured JSON completion with markdown-fence stripping and chat-style recovery.
 */
export async function callLlmJson<T>(params: {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  schema: z.ZodType<T>;
  temperature?: number;
  maxTokens?: number;
}): Promise<T> {
  const { content: rawContent } = await requestChatCompletion({
    messages: params.messages,
    temperature: params.temperature,
    maxTokens: params.maxTokens,
    jsonMode: true,
  });

  // Extract JSON object if wrapped in conversational text or markdown code fences
  let cleaned = rawContent.trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }

  try {
    const parsed = JSON.parse(cleaned);
    return params.schema.parse(parsed);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('Failed to parse LLM structured output:', rawContent);
    throw new Error(`Failed to parse LLM structured output: ${errorMessage}`);
  }
}

/**
 * Markdown completion with automatic continuation when `maxTokens` truncates output.
 * Feeds the partial assistant turn back and asks the model to keep going, so the
 * final content is never silently cut (A3).
 */
export async function callLlmMarkdown(params: {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  temperature?: number;
  maxTokens?: number;
  maxContinuations?: number;
}): Promise<string> {
  const maxContinuations = params.maxContinuations ?? 3;
  let messages: LlmResponse['content'][] = [];

  let result = '';
  let continuation = 0;
  let messagesBase = [...params.messages];

  for (;;) {
    const response = await requestChatCompletion({
      messages: messagesBase,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
    });

    result += response.content;

    if (response.finishReason === 'length' && continuation < maxContinuations) {
      continuation++;
      messagesBase = [
        ...messagesBase,
        { role: 'assistant' as const, content: response.content },
        {
          role: 'user' as const,
          content:
            'Continúa exactamente donde te quedaste, sin repetir contenido y manteniendo el formato, hasta completar la sección.',
        },
      ];
      continue;
    }

    break;
  }

  return result;
}

export async function refinePrompt(rawInput: string): Promise<RefineResult> {
  if (!rawInput || rawInput.trim().length === 0) {
    throw new Error('Input text cannot be empty');
  }

  return callLlmJson({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: rawInput.trim() },
    ],
    schema: refineResultSchema,
    temperature: 0.3,
  });
}