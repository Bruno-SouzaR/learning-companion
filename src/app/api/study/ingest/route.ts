import { NextResponse } from 'next/server';
import { z } from 'zod';
import { extractTextFromPdf } from '@/server/pdf-extractor';
import { ingestDocument } from '@/server/document-ingestor';

const jsonIngestSchema = z.object({
  title: z.string().trim().min(1, 'O título do documento é obrigatório'),
  topic: z.string().trim().min(1, 'O tópico do documento é obrigatório'),
  content: z.string().trim().min(1, 'O conteúdo do documento não pode estar vazio'),
  tags: z.array(z.string()).optional(),
});

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || '';

    // Handle multipart/form-data (PDF file upload)
    if (contentType.includes('multipart/form-data')) {
      let formData: FormData;
      try {
        formData = await request.formData();
      } catch {
        return NextResponse.json(
          { success: false, error: 'Formato multipart inválido ou arquivo ausente.' },
          { status: 400 }
        );
      }
      const file = formData.get('file') as File | null;
      const title = (formData.get('title') as string) || '';
      const topic = (formData.get('topic') as string) || '';
      const tagsRaw = formData.get('tags') as string | null;

      if (!file) {
        return NextResponse.json(
          { success: false, error: 'Nenhum arquivo enviado.' },
          { status: 400 }
        );
      }

      if (!title.trim() || !topic.trim()) {
        return NextResponse.json(
          { success: false, error: 'Título e tópico são campos obrigatórios.' },
          { status: 400 }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const extracted = await extractTextFromPdf(buffer);

      let tags: string[] = [];
      if (tagsRaw) {
        try {
          tags = JSON.parse(tagsRaw);
        } catch {
          tags = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean);
        }
      }

      const result = await ingestDocument({
        title: title.trim(),
        topic: topic.trim(),
        rawText: extracted.text,
        sourceFilename: file.name,
        tags: tags.length > 0 ? tags : undefined,
      });

      return NextResponse.json({
        success: true,
        data: {
          ...result,
          extractedPages: extracted.pages,
        },
      });
    }

    // Handle application/json (Raw text or pasted document)
    const json = await request.json();
    const parsed = jsonIngestSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.errors[0]?.message || 'Dados inválidos para ingestão de documento',
        },
        { status: 400 }
      );
    }

    const result = await ingestDocument({
      title: parsed.data.title,
      topic: parsed.data.topic,
      rawText: parsed.data.content,
      tags: parsed.data.tags,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Falha na ingestão do documento';
    console.error('API /api/study/ingest error:', error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
