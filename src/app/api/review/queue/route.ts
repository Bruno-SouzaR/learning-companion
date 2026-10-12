import { NextResponse } from 'next/server';
import { getDueReviewItems, getSrsOverview } from '@/server/srs-engine';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const moduleParam = searchParams.get('module') as 'english' | 'studies' | null;
    const limit = Math.min(Number(searchParams.get('limit')) || 20, 50);

    const items = getDueReviewItems({
      module: moduleParam || undefined,
      limit,
    });

    const overview = getSrsOverview();

    return NextResponse.json({
      success: true,
      data: {
        items,
        overview,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Falha ao buscar fila de revisão';
    console.error('API /api/review/queue error:', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
