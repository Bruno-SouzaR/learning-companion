import { NextResponse } from 'next/server';
import { z } from 'zod';
import { submitQuizAnswers } from '@/server/quiz-engine';

const submitQuizSchema = z.object({
  quizId: z.string().trim().min(1, 'quizId é obrigatório'),
  answers: z.record(z.string()),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = submitQuizSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || 'Dados inválidos' },
        { status: 400 }
      );
    }

    const evaluation = await submitQuizAnswers(parsed.data.quizId, parsed.data.answers);

    return NextResponse.json({
      success: true,
      data: evaluation,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Falha ao avaliar respostas do simulado';
    console.error('API /api/study/quiz/submit error:', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
