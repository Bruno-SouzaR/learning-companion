import { NextResponse } from 'next/server';
import { z } from 'zod';
import { extractTextFromPdf, cleanExtractedText, chunkTextBySections } from '@/server/pdf-extractor';
import {
  createIngestJob,
  getIngestJob,
  processDocumentInBackground,
} from '@/server/ingest-job-manager';

const jsonIngestSchema = z.object({
  title: z.string().trim().min(1, 'O título do documento é obrigatório'),
  topic: z.string().trim().min(1, 'O tópico do documento é obrigatório'),
  content: z.string().trim().min(1, 'O conteúdo do documento não pode estar vazio'),
  tags: z.array(z.string()).optional(),
});

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let title = '';
    let topic = '';
    let text = '';
    let sourceFilename: string | undefined = undefined;
    let tags: string[] | undefined = undefined;

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
      title = (formData.get('title') as string) || '';
      topic = (formData.get('topic') as string) || '';
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
      text = extracted.text;
      sourceFilename = file.name;

      if (tagsRaw) {
        try {
          tags = JSON.parse(tagsRaw);
        } catch {
          tags = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean);
        }
      }
    } else {
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

      title = parsed.data.title;
      topic = parsed.data.topic;
      text = parsed.data.content;
      tags = parsed.data.tags;
    }

    const cleaned = cleanExtractedText(text);
    if (!cleaned) {
      return NextResponse.json(
        { success: false, error: 'O conteúdo de texto extraído está vazio.' },
        { status: 400 }
      );
    }

    const chunks = chunkTextBySections(cleaned, 4800);
    const totalSections = Math.max(1, chunks.length);

    // Create background job
    const job = createIngestJob({
      title: title.trim(),
      topic: topic.trim(),
      totalSections,
    });

    // Launch background asynchronous synthesis (does not block HTTP response)
    void processDocumentInBackground({
      jobId: job.id,
      title: title.trim(),
      topic: topic.trim(),
      rawText: cleaned,
      sourceFilename,
      tags,
    });

    return NextResponse.json({
      success: true,
      data: {
        jobId: job.id,
        title: job.title,
        topic: job.topic,
        totalSections: job.totalSections,
        status: job.status,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Falha ao iniciar processamento do documento';
    console.error('API /api/study/ingest POST error:', error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId || !jobId.trim()) {
      return NextResponse.json(
        { success: false, error: 'Parâmetro jobId é obrigatório.' },
        { status: 400 }
      );
    }

    const job = getIngestJob(jobId.trim());

    if (!job) {
      return NextResponse.json(
        { success: false, error: `Job com id "${jobId}" não encontrado.` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: job,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Falha ao consultar status da ingestão';
    console.error('API /api/study/ingest GET error:', error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
