import { NextResponse } from 'next/server';
import { z } from 'zod';
import { recordTurn, shouldTriggerCompaction, getSession } from '@/server/session-manager';

const recordTurnSchema = z.object({
  sessionId: z.string().trim().min(1, 'sessionId é obrigatório'),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().trim().min(1, 'O conteúdo do turno não pode estar vazio'),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = recordTurnSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || 'Dados inválidos para registrar turno' },
        { status: 400 }
      );
    }

    const turn = recordTurn(parsed.data.sessionId, {
      role: parsed.data.role,
      content: parsed.data.content,
    });

    const session = getSession(parsed.data.sessionId);
    const needsCompaction = session ? shouldTriggerCompaction(session) : false;

    return NextResponse.json({
      success: true,
      data: {
        turn,
        needsCompaction,
        totalTurns: session?.total_turns || 1,
        totalTokens: session?.total_tokens || turn.token_estimate,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Falha ao registrar turno na sessão';
    console.error('API /api/session/turn error:', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
