import { NextResponse } from 'next/server';
import { z } from 'zod';
import { endSession } from '@/server/session-manager';

const endSessionSchema = z.object({
  sessionId: z.string().trim().min(1, 'sessionId é obrigatório'),
  takeaways: z.array(z.string()).optional(),
  keyRules: z
    .array(
      z.object({
        title: z.string().min(1),
        content: z.string().min(1),
      })
    )
    .optional(),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = endSessionSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || 'Dados inválidos para finalizar sessão' },
        { status: 400 }
      );
    }

    const result = await endSession(parsed.data.sessionId, {
      takeaways: parsed.data.takeaways,
      keyRules: parsed.data.keyRules,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Falha ao encerrar sessão de estudo';
    console.error('API /api/session/end error:', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
