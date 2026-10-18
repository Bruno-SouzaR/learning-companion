import { NextResponse } from 'next/server';
import { z } from 'zod';
import { retryIngestSection } from '@/server/ingest-job-manager';

const retrySectionSchema = z.object({
  jobId: z.string().trim().min(1, 'jobId é obrigatório'),
  sectionIndex: z.coerce.number().int().positive('sectionIndex deve ser um número positivo'),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = retrySectionSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || 'Dados inválidos' },
        { status: 400 }
      );
    }

    const { jobId, sectionIndex } = parsed.data;
    const updatedSection = await retryIngestSection(jobId, sectionIndex);

    return NextResponse.json({
      success: true,
      data: updatedSection,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Falha ao reanalisar seção';
    console.error(`[POST /api/study/section/retry] Error:`, err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
