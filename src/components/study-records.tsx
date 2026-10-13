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
} from 'lucide-react';
import { MarkdownView } from './markdown-view';
import type { StoredEntry } from '@/server/wiki-store';

export function StudyRecords() {
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<StoredEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeModule, setActiveModule] = useState<'all' | 'english' | 'studies'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedConcepts, setExpandedConcepts] = useState<Record<string, boolean>>({});

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

  // Group Study entries (Chapters / Materials)
  const studyDocuments = useMemo(() => {
    return filteredEntries.filter((e) => e.module === 'studies');
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
        {showStudies && studyDocuments.length > 0 && (
          <div className="space-y-3">
            {activeModule === 'all' && (
              <div className="flex items-center gap-2 pb-1 border-b border-slate-800/80">
                <Layers className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Capítulos e Materiais de Estudo ({studyDocuments.length})
                </h3>
              </div>
            )}

            {studyDocuments.map((entry) => {
              const isExpanded = expandedId === entry.id;
              const formattedDate = new Date(entry.created_at).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              });

              return (
                <div
                  key={entry.id}
                  className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 hover:border-slate-700/80 transition-all shadow-sm space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
                          Estudos
                        </span>
                        <h3 className="text-base font-bold text-slate-100">{entry.title}</h3>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          {formattedDate}
                        </span>
                        {entry.similarity !== undefined && entry.similarity > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-indigo-400 font-mono text-[11px] bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-800/40">
                            <Sparkles className="w-2.5 h-2.5" />
                            {Math.round(entry.similarity * 100)}% relevância
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => setExpandedId(isExpanded ? null : entry.id)}
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

                  {/* Tags */}
                  {entry.tags && entry.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {entry.tags.map((tag) => (
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
                      {entry.explanation && (
                        <div className="rounded-lg border border-slate-800 overflow-hidden bg-slate-950/40">
                          <button
                            type="button"
                            onClick={() => setExpandedConcepts((prev) => ({ ...prev, [`resumo-${entry.id}`]: !prev[`resumo-${entry.id}`] }))}
                            className="w-full px-4 py-2 flex items-center justify-between bg-slate-900/60 text-xs font-semibold text-slate-200 cursor-pointer hover:bg-slate-800/40 transition-colors"
                          >
                            <span className="flex items-center gap-1.5">
                              <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                              Resumo do Material
                            </span>
                            {expandedConcepts[`resumo-${entry.id}`] ? (
                              <ChevronUp className="w-4 h-4 text-slate-400" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-slate-400" />
                            )}
                          </button>
                          {expandedConcepts[`resumo-${entry.id}`] && (
                            <div className="p-4">
                              <MarkdownView content={entry.explanation} />
                            </div>
                          )}
                        </div>
                      )}

                      {/* Questões accordion */}
                      {entry.questions && entry.questions.length > 0 && (
                        <div className="rounded-lg border border-slate-800 overflow-hidden bg-slate-950/40">
                          <button
                            type="button"
                            onClick={() => setExpandedConcepts((prev) => ({ ...prev, [`questoes-${entry.id}`]: !prev[`questoes-${entry.id}`] }))}
                            className="w-full px-4 py-2 flex items-center justify-between bg-slate-900/60 text-xs font-semibold text-slate-200 cursor-pointer hover:bg-slate-800/40 transition-colors"
                          >
                            <span className="flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                              Questões de Fixação ({entry.questions.length})
                            </span>
                            {expandedConcepts[`questoes-${entry.id}`] ? (
                              <ChevronUp className="w-4 h-4 text-slate-400" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-slate-400" />
                            )}
                          </button>
                          {expandedConcepts[`questoes-${entry.id}`] && (
                            <div className="p-4 space-y-2.5">
                              {entry.questions.map((q, qi) => (
                                <div key={q.id} className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 space-y-1.5">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/60">
                                      Question {qi + 1}
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-mono">Seção {q.sectionIndex}</span>
                                  </div>
                                  <p className="text-xs font-medium text-slate-100">{q.question}</p>
                                  <p className="text-[11px] text-slate-400">
                                    <strong className="text-emerald-400">Resposta Esperada:</strong> {q.expectedAnswer}
                                  </p>
                                  {q.clozeHint && (
                                    <span className="inline-block text-[11px] font-mono text-indigo-300 bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-900/60">
                                      Lacuna: {q.clozeHint}
                                    </span>
                                  )}
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
