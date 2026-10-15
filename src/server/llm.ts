import { z } from 'zod';
import { getEnv, getEnglishModel } from './env';

export const refineResultSchema = z.object({
  title: z.string().describe('Short descriptive title in Portuguese for this practice entry'),
  target_english: z.string().describe('Natural, idiomatic English translation'),
  mistakes_summary: z.array(z.string()).default([]).describe('2-3 concise bullet points in Portuguese explaining grammar, prepositions, or vocabulary mistakes'),
  key_vocabulary: z.array(
    z.object({
      term: z.string().describe('Phrasal verb, collocation, or key word'),
      definition: z.string().describe('Portuguese definition and meaning'),
    })
  ).default([]).describe('Key vocabulary terms and their Portuguese definitions'),
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
- You MUST include all keys in the JSON object: "title", "target_english", "mistakes_summary", "key_vocabulary", and "tags".
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
  model?: string;
  baseUrl?: string;
  topP?: number;
  topK?: number;
  presencePenalty?: number;
  repeatPenalty?: number;
}): Promise<LlmResponse> {
  const env = getEnv();
  const baseUrl = params.baseUrl || env.LLM_BASE_URL;
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (env.LLM_API_KEY && env.LLM_API_KEY.trim() !== '') {
    headers['Authorization'] = `Bearer ${env.LLM_API_KEY.trim()}`;
  }

  const payload: Record<string, unknown> = {
    model: params.model || env.LLM_MODEL,
    messages: params.messages,
    temperature: params.temperature ?? 0.2,
  };

  if (params.topP !== undefined) payload.top_p = params.topP;
  if (params.topK !== undefined) payload.top_k = params.topK;
  if (params.presencePenalty !== undefined) payload.presence_penalty = params.presencePenalty;
  if (params.repeatPenalty !== undefined) payload.repetition_penalty = params.repeatPenalty;

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
  schema: z.ZodType<T, z.ZodTypeDef, any>;
  temperature?: number;
  maxTokens?: number;
  model?: string;
  baseUrl?: string;
}): Promise<T> {
  const { content: rawContent } = await requestChatCompletion({
    messages: params.messages,
    temperature: params.temperature,
    maxTokens: params.maxTokens,
    jsonMode: true,
    model: params.model,
    baseUrl: params.baseUrl,
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
  model?: string;
  baseUrl?: string;
  topP?: number;
  topK?: number;
  presencePenalty?: number;
  repeatPenalty?: number;
}): Promise<string> {
  const maxContinuations = params.maxContinuations ?? 3;
  let result = '';
  let continuation = 0;
  let messagesBase = [...params.messages];

  for (;;) {
    const response = await requestChatCompletion({
      messages: messagesBase,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
      model: params.model,
      baseUrl: params.baseUrl,
      topP: params.topP,
      topK: params.topK,
      presencePenalty: params.presencePenalty,
      repeatPenalty: params.repeatPenalty,
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
            'Continue exactly from where you left off, without repeating previous content and maintaining the formatting, until the section is fully completed. Write strictly in Brazilian Portuguese.',
        },
      ];
      continue;
    }

    break;
  }

  return result;
}

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