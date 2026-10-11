import { NextResponse } from 'next/server';
import { searchWikiEntries, getRecentEntries, syncWikiToDb } from '@/server/wiki-store';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || '';
    const limit = Math.min(Number(searchParams.get('limit')) || 20, 50);
    const shouldSync = searchParams.get('sync') === 'true';

    if (shouldSync) {
      await syncWikiToDb();
    }

    const results = q.trim()
      ? await searchWikiEntries(q.trim(), limit)
      : getRecentEntries(limit);

    return NextResponse.json({
      success: true,
      data: results,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Falha na busca semântica';
    console.error('API /api/search error:', error);
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
