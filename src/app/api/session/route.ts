import { NextResponse } from 'next/server';
import { listSessions } from '@/server/session-manager';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const moduleParam = searchParams.get('module') as 'english' | 'studies' | null;
    const statusParam = searchParams.get('status') as 'active' | 'completed' | 'abandoned' | null;

    const sessions = listSessions({
      module: moduleParam || undefined,
      status: statusParam || undefined,
    });

    return NextResponse.json({
      success: true,
      data: sessions,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Falha ao listar sessões de estudo';
    console.error('API /api/session error:', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
