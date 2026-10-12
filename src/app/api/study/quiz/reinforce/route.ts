import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateReinforcementQuiz } from '@/server/quiz-engine';

const reinforceQuizSchema = z.object({
  quizId: z.string().trim().min(1, 'quizId é obrigatório'),
  weakSectionIndex: z.number().min(1),
  count: z.number().min(1).max(10).optional(),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = reinforceQuizSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || 'Dados inválidos' },
        { status: 400 }
      );
    }

    const quiz = await generateReinforcementQuiz(
      parsed.data.quizId,
      parsed.data.weakSectionIndex,
      parsed.data.count || 5
    );

    return NextResponse.json({
      success: true,
      data: quiz,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Falha ao gerar reforço de ponto fraco';
    console.error('API /api/study/quiz/reinforce error:', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
