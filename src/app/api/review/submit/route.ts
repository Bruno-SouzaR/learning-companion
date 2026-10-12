import { NextResponse } from 'next/server';
import { z } from 'zod';
import { reviewItem } from '@/server/srs-engine';

const submitReviewSchema = z.object({
  entryId: z.string().trim().min(1, 'entryId é obrigatório'),
  quality: z
    .number()
    .min(0, 'A nota de qualidade deve ser no mínimo 0')
    .max(5, 'A nota de qualidade deve ser no máximo 5'),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = submitReviewSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || 'Dados inválidos para submissão de revisão' },
        { status: 400 }
      );
    }

    const updated = reviewItem(parsed.data.entryId, parsed.data.quality);

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Falha ao registrar revisão';
    console.error('API /api/review/submit error:', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
