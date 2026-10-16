import fs from 'node:fs';
import { extractTextFromPdf, chunkTextBySections } from '../src/server/pdf-extractor';
import { callLlmMarkdown } from '../src/server/llm';
import {
  parseSectionMarkdown,
  SECTION_STANDARDS_PROMPT,
  sanitizePortugueseMarkdown,
  pruneDanglingMarkdownTail,
} from '../src/server/section-synthesizer';

async function runBenchmark() {
  console.log('=== BENCHMARK: GEMMA 4 E4B (8k Context + Flash Attention + 4000-token Chunk) ===\n');

  const pdfPath = '/var/home/brunosouzar/Downloads/Sistema de arquivos.pdf';
  if (!fs.existsSync(pdfPath)) {
    console.error('PDF file not found:', pdfPath);
    process.exit(1);
  }

  console.log('1. Lendo PDF e fatiando em chunks originais de 4.000 tokens...');
  const t0 = performance.now();
  const buffer = fs.readFileSync(pdfPath);
  const doc = await extractTextFromPdf(buffer);
  const chunks = chunkTextBySections(doc.text, 4000, 200);
  const prepTime = ((performance.now() - t0) / 1000).toFixed(2);

  console.log(`   Tokens limpos totais: ${doc.estimatedTokens}`);
  console.log(`   Total de seções: ${chunks.length}`);
  console.log(`   Tokens do chunk da Seção 1: ${chunks[0].estimatedTokens}`);
  console.log(`   Tempo de leitura e fatiamento: ${prepTime}s\n`);

  console.log('2. Sintetizando Seção 1 com Gemma 4 E4B Q5_K_M (Porta 8085, Flash Attention, 8k Context, maxTokens: 2400)...');

  const userMessageContent = `${chunks[0].content}

---
CRITICAL INSTRUCTION FOR THIS SECTION (Execute over the source text above):
1. STRICT TECHNICAL TITLE (PT-BR): Provide a specific heading (#) that explicitly names the primary technology, algorithm, or data structure in this section. NEVER use generic titles like "Sistema de Arquivos", "Introdução", "Resumo", or "Seção 1".
2. EXHAUSTIVE CONCEPT COVERAGE WITH CLEAN CLOSURE:
   - Extract ### Pontos Nucleares (5-8 bullets).
   - Expand every technical concept into ### [Nome do Conceito] with Definição Teórica, Mecanismo & Aplicação Prática, and Exemplo Prático.
   - Every opened subtopic and bullet MUST be fully explained and cleanly closed with terminal punctuation. NEVER leave an empty bullet like "- **Exemplo Prático:**" without its explanation.
3. CODE & TABLES: Close all code blocks with \`\`\`. Use markdown tables "| Mecanismo | Vantagens | Desvantagens |" when comparing mechanisms.
4. IGNORE TEXTBOOK QUIZZES: Completely omit "Verificando o Aprendizado", questionnaires, and bibliographies.`;

  const tSynth0 = performance.now();
  const rawMarkdown = await callLlmMarkdown({
    messages: [
      {
        role: 'system',
        content: `${SECTION_STANDARDS_PROMPT}\nTarget Document: "Sistema de Arquivos" (Topic: Sistemas Operacionais). Processing Section 1 of ${chunks.length}. Output all content strictly in Brazilian Portuguese (PT-BR).`,
      },
      { role: 'user', content: userMessageContent },
    ],
    temperature: 0.25,
    topP: 0.90,
    topK: 64,
    presencePenalty: 0.0,
    repeatPenalty: 1.05,
    maxTokens: 2400,
    maxContinuations: 2,
    model: 'gemma-4-e4b',
    baseUrl: 'http://127.0.0.1:8085/v1',
  });
  const synthDuration = ((performance.now() - tSynth0) / 1000).toFixed(2);

  const pruned = pruneDanglingMarkdownTail(rawMarkdown);
  const sanitized = sanitizePortugueseMarkdown(pruned);
  const section = parseSectionMarkdown(sanitized);

  console.log(`\n=== RESULTADO DA SÍNTESE (Gemma 4 E4B Q5_K_M) ===`);
  console.log(`Tempo total da Seção 1: ${synthDuration}s`);
  console.log(`Título da Seção: ${section.sectionTitle}`);
  console.log(`Pontos Nucleares: ${section.keyPoints.length}`);
  console.log(`Tamanho do Markdown gerado: ${section.markdown.length} caracteres\n`);

  console.log('--- PONTOS NUCLEARES GERADOS ---');
  section.keyPoints.forEach((kp, idx) => {
    console.log(` [${idx + 1}] ${kp}`);
  });

  const hasSpanish = /definici[oó]n|aplicaci[oó]n|ejemplo|ventajas/i.test(section.markdown);
  console.log(`\nVazamento de Espanhol? ${hasSpanish ? 'SIM' : 'NÃO (100% PT-BR PURO)'}`);

  const hasTables = /\|.*\|[\r\n]+\|[-:| ]+\|/.test(section.markdown);
  console.log(`Tabelas Markdown geradas? ${hasTables ? 'SIM' : 'NÃO'}`);

  const hasDanglingBullet = /[-*]\s+\*\*[^*]+\*\*:\s*$/m.test(section.markdown);
  console.log(`Possui tópicos vazios pendurados (dangling bullets)? ${hasDanglingBullet ? 'SIM (RUIM)' : 'NÃO (FECHAMENTO PERFEITO)'}`);

  console.log('\n--- ÚLTIMAS 5 LINHAS DO TEXTO GERADO ---');
  const lastLines = section.markdown.trim().split('\n').slice(-5).join('\n');
  console.log(lastLines);

  fs.writeFileSync('/tmp/gemma_e4b_8k_section1.md', section.markdown, 'utf-8');
  console.log('\nArquivo gravado em /tmp/gemma_e4b_8k_section1.md');
}

runBenchmark().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
