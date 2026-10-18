import http from 'node:http';
import https from 'node:https';
import { z } from 'zod';
import { getEnv, getEnglishModel } from './env';

async function postJson(
  urlStr: string,
  headers: Record<string, string>,
  payload: Record<string, unknown>
): Promise<{ status: number; text: string }> {
  const url = new URL(urlStr);
  const client = url.protocol === 'https:' ? https : http;
  const postData = JSON.stringify(payload);

  const reqHeaders: Record<string, string> = {
    ...headers,
    'Content-Type': 'application/json',
    'Content-Length': String(Buffer.byteLength(postData)),
  };

  const { promise, resolve, reject } = Promise.withResolvers<{ status: number; text: string }>();

  const req = client.request(
    url,
    {
      method: 'POST',
      headers: reqHeaders,
      timeout: 0, // No socket timeout: AI completions on local GPU can take as long as needed
    },
    (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf-8');
        resolve({ status: res.statusCode || 200, text });
      });
    }
  );

  req.on('error', (err) => reject(err));
  req.write(postData);
  req.end();

  return promise;
}
export { refinePrompt, refineResultSchema, type RefineResult } from './english-coach';

export interface ModelSamplingProfile {
  temperature: number;
  topP?: number;
  topK?: number;
  presencePenalty?: number;
  repeatPenalty?: number;
}

export const GEMMA_SAMPLING_PROFILE: ModelSamplingProfile = {
  temperature: 0.25,
  topP: 0.90,
  topK: 64,
  presencePenalty: 0.0,
  repeatPenalty: 1.05,
};

export const QWEN_SAMPLING_PROFILE: ModelSamplingProfile = {
  temperature: 0.2,
  topP: 0.90,
  topK: 40,
  presencePenalty: 0.0,
  repeatPenalty: 1.05,
};

export const DEFAULT_SAMPLING_PROFILE: ModelSamplingProfile = {
  temperature: 0.2,
};

export function resolveModelSamplingProfile(modelName: string): ModelSamplingProfile {
  if (/gemma/i.test(modelName)) return GEMMA_SAMPLING_PROFILE;
  if (/qwen/i.test(modelName)) return QWEN_SAMPLING_PROFILE;
  return DEFAULT_SAMPLING_PROFILE;
}
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
    Connection: 'keep-alive',
  };

  if (env.LLM_API_KEY && env.LLM_API_KEY.trim() !== '') {
    headers['Authorization'] = `Bearer ${env.LLM_API_KEY.trim()}`;
  }
  const resolvedModel = params.model || env.LLM_MODEL;
  const profile = resolveModelSamplingProfile(resolvedModel);

  const payload: Record<string, unknown> = {
    model: resolvedModel,
    messages: params.messages,
    temperature: params.temperature !== undefined ? params.temperature : profile.temperature,
  };

  const topP = params.topP !== undefined ? params.topP : profile.topP;
  if (topP !== undefined) payload.top_p = topP;

  const topK = params.topK !== undefined ? params.topK : profile.topK;
  if (topK !== undefined) payload.top_k = topK;

  const presencePenalty =
    params.presencePenalty !== undefined ? params.presencePenalty : profile.presencePenalty;
  if (presencePenalty !== undefined) payload.presence_penalty = presencePenalty;

  const repeatPenalty =
    params.repeatPenalty !== undefined ? params.repeatPenalty : profile.repeatPenalty;
  if (repeatPenalty !== undefined) payload.repetition_penalty = repeatPenalty;
  if (params.jsonMode) {
    payload.response_format = { type: 'json_object' };
  }

  if (params.maxTokens) {
    payload.max_tokens = params.maxTokens;
  }

  // In test environment, use globalThis.fetch to support Vitest spies/mocks
  if (process.env.NODE_ENV === 'test') {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM request failed (${response.status}): ${errorText || response.statusText}`);
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content;
    const finishReason = data.choices?.[0]?.finish_reason || '';

    if (!rawContent) {
      throw new Error('LLM returned an empty response');
    }

    return { content: rawContent, finishReason };
  }

  // In production/server runtime, use native node:http to avoid Next.js 300s fetch headers timeout
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { status, text: resText } = await postJson(endpoint, headers, payload);

      if (status < 200 || status >= 300) {
        throw new Error(
          `LLM request failed (${status}): ${resText}. Please verify LLM_BASE_URL, LLM_API_KEY, and LLM_MODEL in your .env file.`
        );
      }

      const data = JSON.parse(resText);
      const rawContent = data.choices?.[0]?.message?.content;
      const finishReason = data.choices?.[0]?.finish_reason || '';

      if (!rawContent) {
        throw new Error('LLM returned an empty response');
      }

      return {
        content: rawContent,
        finishReason,
      };
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[LLM request attempt ${attempt}/2 failed]: ${lastError.message}`);
      if (attempt < 2) {
        const { promise, resolve } = Promise.withResolvers<void>();
        setTimeout(resolve, 2000);
        await promise;
      }
    }
  }

  throw lastError || new Error('LLM request failed after retries');
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
 * Safely merges a previous markdown turn with its continuation chunk,
 * removing duplicate overlapping headers, repairing interrupted bullet prefixes,
 * and eliminating repetition stutters at the boundary seam.
 */
export function mergeContinuationText(prevText: string, nextChunk: string): string {
  if (!prevText) return nextChunk;
  if (!nextChunk) return prevText;

  // 1. Check for stuttered bullet prefix e.g. prev ended with "- **Def" and next starts with "- **Definição"
  const partialBulletMatch = prevText.match(/[-*]\s+\*\*([A-Za-zÀ-ÿ]{1,6})$/);
  if (partialBulletMatch) {
    const partialWord = partialBulletMatch[1].toLowerCase();
    const nextBulletMatch = nextChunk.trimStart().match(/^[-*]\s+\*\*([A-Za-zÀ-ÿ]+)/);
    if (nextBulletMatch && nextBulletMatch[1].toLowerCase().startsWith(partialWord)) {
      const strippedPrev = prevText.slice(0, prevText.lastIndexOf(partialBulletMatch[0])).trimEnd();
      return strippedPrev + '\n' + nextChunk.trimStart();
    }
  }

  // 2. Suffix-prefix overlap check for >= 10 characters
  const cleanPrev = prevText.trimEnd();
  const cleanNext = nextChunk.trimStart();
  const maxOverlapCheck = Math.min(200, cleanPrev.length, cleanNext.length);
  for (let len = maxOverlapCheck; len >= 10; len--) {
    const prevSuffix = cleanPrev.slice(-len);
    const nextPrefix = cleanNext.slice(0, len);
    if (prevSuffix.toLowerCase() === nextPrefix.toLowerCase()) {
      return cleanPrev + cleanNext.slice(len);
    }
  }

  // 3. Duplicate line overlap check
  const prevLines = cleanPrev.split('\n');
  const nextLines = cleanNext.split('\n');
  const lastPrevLine = prevLines[prevLines.length - 1].trim();
  const firstNextLine = nextLines[0].trim();
  if (
    lastPrevLine.length > 5 &&
    firstNextLine.length > 5 &&
    lastPrevLine.toLowerCase() === firstNextLine.toLowerCase()
  ) {
    return cleanPrev + '\n' + nextLines.slice(1).join('\n');
  }

  // 4. Default: preserve clean concatenation
  return prevText + nextChunk;
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

    if (result === '') {
      result = response.content;
    } else {
      result = mergeContinuationText(result, response.content);
    }

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