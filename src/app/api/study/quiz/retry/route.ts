import { NextResponse } from 'next/server';
import { z } from 'zod';
import { evaluateSingleQuestionAttempt } from '@/server/quiz-engine';

const retryQuestionSchema = z.object({
  questionId: z.string().trim().min(1, 'questionId é obrigatório'),
  userAnswer: z.string().trim().min(1, 'Resposta não pode estar vazia'),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = retryQuestionSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || 'Dados inválidos' },
        { status: 400 }
      );
    }

    const attempt = await evaluateSingleQuestionAttempt({
      questionId: parsed.data.questionId,
      userAnswer: parsed.data.userAnswer,
    });

    return NextResponse.json({
      success: true,
      data: attempt,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Falha ao registrar nova tentativa';
    console.error('API /api/study/quiz/retry error:', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
