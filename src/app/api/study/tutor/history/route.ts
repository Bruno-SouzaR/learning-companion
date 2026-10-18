import { NextResponse } from 'next/server';
import {
  getSession,
  getSessionTurns,
  getOrCreateStudySession,
  listSessions,
} from '@/server/session-manager';
import { getDb } from '@/server/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId')?.trim();
    const entryId = searchParams.get('entryId')?.trim();
    const listAll = searchParams.get('list') === 'true';

    // List recent study sessions if requested
    if (listAll) {
      const sessions = listSessions({ module: 'studies' });
      return NextResponse.json({ success: true, data: { sessions } });
    }

    if (sessionId) {
      const session = getSession(sessionId);
      if (!session) {
        return NextResponse.json(
          { success: false, error: `Sessão "${sessionId}" não encontrada.` },
          { status: 404 }
        );
      }
      const turns = getSessionTurns(sessionId);
      return NextResponse.json({
        success: true,
        data: { session, turns },
      });
    }

    if (entryId) {
      const db = getDb();
      const entry = db
        .prepare('SELECT id, title, tags FROM entries WHERE id = ? OR slug = ? LIMIT 1')
        .get(entryId, entryId) as { id: string; title: string; tags: string } | undefined;

      const title = entry?.title || 'Material de Estudo';
      let topic = 'Estudos';
      try {
        const parsedTags = JSON.parse(entry?.tags || '[]');
        if (Array.isArray(parsedTags) && parsedTags.length > 0) {
          topic = parsedTags[0];
        }
      } catch {}
      const session = getOrCreateStudySession({
        entryId: entry?.id || entryId,
        title,
        topic,
      });

      const turns = getSessionTurns(session.id);
      return NextResponse.json({
        success: true,
        data: { session, turns },
      });
    }

    // Default: find or create a general study session
    const session = getOrCreateStudySession({
      title: 'Tutor de Estudos Geral',
      topic: 'Dúvidas e Conceitos Gerais',
    });
    const turns = getSessionTurns(session.id);

    return NextResponse.json({
      success: true,
      data: { session, turns },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Falha ao recuperar histórico do tutor';
    console.error('[GET /api/study/tutor/history] Error:', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
