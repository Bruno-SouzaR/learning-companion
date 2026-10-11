import { NextResponse } from 'next/server';
import { z } from 'zod';
import { refinePrompt } from '@/server/llm';

const refineRequestSchema = z.object({
  input: z.string().trim().min(1, 'O texto de entrada não pode estar vazio'),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = refineRequestSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.errors[0]?.message || 'Entrada inválida',
        },
        { status: 400 }
      );
    }

    const result = await refinePrompt(parsed.data.input);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao processar com a LLM';
    console.error('API /api/refine error:', error);
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
