import fs from 'node:fs';
import { extractTextFromPdf, chunkTextBySections } from '../src/server/pdf-extractor';
import { INGEST_CHUNK_TOKENS } from '../src/server/ingest-job-manager';
import { callLlmMarkdown } from '../src/server/llm';
import { parseSectionMarkdown } from '../src/server/section-synthesizer';

const SECTION_STANDARDS_PROMPT = `Você é um professor e autor acadêmico de Ciência da Computação e Engenharia de Software.
Sua missão é sintetizar seções de materiais de estudo em um formato Markdown rico, altamente didático e conceitualmente rigoroso.

DIRETRIZES DE SAÍDA:
- Escreva estritamente em Português do Brasil (PT-BR). NUNCA misture termos em espanhol (como "definición", "mecanismo & aplicación", "ejemplo").
- Produza um bloco inicial com "### Pontos Nucleares" contendo de 5 a 8 tópicos essenciais.
- Desenvolva cada conceito com Definição Teórica, Mecanismo Prático e Exemplos Reais.
- Utilize tabelas Markdown comparativas sempre que houver comandos, tipos ou estruturas de dados.
- Saída puramente em Markdown sem cercas de código adicionais.`;

async function runBenchmark() {
  console.log('=== BENCHMARK: QWEN 3.5 4B (Porta 8080) vs BASELINE GEMMA 4 E4B ===\n');

  const pdfPath = '/var/home/brunosouzar/Downloads/Sistema de arquivos.pdf';
  if (!fs.existsSync(pdfPath)) {
    console.error('PDF file not found:', pdfPath);
    process.exit(1);
  }

  console.log('1. Lendo PDF com pdf-parse...');
  const t0 = performance.now();
  const buffer = fs.readFileSync(pdfPath);
  const doc = await extractTextFromPdf(buffer);
  const extractDuration = ((performance.now() - t0) / 1000).toFixed(2);
  console.log(`   Páginas: ${doc.pages}`);
  console.log(`   Tokens estimados: ${doc.estimatedTokens}`);
  console.log(`   Tempo de extração: ${extractDuration}s\n`);

  console.log('2. Fatiando texto em seções semânticas...');
  const chunks = chunkTextBySections(doc.text, INGEST_CHUNK_TOKENS);
  console.log(`   Total de seções: ${chunks.length}`);
  console.log(`   Tokens do chunk da Seção 1: ${chunks[0].estimatedTokens}\n`);

  console.log('3. Sintetizando Seção 1 com Qwen 3.5 4B (Porta 8080)...');
  const tSynth0 = performance.now();
  const rawMarkdown = await callLlmMarkdown({
    messages: [
      {
        role: 'system',
        content: `${SECTION_STANDARDS_PROMPT}\nDocumento: "Sistema de Arquivos" (Tema: Sistemas Operacionais). Processando 1 de ${chunks.length}.`,
      },
      { role: 'user', content: chunks[0].content },
    ],
    temperature: 0.2,
    maxTokens: 1800,
    maxContinuations: 1,
    model: 'qwen3.5:4b-q5',
  });
  const synthDuration = ((performance.now() - tSynth0) / 1000).toFixed(2);
  const section = parseSectionMarkdown(rawMarkdown);

  console.log(`\n=== RESULTADO DA SÍNTESE (Qwen 3.5 4B) ===`);
  console.log(`Tempo de Síntese: ${synthDuration}s`);
  console.log(`Título da Seção: ${section.sectionTitle}`);
  console.log(`Pontos Nucleares: ${section.keyPoints.length}`);
  console.log(`Tamanho do Markdown: ${section.markdown.length} caracteres\n`);

  console.log('--- PONTOS NUCLEARES GERADOS ---');
  section.keyPoints.forEach((kp, idx) => {
    console.log(` [${idx + 1}] ${kp}`);
  });

  console.log('\n--- VERIFICAÇÃO DE IDIOMA E ESTRUTURA ---');
  const hasSpanish = /definici[oó]n|aplicaci[oó]n|ejemplo/i.test(section.markdown);
  console.log(`Vazamento de Espanhol detectado? ${hasSpanish ? 'SIM (RUIM)' : 'NÃO (100% PT-BR PURO)'}`);

  const hasTables = /\|.*\|[\r\n]+\|[-:| ]+\|/.test(section.markdown);
  console.log(`Tabelas Markdown geradas? ${hasTables ? 'SIM' : 'NÃO'}`);

  // Save outputs
  fs.writeFileSync('/tmp/qwen4b_section1_output.md', rawMarkdown, 'utf-8');
  console.log('\nOutput completo gravado em /tmp/qwen4b_section1_output.md');
}

runBenchmark().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
