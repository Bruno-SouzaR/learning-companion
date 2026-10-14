import { NextResponse } from 'next/server';
import { z } from 'zod';
import { dismissIngestJob } from '@/server/ingest-job-manager';

const dismissJobSchema = z.object({
  jobId: z.string().trim().min(1, 'jobId é obrigatório'),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = dismissJobSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || 'Dados inválidos' },
        { status: 400 }
      );
    }

    const dismissed = dismissIngestJob(parsed.data.jobId);

    if (!dismissed) {
      return NextResponse.json(
        { success: false, error: `Trabalho com id "${parsed.data.jobId}" não encontrado.` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Trabalho dispensado do painel com sucesso.',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Falha ao dispensar trabalho';
    console.error('API /api/study/ingest/dismiss error:', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
