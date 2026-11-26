import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractTextFromPdf, chunkTextBySections } from '../src/server/pdf-extractor';
import { callLlmMarkdown } from '../src/server/llm';
import { parseSectionMarkdown } from '../src/server/section-synthesizer';

const DIRECT_EXTRACTION_PROMPT = `You are a high-level Computer Science professor and technical textbook author.
Your task is to synthesize the provided study text into a dense, highly structured, pedagogical Markdown summary in Brazilian Portuguese (PT-BR).

DIRECTIVES:
1. STRICT BRAZILIAN PORTUGUESE: Output strictly in PT-BR. Never use Spanish cognates ("Definição Teórica" not "Definición", "Exemplo Prático" not "Ejemplo", "Vantagens" not "Ventajas").
2. STRUCTURE:
   - # Título da Seção (short and descriptive)
   - ### Pontos Nucleares (5-8 direct bullet points with key technical facts)
   - Detailed subtopic sections for every core mechanism:
     ### [Nome do Conceito]
     - **Definição Teórica:** concise, exact
     - **Mecanismo & Aplicação Prática:** how it works under the hood
     - **Exemplo Prático:** concrete real-world command or scenario
   - Comparative Markdown table "| Mecanismo | Vantagens | Desvantagens |" when comparing strategies.
3. CONCISENESS & SPEED: Be technically dense and direct. Avoid rambling or meta-commentary. Output pure Markdown.`;

async function runBenchmark() {
  console.log('=== TESTE DE OTIMIZAÇÃO: Qwen 3.5 2B (Q8_0) com Fatias Menores e Extração Direta ===\n');

  const pdfPath = process.env.BENCH_PDF
    ?? path.join(os.homedir(), 'Downloads', 'Sistema de arquivos.pdf');
  if (!fs.existsSync(pdfPath)) {
    console.error('PDF file not found:', pdfPath);
    process.exit(1);
  }

  console.log('1. Lendo PDF e fatiando com overlap de 200 tokens e limite de 2.400 tokens...');
  const t0 = performance.now();
  const buffer = fs.readFileSync(pdfPath);
  const doc = await extractTextFromPdf(buffer);
  const chunks = chunkTextBySections(doc.text, 2400, 200);
  const prepTime = ((performance.now() - t0) / 1000).toFixed(2);

  console.log(`   Tokens limpos totais: ${doc.estimatedTokens}`);
  console.log(`   Total de seções: ${chunks.length}`);
  console.log(`   Tokens do chunk da Seção 1: ${chunks[0].estimatedTokens}\n`);

  console.log('2. Sintetizando Seção 1 com Qwen 3.5 2B Q8_0 (maxTokens: 1200, maxContinuations: 1)...');
  const tSynth0 = performance.now();
  const rawMarkdown = await callLlmMarkdown({
    messages: [
      {
        role: 'system',
        content: `${DIRECT_EXTRACTION_PROMPT}\nDocumento: "Sistema de Arquivos" (Tema: Sistemas Operacionais). Processando Seção 1 de ${chunks.length}.`,
      },
      { role: 'user', content: chunks[0].content },
    ],
    temperature: 0.2,
    maxTokens: 1200,
    maxContinuations: 1,
    model: 'qwen3.5:2b-q8',
  });
  const synthDuration = ((performance.now() - tSynth0) / 1000).toFixed(2);
  const section = parseSectionMarkdown(rawMarkdown);

  console.log(`\n=== RESULTADO DA SÍNTESE (Qwen 3.5 2B Q8_0) ===`);
  console.log(`Tempo total da Seção 1: ${synthDuration}s`);
  console.log(`Título da Seção: ${section.sectionTitle}`);
  console.log(`Pontos Nucleares: ${section.keyPoints.length}`);
  console.log(`Tamanho do Markdown gerado: ${section.markdown.length} caracteres\n`);

  console.log('--- PONTOS NUCLEARES GERADOS ---');
  section.keyPoints.forEach((kp, idx) => {
    console.log(` [${idx + 1}] ${kp}`);
  });

  const hasSpanish = /definici[oó]n|aplicaci[oó]n|ejemplo|ventajas/i.test(section.markdown);
  console.log(`\nVazamento de Espanhol? ${hasSpanish ? 'SIM (RUIM)' : 'NÃO (100% PT-BR PURO)'}`);

  const hasTables = /\|.*\|[\r\n]+\|[-:| ]+\|/.test(section.markdown);
  console.log(`Tabelas Markdown geradas? ${hasTables ? 'SIM' : 'NÃO'}`);

  console.log('\n--- AMOSTRA DO CONTEÚDO (primeiros 600 caracteres) ---');
  console.log(section.markdown.slice(0, 600));

  fs.writeFileSync('/tmp/qwen2b_q8_optimized_section1.md', rawMarkdown, 'utf-8');
  console.log('\nOutput completo salvo em /tmp/qwen2b_q8_optimized_section1.md');
}

runBenchmark().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
