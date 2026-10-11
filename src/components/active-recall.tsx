'use client';

import React, { useState, useMemo } from 'react';
import { diffWordsWithSpace } from 'diff';
import {
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  BookOpen,
  AlertCircle,
  Tag,
  RotateCcw,
  Sparkles,
  Check,
} from 'lucide-react';
import type { RefineResult } from '@/server/llm';

interface ActiveRecallProps {
  rawInput: string;
  result: RefineResult;
  onReset: () => void;
  onSaved?: () => void;
}

export function ActiveRecall({
  rawInput,
  result,
  onReset,
  onSaved,
}: ActiveRecallProps) {
  const [typedInput, setTypedInput] = useState('');
  const [isPeeking, setIsPeeking] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isDiffVisible, setIsDiffVisible] = useState(false);

  // Compute word-by-word diff only when explicit verification is triggered
  const diffParts = useMemo(() => {
    if (!isDiffVisible || !typedInput.trim()) return [];
    return diffWordsWithSpace(result.target_english, typedInput.trim(), {
      ignoreCase: true,
    });
  }, [result.target_english, typedInput, isDiffVisible]);

  // Check if user's attempt matches target (ignoring trailing whitespace and case)
  const isExactMatch = useMemo(() => {
    const cleanTarget = result.target_english.trim().toLowerCase().replace(/[.,!?;:]/g, '');
    const cleanTyped = typedInput.trim().toLowerCase().replace(/[.,!?;:]/g, '');
    return cleanTarget.length > 0 && cleanTarget === cleanTyped;
  }, [result.target_english, typedInput]);

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setTypedInput(e.target.value);
    // Instantly hide the diff when user types again, forcing active recall from memory
    if (isDiffVisible) {
      setIsDiffVisible(false);
    }
  }

  function handleCheckAttempt() {
    if (!typedInput.trim()) return;
    setIsDiffVisible(true);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!typedInput.trim()) return;

      if (!isDiffVisible) {
        setIsDiffVisible(true);
      } else if (isExactMatch) {
        handleCopyAndSave();
      }
    }
  }
  async function handleCopyAndSave() {
    try {
      await navigator.clipboard.writeText(result.target_english);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 3000);

      if (!isSaved) {
        setIsSaving(true);
        const res = await fetch('/api/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: result.title,
            input_pt: rawInput,
            target_en: result.target_english,
            mistakes_summary: result.mistakes_summary,
            key_vocabulary: result.key_vocabulary,
            tags: result.tags,
          }),
        });
        if (res.ok) {
          setIsSaved(true);
          onSaved?.();
        }
      }
    } catch (e) {
      console.error('Failed to copy or save:', e);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="w-full space-y-6">
      {/* 1. Pedagogical Breakdown Card */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 md:p-6 shadow-xl backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-4 mb-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              {result.title}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Original: &ldquo;{rawInput}&rdquo;
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {result.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700/60"
              >
                <Tag className="w-3 h-3 text-slate-400" />
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Target sentence display / peek */}
        <div className="mb-5 p-4 rounded-lg bg-indigo-950/20 border border-indigo-900/40 relative">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
              Frase Ideal em Inglês
            </span>
            <button
              onClick={() => setIsPeeking(!isPeeking)}
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-indigo-300 transition-colors cursor-pointer"
            >
              {isPeeking ? (
                <>
                  <EyeOff className="w-3.5 h-3.5" />
                  <span>Ocultar</span>
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5" />
                  <span>Espiar (Peek)</span>
                </>
              )}
            </button>
          </div>
          <p
            className={`text-lg font-medium text-slate-100 transition-all ${
              isPeeking ? 'filter-none' : 'filter blur-sm select-none hover:blur-none'
            }`}
          >
            {result.target_english}
          </p>
        </div>

        {/* Mistakes & Notes */}
        {result.mistakes_summary.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-1.5 mb-2">
              <AlertCircle className="w-4 h-4" />
              Pontos de Atenção &amp; O que você errou
            </h3>
            <ul className="space-y-1.5">
              {result.mistakes_summary.map((note, idx) => (
                <li
                  key={idx}
                  className="text-sm text-slate-300 pl-4 relative before:content-['•'] before:absolute before:left-0 before:text-amber-400"
                >
                  {note}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Key Vocabulary */}
        {result.key_vocabulary.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 mb-2">
              <BookOpen className="w-4 h-4" />
              Vocabulário Chave
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {result.key_vocabulary.map((vocab, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 text-xs"
                >
                  <span className="font-mono font-semibold text-emerald-300">
                    {vocab.term}
                  </span>
                  <span className="text-slate-400 block mt-0.5">
                    {vocab.definition}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 2. Active Recall Practice Card */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 md:p-6 shadow-xl backdrop-blur-sm">
        <div className="flex items-center justify-between mb-3">
          <label
            htmlFor="active-recall-input"
            className="text-sm font-semibold tracking-wide text-slate-200 uppercase flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            Recuperação Ativa (Digite de memória em inglês)
          </label>
          {isDiffVisible && isExactMatch ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-800">
              <Check className="w-3.5 h-3.5" /> 100% de Acerto!
            </span>
          ) : (
            <span className="text-xs text-slate-400 font-mono hidden sm:inline">
              Pressione <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">Enter</kbd> para verificar
            </span>
          )}
        </div>

        <textarea
          id="active-recall-input"
          rows={3}
          value={typedInput}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Tente formular a frase em inglês de memória aqui e pressione Enter para verificar..."
          className="w-full bg-slate-950/80 border border-slate-800 rounded-lg p-3.5 text-slate-100 placeholder-slate-500 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all resize-y"
        />

        {/* Word-level diff display — shown ONLY after user checks their attempt */}
        {isDiffVisible && typedInput.trim().length > 0 && (
          <div className="mt-4 p-4 rounded-lg bg-slate-950/80 border border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Comparativo Palavra a Palavra (Diff)
              </span>
              <span className="text-xs text-slate-400 italic">
                Ao voltar a digitar acima, o comparativo será ocultado para você treinar a retenção.
              </span>
            </div>

            <div className="text-base leading-relaxed font-mono flex flex-wrap gap-1 items-center">
              {diffParts.map((part, index) => {
                if (part.added) {
                  return (
                    <span
                      key={index}
                      className="px-1.5 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800/80 line-through text-sm"
                      title="Palavra sobressalente ou diferente"
                    >
                      {part.value}
                    </span>
                  );
                }
                if (part.removed) {
                  return (
                    <span
                      key={index}
                      className="px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/80 underline decoration-amber-400 text-sm font-semibold"
                      title="Palavra que faltou da frase ideal"
                    >
                      {part.value}
                    </span>
                  );
                }
                return (
                  <span
                    key={index}
                    className="px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/60 text-sm"
                  >
                    {part.value}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions bar */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800/80">
          <button
            onClick={onReset}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Treinar Outra Frase</span>
          </button>

          <div className="flex items-center gap-2.5">
            {!isDiffVisible ? (
              <button
                onClick={handleCheckAttempt}
                disabled={!typedInput.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-slate-200 border border-slate-700 transition-colors cursor-pointer"
              >
                <span>Verificar Tentativa</span>
                <kbd className="text-[10px] bg-slate-900 px-1.5 py-0.5 rounded text-slate-400 border border-slate-700">Enter</kbd>
              </button>
            ) : (
              <button
                onClick={() => setIsDiffVisible(false)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 transition-colors cursor-pointer"
              >
                <EyeOff className="w-3.5 h-3.5" />
                <span>Ocultar Comparativo</span>
              </button>
            )}

            <button
              onClick={handleCopyAndSave}
              disabled={isSaving}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white shadow-lg transition-all cursor-pointer ${
                isDiffVisible && isExactMatch
                  ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20'
                  : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/20'
              }`}
            >
              {isCopied ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Copiado para Clipboard!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>
                    {isSaved ? 'Copiar Novamente' : 'Copiar e Salvar no Wiki'}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
