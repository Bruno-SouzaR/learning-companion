import { describe, it, expect, vi, afterEach } from 'vitest';
import { callLlmMarkdown, requestChatCompletion } from '@/server/llm';
import { getEnv } from '@/server/env';

describe('Unit: LLM Markdown Continuation (A3)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function fakeChatResponse(content: string, finishReason: string) {
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: { role: 'assistant', content },
            finish_reason: finishReason,
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  it('runs a single completion and returns content when not truncated', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      fakeChatResponse('Solo respuesta completa.', 'stop')
    );

    // Access env module to satisfy getEnv cache paths (already seeded by import)
    void getEnv;

    const result = await callLlmMarkdown({
      messages: [{ role: 'user', content: 'Demanda texto.' }],
      maxTokens: 2500,
    });

    expect(result).toBe('Solo respuesta completa.');
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
  });

  it('continues when finish_reason is length and concatenates parts', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(fakeChatResponse('Primera parte truncada', 'length'))
      .mockResolvedValueOnce(fakeChatResponse('y la continuación final.', 'stop'));

    const result = await callLlmMarkdown({
      messages: [{ role: 'user', content: 'Genera una sección larga.' }],
      maxTokens: 2500,
      maxContinuations: 3,
    });

    expect(result).toBe('Primera parte truncaday la continuación final.');

    const calls = vi.mocked(globalThis.fetch).mock.calls;
    expect(calls).toHaveLength(2);

    const secondInit = calls[1][1] ?? {};
    const secondDump = JSON.stringify(secondInit.body);
    expect(secondDump).toContain('Primera parte truncada');
    expect(secondDump).toContain('Continue exactly from where you left off');
  });

  it('stops continuing after maxContinuations even if still truncated', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => Promise.resolve(fakeChatResponse('corte', 'length'))
    );

    const result = await callLlmMarkdown({
      messages: [{ role: 'user', content: 'x' }],
      maxTokens: 100,
      maxContinuations: 2,
    });

    expect(result).toBe('cortecortecorte');
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(3); // initial + 2 continuations
  });

  it('exposes finish_reason from requestChatCompletion', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      fakeChatResponse('contenido', 'length')
    );

    const res = await requestChatCompletion({
      messages: [{ role: 'user', content: 'Hola' }],
    });
    expect(res.finishReason).toBe('length');
    expect(res.content).toBe('contenido');
  });
});