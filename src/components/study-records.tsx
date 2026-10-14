'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search,
  BookOpen,
  Calendar,
  Tag,
  Copy,
  Check,
  Loader2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Folder,
  FolderOpen,
  Layers,
  History,
  Send,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Trash2,
  BrainCircuit,
} from 'lucide-react';
import { MarkdownView } from './markdown-view';
import type { StoredEntry, QuestionAttemptView } from '@/server/wiki-store';
interface StudyRecordsProps {
  onPracticeEntry?: (entryId: string) => void;
}

export function StudyRecords({ onPracticeEntry }: StudyRecordsProps = {}) {
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<StoredEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeModule, setActiveModule] = useState<'all' | 'english' | 'studies'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedConcepts, setExpandedConcepts] = useState<Record<string, boolean>>({});
  const [retryAnswers, setRetryAnswers] = useState<Record<string, string>>({});
  const [isRetrying, setIsRetrying] = useState<Record<string, boolean>>({});
  const [retryError, setRetryError] = useState<Record<string, string>>({});
  const [expandedTimelines, setExpandedTimelines] = useState<Record<string, boolean>>({});
  const [selectedVersionBySlug, setSelectedVersionBySlug] = useState<Record<string, string>>({});
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);

  const handleArchive = async (entryId: string) => {
    setArchivingId(entryId);
    try {
      const res = await fetch('/api/study/entry/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entryId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Falha ao ocultar material');
      }
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
    } catch (err) {
      console.error('Erro ao arquivar material:', err);
    } finally {
      setArchivingId(null);
      setConfirmArchiveId(null);
    }
  };

  const handleRetryQuestion = async (questionId: string) => {
    const text = (retryAnswers[questionId] || '').trim();
    if (!text) return;

    setIsRetrying((prev) => ({ ...prev, [questionId]: true }));
    setRetryError((prev) => ({ ...prev, [questionId]: '' }));

    try {
      const res = await fetch('/api/study/quiz/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, userAnswer: text }),
      });
      const json = await res.json();
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error || 'Falha ao avaliar nova tentativa');
      }

      const newAttempt: QuestionAttemptView = json.data;

      setEntries((prevEntries) =>
        prevEntries.map((entry) => {
          if (!entry.questions) return entry;
          return {
            ...entry,
            questions: entry.questions.map((q) => {
              if (q.id !== questionId) return q;
              const updatedAttempts = [...(q.attempts || []), newAttempt];
              return {
                ...q,
                userAnswer: newAttempt.userAnswer,
                isCorrect: newAttempt.isCorrect,
                scorePercentage: newAttempt.scorePercentage,
                whatWasGood: newAttempt.whatWasGood,
                whatWasMissing: newAttempt.whatWasMissing,
                misconceptionsFeedback: newAttempt.misconceptionsFeedback,
                attempts: updatedAttempts,
              };
            }),
          };
        })
      );

      setRetryAnswers((prev) => ({ ...prev, [questionId]: '' }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao submeter tentativa';
      setRetryError((prev) => ({ ...prev, [questionId]: msg }));
    } finally {
      setIsRetrying((prev) => ({ ...prev, [questionId]: false }));
    }
  };
  const fetchEntries = useCallback(async (searchQuery: string) => {
    setIsLoading(true);
    try {
      const url = searchQuery.trim()
        ? `/api/search?q=${encodeURIComponent(searchQuery.trim())}`
        : '/api/search';
      const res = await fetch(url);
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setEntries(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch study records:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchEntries(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, fetchEntries]);

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (activeModule === 'all') return true;
      return e.module === activeModule;
    });
  }, [entries, activeModule]);

  // Group English entries into clusters by concept / primary tag
  const englishClusters = useMemo(() => {
    const englishItems = filteredEntries.filter((e) => e.module === 'english');
    const map: Record<string, StoredEntry[]> = {};

    for (const item of englishItems) {
      const concept = item.tags && item.tags.length > 0 ? item.tags[0].toLowerCase() : 'geral';
      if (!map[concept]) {
        map[concept] = [];
      }
      map[concept].push(item);
    }

    return Object.entries(map).map(([concept, items]) => ({
      concept,
      entries: items,
    }));
  }, [filteredEntries]);

  // Group Study entries into documents with version history
  const studyGroups = useMemo(() => {
    const studyItems = filteredEntries.filter((e) => e.module === 'studies');
    const map: Record<string, StoredEntry[]> = {};

    for (const item of studyItems) {
      const key = item.slug || item.title.toLowerCase();
      if (!map[key]) {
        map[key] = [];
      }
      map[key].push(item);
    }

    return Object.entries(map).map(([slugKey, versions]) => {
      versions.sort((a, b) => (b.version || 1) - (a.version || 1));
      return {
        slugKey,
        title: versions[0].title,
        versions,
      };
    });
  }, [filteredEntries]);
  async function handleCopy(text?: string, id?: string) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      if (id) {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2500);
      }
    } catch (e) {
      console.error('Failed to copy text:', e);
    }
  }

  function toggleConceptFolder(concept: string) {
    setExpandedConcepts((prev) => ({
      ...prev,
      [concept]: !prev[concept],
    }));
  }

  const showStudies = activeModule === 'all' || activeModule === 'studies';
  const showEnglish = activeModule === 'all' || activeModule === 'english';

  return (
    <div className="w-full space-y-6">
      {/* Header and Search Bar */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 shadow-xl backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-400" />
              Caderno de Estudos &amp; Conhecimento
            </h2>
          </div>

          {/* Module Filter Pills */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 self-start sm:self-auto">
            <button
              onClick={() => setActiveModule('all')}
              className={`px-3 py-1.5 min-h-[36px] flex items-center rounded text-xs font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                activeModule === 'all'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setActiveModule('english')}
              className={`px-3 py-1.5 min-h-[36px] flex items-center rounded text-xs font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                activeModule === 'english'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              Inglês por Conceito
            </button>
            <button
              onClick={() => setActiveModule('studies')}
              className={`px-3 py-1.5 min-h-[36px] flex items-center rounded text-xs font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                activeModule === 'studies'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              Materiais &bull; Resumos
            </button>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquise por conceito, capítulo ou frase... (ex: 'arquivos', 'prepositions', 'cache')"
            className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-10 pr-10 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
          />
          {isLoading && (
            <Loader2 className="w-4 h-4 text-slate-400 animate-spin absolute right-3.5 top-1/2 -translate-y-1/2" />
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="space-y-6">
        {filteredEntries.length === 0 && !isLoading && (
          <div className="text-center py-12 border border-dashed border-slate-800/80 rounded-xl bg-slate-900/30">
            <BookOpen className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-400">Nenhum registro encontrado.</p>
            <p className="text-xs text-slate-500 mt-1">
              Pratique uma nova frase no Pre-Flight ou ingira um PDF na aba Estudos!
            </p>
          </div>
        )}

        {/* 1. SEÇÃO DE ESTUDOS / CAPÍTULOS (com resumos e questões juntas) */}
        {showStudies && studyGroups.length > 0 && (
          <div className="space-y-3">
            {activeModule === 'all' && (
              <div className="flex items-center gap-2 pb-1 border-b border-slate-800/80">
                <Layers className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Capítulos e Materiais de Estudo ({studyGroups.length})
                </h3>
              </div>
            )}

            {studyGroups.map((group) => {
              const activeEntry =
                group.versions.find((v) => v.id === selectedVersionBySlug[group.slugKey]) ||
                group.versions[0];
              const isExpanded = expandedId === activeEntry.id;
              const formattedDate = new Date(activeEntry.created_at).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              });

              return (
                <div
                  key={activeEntry.id}
                  className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 hover:border-slate-700/80 transition-all shadow-sm space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
                          Estudos
                        </span>

                        {/* Multi-version switcher pills */}
                        {group.versions.length > 1 && (
                          <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-md border border-slate-800 text-xs">
                            <span className="text-[10px] text-slate-400 font-semibold uppercase px-1">
                              Versão:
                            </span>
                            {group.versions.map((ver) => (
                              <button
                                key={ver.id}
                                type="button"
                                onClick={() =>
                                  setSelectedVersionBySlug((prev) => ({
                                    ...prev,
                                    [group.slugKey]: ver.id,
                                  }))
                                }
                                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition-all cursor-pointer ${
                                  activeEntry.id === ver.id
                                    ? 'bg-indigo-600 text-white shadow-xs'
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                                }`}
                                title={`Versão ${ver.version || 1} criada em ${new Date(
                                  ver.created_at
                                ).toLocaleDateString('pt-BR')}`}
                              >
                                v{ver.version || 1}
                              </button>
                            ))}
                          </div>
                        )}

                        <h3 className="text-base font-bold text-slate-100">{activeEntry.title}</h3>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          Criado em {formattedDate}
                        </span>

                        {activeEntry.lastInteractedAt && (
                          <>
                            <span className="text-slate-600 hidden sm:inline">&bull;</span>
                            <span className="flex items-center gap-1 text-slate-300">
                              <History className="w-3 h-3 text-indigo-400" />
                              Última interação: {new Date(activeEntry.lastInteractedAt).toLocaleDateString('pt-BR', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </>
                        )}

                        {activeEntry.similarity !== undefined && activeEntry.similarity > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-indigo-400 font-mono text-[11px] bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-800/40">
                            <Sparkles className="w-2.5 h-2.5" />
                            {Math.round(activeEntry.similarity * 100)}% relevância
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {confirmArchiveId === activeEntry.id ? (
                        <div className="flex items-center gap-1 bg-rose-950/80 p-1 rounded-lg border border-rose-800 text-xs">
                          <span className="text-[10px] text-rose-200 px-1">Ocultar material?</span>
                          <button
                            type="button"
                            onClick={() => handleArchive(activeEntry.id)}
                            disabled={archivingId === activeEntry.id}
                            className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-semibold cursor-pointer text-[10px] flex items-center gap-1"
                          >
                            {archivingId === activeEntry.id ? (
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            ) : (
                              'Confirmar'
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmArchiveId(null)}
                            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer text-[10px]"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmArchiveId(activeEntry.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 transition-colors cursor-pointer"
                          title="Ocultar material do caderno"
                          aria-label="Ocultar material do caderno"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {onPracticeEntry && (
                        <button
                          type="button"
                          onClick={() => onPracticeEntry(activeEntry.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-300 bg-emerald-950/80 border border-emerald-800/60 hover:bg-emerald-900/60 transition-colors cursor-pointer shadow-xs"
                          title="Abrir este material para leitura e prática na aba Estudos"
                        >
                          <BrainCircuit className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Praticar</span>
                        </button>
                      )}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : activeEntry.id)}
                        aria-label={isExpanded ? 'Recolher material' : 'Expandir material'}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp className="w-3.5 h-3.5" />
                            <span>Recolher Material</span>
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3.5 h-3.5" />
                            <span>Ler Resumo e Questões</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Tags */}
                  {activeEntry.tags && activeEntry.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {activeEntry.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-slate-950 text-slate-400 border border-slate-800/80"
                        >
                          <Tag className="w-2.5 h-2.5 text-slate-400" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Expanded Material: independent Resumo/Questões accordions */}
                  {isExpanded && (
                    <div className="pt-3 border-t border-slate-800/80 space-y-3">
                      {/* Resumo accordion */}
                      {activeEntry.explanation && (
                        <div className="rounded-lg border border-slate-800 overflow-hidden bg-slate-950/40">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedConcepts((prev) => ({
                                ...prev,
                                [`resumo-${activeEntry.id}`]: !prev[`resumo-${activeEntry.id}`],
                              }))
                            }
                            className="w-full px-4 py-2 flex items-center justify-between bg-slate-900/60 text-xs font-semibold text-slate-200 cursor-pointer hover:bg-slate-800/40 transition-colors"
                          >
                            <span className="flex items-center gap-1.5">
                              <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                              Resumo do Material
                            </span>
                            {expandedConcepts[`resumo-${activeEntry.id}`] ? (
                              <ChevronUp className="w-4 h-4 text-slate-400" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-slate-400" />
                            )}
                          </button>
                          {expandedConcepts[`resumo-${activeEntry.id}`] && (
                            <div className="p-4">
                              <MarkdownView content={activeEntry.explanation} />
                            </div>
                          )}
                        </div>
                      )}
                      {activeEntry.questions && activeEntry.questions.length > 0 && (
                        <div className="rounded-lg border border-slate-800 overflow-hidden bg-slate-950/40">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedConcepts((prev) => ({
                                ...prev,
                                [`questoes-${activeEntry.id}`]: !prev[`questoes-${activeEntry.id}`],
                              }))
                            }
                            className="w-full px-4 py-2 flex items-center justify-between bg-slate-900/60 text-xs font-semibold text-slate-200 cursor-pointer hover:bg-slate-800/40 transition-colors"
                          >
                            <span className="flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                              Questões de Fixação ({activeEntry.questions.length})
                            </span>
                            {expandedConcepts[`questoes-${activeEntry.id}`] ? (
                              <ChevronUp className="w-4 h-4 text-slate-400" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-slate-400" />
                            )}
                          </button>
                          {expandedConcepts[`questoes-${activeEntry.id}`] && (
                            <div className="p-4 space-y-2.5">
                              {activeEntry.questions.map((q, qi) => (
                                <div key={q.id} className="p-3.5 rounded-lg bg-slate-950/80 border border-slate-800 space-y-2.5">
                                  {/* Header with question number and score badge */}
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/60">
                                        Questão {qi + 1}
                                      </span>
                                      <span className="text-[10px] text-slate-400 font-mono">Seção {q.sectionIndex}</span>
                                    </div>

                                    {q.scorePercentage !== undefined && (
                                      <span
                                        className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded border ${
                                          q.scorePercentage >= 70
                                            ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60'
                                            : q.scorePercentage >= 40
                                            ? 'bg-amber-950/80 text-amber-300 border-amber-800/60'
                                            : 'bg-rose-950/80 text-rose-300 border-rose-800/60'
                                        }`}
                                      >
                                        {q.scorePercentage}% precisão
                                      </span>
                                    )}
                                  </div>

                                  <p className="text-xs sm:text-sm font-semibold text-slate-100">{q.question}</p>

                                  {/* Official Expected Answer */}
                                  <div className="text-[11px] text-slate-300 bg-slate-900/60 p-2.5 rounded-md border border-slate-800/80">
                                    <strong className="text-emerald-400 block mb-0.5">Resposta Esperada Oficial:</strong>
                                    <p className="text-slate-200">{q.expectedAnswer}</p>
                                    {q.clozeHint && (
                                      <span className="inline-block mt-1.5 text-[10px] font-mono text-indigo-300 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-900/60">
                                        Lacuna: {q.clozeHint}
                                      </span>
                                    )}
                                  </div>

                                  {/* Timeline of Attempts */}
                                  {q.attempts && q.attempts.length > 0 && (
                                    <div className="pt-2 border-t border-slate-800/60 space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                          <History className="w-3.5 h-3.5 text-indigo-400" />
                                          Histórico de Tentativas ({q.attempts.length})
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => setExpandedTimelines((prev) => ({ ...prev, [q.id]: !prev[q.id] }))}
                                          className="text-[11px] text-indigo-400 hover:text-indigo-300 cursor-pointer flex items-center gap-0.5"
                                        >
                                          {expandedTimelines[q.id] ? (
                                            <>
                                              <span>Recolher</span>
                                              <ChevronUp className="w-3 h-3" />
                                            </>
                                          ) : (
                                            <>
                                              <span>Ver Todas ({q.attempts.length})</span>
                                              <ChevronDown className="w-3 h-3" />
                                            </>
                                          )}
                                        </button>
                                      </div>

                                      <div className="space-y-2">
                                        {(expandedTimelines[q.id] ? q.attempts : q.attempts.slice(-1)).map((att) => (
                                          <div
                                            key={att.id}
                                            className={`p-2.5 rounded-lg border text-xs space-y-1.5 ${
                                              att.isCorrect
                                                ? 'bg-emerald-950/20 border-emerald-900/40'
                                                : 'bg-slate-900/40 border-slate-800'
                                            }`}
                                          >
                                            <div className="flex items-center justify-between">
                                              <span className="font-semibold text-slate-300">
                                                Tentativa #{att.attemptNumber}
                                              </span>
                                              <span
                                                className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                                                  att.scorePercentage >= 70
                                                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60'
                                                    : att.scorePercentage >= 40
                                                    ? 'bg-amber-950/80 text-amber-300 border-amber-800/60'
                                                    : 'bg-rose-950/80 text-rose-300 border-rose-800/60'
                                                }`}
                                              >
                                                {att.scorePercentage}% precisão
                                              </span>
                                            </div>

                                            <p className="text-slate-200 italic bg-slate-950/60 p-2 rounded border border-slate-800/40">
                                              "{att.userAnswer}"
                                            </p>

                                            {att.whatWasGood ? (
                                              <div className="text-[11px] text-emerald-300 flex items-start gap-1.5">
                                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                                                <span>{att.whatWasGood}</span>
                                              </div>
                                            ) : null}

                                            {att.whatWasMissing ? (
                                              <div className="text-[11px] text-amber-300 flex items-start gap-1.5">
                                                <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                                                <span>{att.whatWasMissing}</span>
                                              </div>
                                            ) : null}

                                            {att.misconceptionsFeedback ? (
                                              <div className="text-[11px] text-rose-300 flex items-start gap-1.5">
                                                <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                                                <span>{att.misconceptionsFeedback}</span>
                                              </div>
                                            ) : null}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Retry / Refine Form */}
                                  <div className="pt-2 border-t border-slate-800/60 space-y-1.5">
                                    <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                                      <RotateCcw className="w-3 h-3 text-indigo-400" />
                                      Tentar Novamente / Refinar com suas palavras:
                                    </span>
                                    <div className="flex flex-col sm:flex-row gap-2">
                                      <textarea
                                        rows={2}
                                        value={retryAnswers[q.id] || ''}
                                        onChange={(e) => setRetryAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                                        placeholder="Digite sua resposta aqui para avaliar a proximidade conceitual..."
                                        disabled={isRetrying[q.id]}
                                        className="flex-1 bg-slate-950/80 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleRetryQuestion(q.id)}
                                        disabled={isRetrying[q.id] || !(retryAnswers[q.id] || '').trim()}
                                        className="self-end sm:self-auto px-3.5 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                                      >
                                        {isRetrying[q.id] ? (
                                          <>
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            <span>Avaliando...</span>
                                          </>
                                        ) : (
                                          <>
                                            <span>Enviar Tentativa</span>
                                            <Send className="w-3 h-3" />
                                          </>
                                        )}
                                      </button>
                                    </div>
                                    {retryError[q.id] && (
                                      <span className="text-[10px] text-rose-400 block">{retryError[q.id]}</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 2. SEÇÃO DE INGLÊS AGRUPADA POR CONCEITO */}
        {showEnglish && englishClusters.length > 0 && (
          <div className="space-y-3">
            {activeModule === 'all' && (
              <div className="flex items-center gap-2 pb-1 border-b border-slate-800/80 pt-2">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Práticas de Inglês por Conceito ({englishClusters.length} grupos)
                </h3>
              </div>
            )}

            {englishClusters.map((cluster) => {
              const isClusterOpen = !!expandedConcepts[cluster.concept];

              return (
                <div
                  key={cluster.concept}
                  className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-sm"
                >
                  {/* Concept Cluster Folder Header */}
                  <div
                    onClick={() => toggleConceptFolder(cluster.concept)}
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-800/30 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="p-1 rounded-md bg-indigo-950/80 border border-indigo-800/60 text-indigo-400">
                        {isClusterOpen ? <FolderOpen className="w-4 h-4" /> : <Folder className="w-4 h-4" />}
                      </span>
                      <div>
                        <h4 className="text-sm font-bold text-slate-200 capitalize">
                          Conceito: {cluster.concept}
                        </h4>
                        <span className="text-xs text-slate-400">
                          {cluster.entries.length} {cluster.entries.length === 1 ? 'frase praticada' : 'frases praticadas'}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      aria-label={isClusterOpen ? 'Recolher conceito' : 'Expandir conceito'}
                      className="p-1.5 text-slate-400 hover:text-slate-200"
                    >
                      {isClusterOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Expanded Cluster Entries */}
                  {isClusterOpen && (
                    <div className="border-t border-slate-800/80 p-4 space-y-3 bg-slate-950/40">
                      {cluster.entries.map((entry) => (
                        <div
                          key={entry.id}
                          className="p-3.5 rounded-lg bg-slate-950 border border-slate-800/80 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-300">
                              {entry.title}
                            </span>
                            {entry.target_en && (
                              <button
                                onClick={() => handleCopy(entry.target_en, entry.id)}
                                aria-label="Copiar frase em inglês"
                                className="p-1 rounded text-slate-400 hover:text-indigo-300 cursor-pointer"
                                title="Copiar frase"
                              >
                                {copiedId === entry.id ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            )}
                          </div>

                          {entry.target_en && (
                            <p className="text-xs font-medium text-slate-100">
                              &ldquo;{entry.target_en}&rdquo;
                            </p>
                          )}
                          {entry.input_pt && (
                            <p className="text-[11px] text-slate-400 italic">
                              Original: {entry.input_pt}
                            </p>
                          )}

                          {entry.explanation && (
                            <div className="pt-2 text-[11px] text-slate-300 border-t border-slate-800/60 leading-relaxed whitespace-pre-line">
                              {entry.explanation}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
