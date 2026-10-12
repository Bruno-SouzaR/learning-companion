import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSession } from '@/server/session-manager';

const startSessionSchema = z.object({
  title: z.string().trim().min(1, 'O título da sessão é obrigatório'),
  module: z.enum(['english', 'studies']),
  topic: z.string().trim().min(1, 'O tópico da sessão é obrigatório'),
  objective: z.string().trim().min(1, 'O objetivo da sessão é obrigatório'),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = startSessionSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || 'Dados inválidos para iniciar sessão' },
        { status: 400 }
      );
    }

    const session = createSession(parsed.data);

    return NextResponse.json({
      success: true,
      data: session,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Falha ao iniciar sessão de estudo';
    console.error('API /api/session/start error:', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
