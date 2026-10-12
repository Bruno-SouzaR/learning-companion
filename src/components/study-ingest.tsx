'use client';

import React, { useState } from 'react';
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  Loader2,
  Sparkles,
  BookOpen,
  ArrowRight,
  BrainCircuit,
  Check,
  AlertCircle,
  Tag,
  RotateCcw,
} from 'lucide-react';
import type { IngestDocumentResult } from '@/server/document-ingestor';

interface StudyIngestProps {
  onIngested?: (result: IngestDocumentResult) => void;
  onNavigateToRecords?: () => void;
}

export function StudyIngest({ onIngested, onNavigateToRecords }: StudyIngestProps) {
  const [inputMode, setInputMode] = useState<'file' | 'text'>('file');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [textContent, setTextContent] = useState('');
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<IngestDocumentResult | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    if (file && !title) {
      // Auto-populate title from clean filename
      const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ');
      setTitle(cleanName.charAt(0).toUpperCase() + cleanName.slice(1));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    if (!title.trim() || !topic.trim()) {
      setErrorMessage('Título e tópico são campos obrigatórios.');
      return;
    }

    if (inputMode === 'file' && !selectedFile) {
      setErrorMessage('Selecione um arquivo PDF para upload.');
      return;
    }

    if (inputMode === 'text' && !textContent.trim()) {
      setErrorMessage('O conteúdo do texto não pode estar vazio.');
      return;
    }

    setIsLoading(true);

    try {
      let res: Response;

      if (inputMode === 'file' && selectedFile) {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('title', title.trim());
        formData.append('topic', topic.trim());
        if (tagsInput.trim()) {
          formData.append('tags', tagsInput.trim());
        }

        res = await fetch('/api/study/ingest', {
          method: 'POST',
          body: formData,
        });
      } else {
        const tags = tagsInput
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);

        res = await fetch('/api/study/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title.trim(),
            topic: topic.trim(),
            content: textContent.trim(),
            tags: tags.length > 0 ? tags : undefined,
          }),
        });
      }

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Falha ao processar material de estudo.');
      }

      setResult(json.data);
      onIngested?.(json.data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro inesperado durante a ingestão.';
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  }

  function handleReset() {
    setResult(null);
    setSelectedFile(null);
    setTextContent('');
    setTitle('');
    setTopic('');
    setTagsInput('');
    setErrorMessage(null);
  }

  if (result) {
    return (
      <div className="w-full space-y-6 bg-slate-900/60 border border-slate-800 rounded-xl p-5 md:p-7 shadow-xl backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-md bg-emerald-950/80 border border-emerald-800 text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
              </span>
              <h3 className="text-lg font-bold text-slate-100">{result.title}</h3>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Tópico: <strong className="text-slate-300">{result.topic}</strong> &bull; Salvo em{' '}
              <code className="text-indigo-400 font-mono text-[11px]">{result.filePath}</code>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Ingerir Outro</span>
            </button>
            {onNavigateToRecords && (
              <button
                onClick={onNavigateToRecords}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow transition-colors cursor-pointer"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Ver no Caderno</span>
              </button>
            )}
          </div>
        </div>

        {/* Ingestion Metrics Overview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
            <span className="text-[11px] text-slate-400 uppercase tracking-wider block">Seções</span>
            <span className="text-lg font-bold text-slate-200">{result.sections.length}</span>
          </div>
          <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
            <span className="text-[11px] text-slate-400 uppercase tracking-wider block">Tokens</span>
            <span className="text-lg font-bold text-indigo-400">~{result.totalTokens}</span>
          </div>
          <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
            <span className="text-[11px] text-slate-400 uppercase tracking-wider block">Questões</span>
            <span className="text-lg font-bold text-emerald-400">{result.drills.length}</span>
          </div>
          <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
            <span className="text-[11px] text-slate-400 uppercase tracking-wider block">Fila SRS</span>
            <span className="text-lg font-bold text-amber-400">{result.srsScheduledCount} agendadas</span>
          </div>
        </div>

        {/* Section Summaries Accordion/Cards */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>Resumos Seccionais Gerados</span>
          </h4>

          {result.sections.map((section, idx) => (
            <div key={idx} className="p-4 rounded-lg bg-slate-950/80 border border-slate-800 space-y-2">
              <h5 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <span className="text-xs px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                  Seção {idx + 1}
                </span>
                {section.sectionTitle}
              </h5>
              <ul className="text-xs text-slate-300 space-y-1 pl-4 list-disc marker:text-indigo-400">
                {section.keyPoints.map((kp, kIdx) => (
                  <li key={kIdx}>{kp}</li>
                ))}
              </ul>
              <div className="pt-2 text-xs text-slate-400 leading-relaxed border-t border-slate-800/80">
                {section.summaryText}
              </div>
            </div>
          ))}
        </div>

        {/* Active Recall Drills Preview */}
        {result.drills.length > 0 && (
          <div className="space-y-3 pt-2 border-t border-slate-800">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <BrainCircuit className="w-3.5 h-3.5 text-emerald-400" />
              <span>Questões de Fixação Adicionadas ao SRS</span>
            </h4>
            <div className="grid grid-cols-1 gap-2.5">
              {result.drills.map((drill, idx) => (
                <div key={idx} className="p-3.5 rounded-lg bg-slate-950/80 border border-slate-800 space-y-1.5">
                  <span className="text-xs font-semibold text-slate-200 block">
                    Q{idx + 1}: {drill.question}
                  </span>
                  <p className="text-xs text-slate-400">
                    <strong className="text-emerald-400">Resposta Esperada:</strong> {drill.expectedAnswer}
                  </p>
                  {drill.clozeHint && (
                    <span className="inline-block text-[11px] font-mono text-indigo-300 bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-900/60">
                      Lacuna: {drill.clozeHint}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full space-y-5 bg-slate-900/60 border border-slate-800 rounded-xl p-5 md:p-6 shadow-xl backdrop-blur-sm">
      {/* Mode Selector Tabs */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Formato de Entrada</span>
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button
            type="button"
            onClick={() => setInputMode('file')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              inputMode === 'file'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Upload PDF</span>
          </button>
          <button
            type="button"
            onClick={() => setInputMode('text')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              inputMode === 'text'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Colar Texto</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Dual Input: File Dropzone or Textarea */}
        {inputMode === 'file' ? (
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 block mb-1.5">
              Selecione o Arquivo PDF
            </label>
            <div className="relative border-2 border-dashed border-slate-800 hover:border-indigo-500/60 rounded-xl p-6 text-center transition-all bg-slate-950/40 cursor-pointer">
              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={handleFileChange}
                disabled={isLoading}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
              />
              <div className="flex flex-col items-center justify-center space-y-2 pointer-events-none">
                <div className="w-10 h-10 rounded-full bg-indigo-950/80 border border-indigo-800/80 flex items-center justify-center text-indigo-400">
                  <UploadCloud className="w-5 h-5" />
                </div>
                {selectedFile ? (
                  <div>
                    <span className="text-sm font-semibold text-emerald-400 block">{selectedFile.name}</span>
                    <span className="text-xs text-slate-400">
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB &bull; Clique para trocar
                    </span>
                  </div>
                ) : (
                  <div>
                    <span className="text-sm font-semibold text-slate-200 block">
                      Arraste um PDF ou clique para navegar
                    </span>
                    <span className="text-xs text-slate-400 block mt-0.5">
                      Processamento 100% local com extração in-process e zero egress
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div>
            <label htmlFor="study-text-input" className="text-xs font-semibold uppercase tracking-wider text-slate-300 block mb-1.5">
              Conteúdo do Documento ou Artigo
            </label>
            <textarea
              id="study-text-input"
              rows={6}
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              placeholder="Cole aqui o conteúdo de um capítulo, anotações de aula ou artigo técnico..."
              disabled={isLoading}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-lg p-3.5 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all resize-y"
            />
          </div>
        )}

        {/* Metadata Inputs: Title & Topic */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="study-title" className="text-xs font-semibold uppercase tracking-wider text-slate-300 block mb-1.5">
              Título do Material
            </label>
            <input
              id="study-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Sistemas Distribuídos: Teorema CAP"
              disabled={isLoading}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
            />
          </div>

          <div>
            <label htmlFor="study-topic" className="text-xs font-semibold uppercase tracking-wider text-slate-300 block mb-1.5">
              Tópico / Disciplina
            </label>
            <input
              id="study-topic"
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Ex: Arquitetura de Software"
              disabled={isLoading}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
            />
          </div>
        </div>

        {/* Tags */}
        <div>
          <label htmlFor="study-tags" className="text-xs font-semibold uppercase tracking-wider text-slate-300 block mb-1.5">
            Tags (separadas por vírgula)
          </label>
          <input
            id="study-tags"
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="Ex: computação, bancos-de-dados, acid"
            disabled={isLoading}
            className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
          />
        </div>

        {/* Inline Error */}
        {errorMessage && (
          <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Action Button */}
        <div className="pt-2 flex items-center justify-between">
          <span className="text-xs text-slate-400 hidden sm:inline">
            Gera resumos seccionais, cartões no wiki e agendamento no SRS.
          </span>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white shadow-lg shadow-indigo-600/20 transition-all cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Processando com Gemma 4...</span>
              </>
            ) : (
              <>
                <span>Ingerir e Gerar Questões</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
