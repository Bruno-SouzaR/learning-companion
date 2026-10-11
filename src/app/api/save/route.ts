import { NextResponse } from 'next/server';
import { z } from 'zod';
import { saveEnglishPracticeEntry } from '@/server/wiki-store';

const saveRequestSchema = z.object({
  title: z.string().min(1),
  input_pt: z.string().min(1),
  target_en: z.string().min(1),
  mistakes_summary: z.array(z.string()).default([]),
  key_vocabulary: z.array(
    z.object({
      term: z.string(),
      definition: z.string(),
    })
  ).default([]),
  tags: z.array(z.string()).default([]),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = saveRequestSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.errors[0]?.message || 'Dados inválidos para salvamento',
        },
        { status: 400 }
      );
    }

    const saved = await saveEnglishPracticeEntry(parsed.data);

    return NextResponse.json({
      success: true,
      data: saved,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao salvar anotação';
    console.error('API /api/save error:', error);
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
