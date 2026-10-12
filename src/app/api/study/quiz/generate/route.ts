import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateQuizFromStudyEntry } from '@/server/quiz-engine';

const generateQuizSchema = z.object({
  studyEntryId: z.string().trim().min(1, 'studyEntryId é obrigatório'),
  questionCount: z.number().min(1).max(20).optional(),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = generateQuizSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || 'Dados inválidos' },
        { status: 400 }
      );
    }

    const quiz = await generateQuizFromStudyEntry(
      parsed.data.studyEntryId,
      parsed.data.questionCount || 10
    );

    return NextResponse.json({
      success: true,
      data: quiz,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Falha ao gerar simulado';
    console.error('API /api/study/quiz/generate error:', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
