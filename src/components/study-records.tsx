'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import type { StoredEntry } from '@/server/wiki-store';

export function StudyRecords() {
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<StoredEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeModule, setActiveModule] = useState<'all' | 'english' | 'studies'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  const filteredEntries = entries.filter((e) => {
    if (activeModule === 'all') return true;
    return e.module === activeModule;
  });

  async function handleCopy(text?: string, id?: string) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      if (id) {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2500);
      }
    } catch (e) {
      console.error('Failed to copy to clipboard:', e);
    }
  }

  return (
    <div className="w-full space-y-6">
      {/* Header and Search Bar */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 shadow-xl backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-400" />
              Base de Conhecimento &amp; Histórico (.md)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Busca semântica via vetor local <code className="text-indigo-400">all-MiniLM-L6-v2</code> em processo
            </p>
          </div>

          {/* Module Filter Pills */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 self-start sm:self-auto">
            <button
              onClick={() => setActiveModule('all')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                activeModule === 'all'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setActiveModule('english')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                activeModule === 'english'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Inglês
            </button>
            <button
              onClick={() => setActiveModule('studies')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                activeModule === 'studies'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Faculdade/Estudos
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
            placeholder="Pesquise por conceito, significado ou frase... (ex: 'aprimorar regra', 'docker', 'cancelar reunião')"
            className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-10 pr-10 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
          />
          {isLoading && (
            <Loader2 className="w-4 h-4 text-slate-400 animate-spin absolute right-3.5 top-1/2 -translate-y-1/2" />
          )}
        </div>
      </div>

      {/* Entries List */}
      <div className="space-y-3">
        {filteredEntries.length === 0 && !isLoading && (
          <div className="text-center py-12 border border-dashed border-slate-800/80 rounded-xl bg-slate-900/30">
            <BookOpen className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-400">Nenhum registro encontrado.</p>
            <p className="text-xs text-slate-400 mt-1">
              Pratique uma nova frase na aba &ldquo;English Pre-Flight&rdquo; para começar seu wiki!
            </p>
          </div>
        )}

        {filteredEntries.map((entry) => {
          const isExpanded = expandedId === entry.id;
          const formattedDate = new Date(entry.created_at).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          });

          return (
            <div
              key={entry.id}
              className="bg-slate-900/60 border border-slate-800 rounded-xl p-4.5 hover:border-slate-700/80 transition-all shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        entry.module === 'english'
                          ? 'bg-indigo-950/80 text-indigo-300 border border-indigo-800/60'
                          : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                      }`}
                    >
                      {entry.module}
                    </span>
                    <h3 className="text-sm font-semibold text-slate-100">
                      {entry.title}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      {formattedDate}
                    </span>
                    {entry.similarity !== undefined && entry.similarity > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-indigo-400 font-mono text-[11px] bg-indigo-950/60 px-1.5 py-0.2 rounded border border-indigo-800/40">
                        <Sparkles className="w-2.5 h-2.5" />
                        {Math.round(entry.similarity * 100)}% relevância
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {entry.target_en && (
                    <button
                      onClick={() => handleCopy(entry.target_en, entry.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-slate-800/60 transition-colors cursor-pointer"
                      title="Copiar frase em inglês"
                    >
                      {copiedId === entry.id ? (
                        <Check className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors cursor-pointer"
                    title={isExpanded ? 'Recolher detalhes' : 'Expandir detalhes'}
                  >
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Main content snippet */}
              {entry.target_en && (
                <div className="mt-2.5 p-3 rounded-lg bg-slate-950/60 border border-slate-800/60 text-sm font-medium text-slate-200">
                  <p>&ldquo;{entry.target_en}&rdquo;</p>
                  {entry.input_pt && (
                    <p className="text-xs text-slate-400 mt-1 italic">
                      Original: {entry.input_pt}
                    </p>
                  )}
                </div>
              )}

              {/* Tags */}
              {entry.tags && entry.tags.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1">
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

              {/* Expanded details */}
              {isExpanded && entry.explanation && (
                <div className="mt-3 pt-3 border-t border-slate-800/60 text-xs text-slate-300 leading-relaxed whitespace-pre-line">
                  {entry.explanation}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
