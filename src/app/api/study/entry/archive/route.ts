import { NextResponse } from 'next/server';
import { z } from 'zod';
import { archiveEntry } from '@/server/wiki-store';

const archiveEntrySchema = z.object({
  id: z.string().trim().min(1, 'id do material é obrigatório'),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = archiveEntrySchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || 'Dados inválidos' },
        { status: 400 }
      );
    }

    const archived = archiveEntry(parsed.data.id);

    if (!archived) {
      return NextResponse.json(
        { success: false, error: `Material com id "${parsed.data.id}" não encontrado.` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Material arquivado com sucesso.',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Falha ao arquivar material';
    console.error('API /api/study/entry/archive error:', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
