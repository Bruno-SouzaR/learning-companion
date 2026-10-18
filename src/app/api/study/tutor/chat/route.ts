import http from 'node:http';
import https from 'node:https';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getOrCreateStudySession,
  recordTurn,
  getSessionTurns,
  getSession,
} from '@/server/session-manager';
import { getStudiesBaseUrl, getStudiesModel } from '@/server/env';
import { getDb } from '@/server/db';

const chatRequestSchema = z.object({
  sessionId: z.string().optional(),
  entryId: z.string().optional(),
  title: z.string().optional(),
  topic: z.string().optional(),
  message: z.string().trim().min(1, 'A mensagem não pode estar vazia'),
});

const SYSTEM_PROMPT_TEMPLATE = `You are a high-level, pedagogical Computer Science and Software Engineering tutor for a Brazilian Portuguese speaking student.
Your mission is to clarify doubts, explain theoretical concepts, detail architectural mechanics, and work through examples with complete mathematical rigor.

CORE RULES:
1. STRICT BRAZILIAN PORTUGUESE (PT-BR): Write all explanations, formulas commentary, and examples in natural, engaging Brazilian Portuguese.
2. GROUNDING IN STUDY MATERIAL: Ground your explanations primarily in the study material provided below. If the student asks about a concept not covered in the text, politely note that it is outside this document's scope, and provide a concise, high-level answer.
3. MATHEMATICAL NOTATION: Use LaTeX formatting ($...$ for inline formulas, $$...$$ for block equations) for all mathematical expressions, algorithms, limits, and complexity notations.
4. STRUCTURE: Use clear Markdown with bold terminology, bullet points, and code blocks with language identifiers where appropriate.`;

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = chatRequestSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || 'Dados inválidos' },
        { status: 400 }
      );
    }

    const { entryId, message } = parsed.data;
    let sessionId = parsed.data.sessionId;

    const db = getDb();

    // 1. Resolve study document content if entryId is provided
    let studyMaterial = '';
    let resolvedTitle = parsed.data.title || 'Material de Estudo';
    let resolvedTopic = parsed.data.topic || 'Estudos';

    if (entryId) {
      const entryRow = db
        .prepare('SELECT id, title, tags, explanation FROM entries WHERE id = ? OR slug = ? LIMIT 1')
        .get(entryId, entryId) as
        | { id: string; title: string; tags: string; explanation: string | null }
        | undefined;

      if (entryRow) {
        resolvedTitle = entryRow.title;
        try {
          const parsedTags = JSON.parse(entryRow.tags || '[]');
          if (Array.isArray(parsedTags) && parsedTags.length > 0) {
            resolvedTopic = parsedTags[0];
          }
        } catch {}
        studyMaterial = entryRow.explanation || '';
      }
    }

    // 2. Resolve or create study session
    let session = sessionId ? getSession(sessionId) : null;
    if (!session) {
      session = getOrCreateStudySession({
        entryId: entryId || undefined,
        title: resolvedTitle,
        topic: resolvedTopic,
      });
      sessionId = session.id;
    }

    // 3. Record user's turn in database
    const userTurn = recordTurn(session.id, {
      role: 'user',
      content: message,
    });

    // 4. Retrieve recent session dialogue turns for conversational context
    const previousTurns = getSessionTurns(session.id);
    // Use up to the last 6 turns before the current one
    const contextTurns = previousTurns
      .filter((t) => t.id !== userTurn.id)
      .slice(-6)
      .map((t) => ({
        role: t.role as 'user' | 'assistant' | 'system',
        content: t.content,
      }));

    // 5. Construct grounded prompt
    const systemContent = studyMaterial
      ? `${SYSTEM_PROMPT_TEMPLATE}\n\n=== DOCUMENTO DE ESTUDO (${resolvedTitle} - ${resolvedTopic}) ===\n${studyMaterial.slice(
          0,
          24000
        )}`
      : SYSTEM_PROMPT_TEMPLATE;

    const messages = [
      { role: 'system' as const, content: systemContent },
      ...contextTurns,
      { role: 'user' as const, content: message },
    ];

    const baseUrl = getStudiesBaseUrl();
    const model = getStudiesModel();
    const endpoint = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

    const payload = {
      model,
      messages,
      temperature: 0.25,
      max_tokens: 2000,
      stream: true,
    };

    // 6. Set up SSE stream to browser
    const url = new URL(endpoint);
    const client = url.protocol === 'https:' ? https : http;
    const postData = JSON.stringify(payload);

    const activeSessionId = session.id;
    let accumulatedText = '';

    const stream = new ReadableStream({
      start(controller) {
        const textEncoder = new TextEncoder();

        // Send initial metadata event with session and user turn
        const initData = JSON.stringify({
          type: 'init',
          sessionId: activeSessionId,
          userTurnId: userTurn.id,
        });
        controller.enqueue(textEncoder.encode(`data: ${initData}\n\n`));

        const req = client.request(
          url,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': String(Buffer.byteLength(postData)),
              Connection: 'keep-alive',
            },
            timeout: 0,
          },
          (res) => {
            let buffer = '';

            res.on('data', (chunk: Buffer) => {
              buffer += chunk.toString('utf-8');
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data: ')) continue;
                const dataPart = trimmed.slice(6);

                if (dataPart === '[DONE]') {
                  continue;
                }

                try {
                  const parsedChunk = JSON.parse(dataPart);
                  const tokenText = parsedChunk.choices?.[0]?.delta?.content;
                  if (tokenText) {
                    accumulatedText += tokenText;
                    const ssePayload = JSON.stringify({
                      type: 'chunk',
                      content: tokenText,
                    });
                    controller.enqueue(textEncoder.encode(`data: ${ssePayload}\n\n`));
                  }
                } catch {
                  // Ignore JSON parse errors on malformed stream chunks
                }
              }
            });

            res.on('end', () => {
              // Record assistant turn in SQLite when stream completes
              if (accumulatedText.trim().length > 0) {
                try {
                  const assistantTurn = recordTurn(activeSessionId, {
                    role: 'assistant',
                    content: accumulatedText.trim(),
                  });
                  const donePayload = JSON.stringify({
                    type: 'done',
                    assistantTurnId: assistantTurn.id,
                    totalText: accumulatedText.trim(),
                  });
                  controller.enqueue(textEncoder.encode(`data: ${donePayload}\n\n`));
                } catch (saveErr) {
                  console.error('Failed to save assistant turn to database:', saveErr);
                }
              }
              controller.close();
            });
          }
        );

        req.on('error', (err) => {
          console.error('[Tutor Stream] Error:', err);
          const errorPayload = JSON.stringify({
            type: 'error',
            error: err.message || 'Erro durante a transmissão de resposta',
          });
          controller.enqueue(textEncoder.encode(`data: ${errorPayload}\n\n`));
          controller.close();
        });

        req.write(postData);
        req.end();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Falha na rota do tutor';
    console.error('[POST /api/study/tutor/chat] Error:', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
