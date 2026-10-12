'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { diffWordsWithSpace } from 'diff';
import {
  Flame,
  CheckCircle2,
  Clock,
  Sparkles,
  Trophy,
  ArrowRight,
  Eye,
  EyeOff,
  Check,
  RotateCcw,
  Loader2,
} from 'lucide-react';
import { isExactMatch as checkMatch } from '@/lib/text-matcher';
import type { SrsDueItem, SrsOverview } from '@/server/srs-engine';

interface DailyReviewProps {
  onComplete?: () => void;
}

export function DailyReview({ onComplete }: DailyReviewProps) {
  const [items, setItems] = useState<SrsDueItem[]>([]);
  const [overview, setOverview] = useState<SrsOverview | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [typedInput, setTypedInput] = useState('');
  const [isDiffVisible, setIsDiffVisible] = useState(false);
  const [isPeeking, setIsPeeking] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFinished, setIsFinished] = useState(false);

  const fetchQueue = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/review/queue');
      const json = await res.json();
      if (json.success) {
        setItems(json.data.items || []);
        setOverview(json.data.overview || null);
      }
    } catch (err) {
      console.error('Falha ao carregar fila de revisão:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const currentItem = items[currentIndex] as SrsDueItem | undefined;
  const targetEnglish = currentItem?.target_en || '';

  const isExact = useMemo(() => {
    if (!targetEnglish || !typedInput) return false;
    return checkMatch(targetEnglish, typedInput);
  }, [targetEnglish, typedInput]);

  const diffParts = useMemo(() => {
    if (!isDiffVisible || !typedInput.trim() || !targetEnglish) return [];
    return diffWordsWithSpace(targetEnglish, typedInput.trim(), {
      ignoreCase: true,
    });
  }, [targetEnglish, typedInput, isDiffVisible]);

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setTypedInput(e.target.value);
    if (isDiffVisible) {
      setIsDiffVisible(false);
    }
  }

  function handleCheck() {
    if (!typedInput.trim()) return;
    setIsDiffVisible(true);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleCheck();
    }
  }

  async function handleGrade(quality: number) {
    if (!currentItem || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await fetch('/api/review/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryId: currentItem.entry_id,
          quality,
        }),
      });

      if (currentIndex + 1 < items.length) {
        setCurrentIndex((prev) => prev + 1);
        setTypedInput('');
        setIsDiffVisible(false);
        setIsPeeking(false);
      } else {
        setIsFinished(true);
        onComplete?.();
      }
    } catch (err) {
      console.error('Falha ao registrar nota de revisão:', err);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-slate-900/60 border border-slate-800 rounded-xl">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-400 mb-2" />
        <span className="text-sm text-slate-400">Carregando fila de repetição espaçada...</span>
      </div>
    );
  }

  // Zero items due or review session finished
  if (items.length === 0 || isFinished) {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 md:p-8 text-center space-y-4 shadow-xl">
        <div className="w-14 h-14 rounded-full bg-emerald-950/80 border border-emerald-800 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-900/20">
          <Trophy className="w-7 h-7" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-slate-100">
            {isFinished ? 'Revisão Diária Concluída!' : 'Tudo em Dia por Hoje!'}
          </h3>
          <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">
            {isFinished
              ? 'Você completou todas as frases agendadas para hoje. Os intervalos de memória foram atualizados.'
              : 'Você não tem frases pendentes de revisão neste momento. Continue praticando novas frases no Pre-Flight.'}
          </p>
        </div>

        {overview && (
          <div className="grid grid-cols-3 gap-3 max-w-md mx-auto pt-3 border-t border-slate-800">
            <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
              <span className="text-xs text-slate-400 block">Total no SRS</span>
              <span className="text-lg font-bold text-slate-200">{overview.totalItems}</span>
            </div>
            <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
              <span className="text-xs text-slate-400 block">Revisados</span>
              <span className="text-lg font-bold text-emerald-400">
                {isFinished ? items.length : 0}
              </span>
            </div>
            <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
              <span className="text-xs text-slate-400 block">Dominados</span>
              <span className="text-lg font-bold text-indigo-400">{overview.masteredItems}</span>
            </div>
          </div>
        )}

        <button
          onClick={() => {
            setIsFinished(false);
            setCurrentIndex(0);
            fetchQueue();
          }}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer mt-2"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Verificar Novamente</span>
        </button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-5 bg-slate-900/60 border border-slate-800 rounded-xl p-5 md:p-6 shadow-xl backdrop-blur-sm">
      {/* Top Header: Progress & Streak */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-2 text-amber-400 font-semibold">
          <Flame className="w-4 h-4" />
          <span>Aquecimento do Dia (Spaced Repetition)</span>
        </div>
        <div className="flex items-center gap-3 text-slate-400">
          <span>
            Frase <strong>{currentIndex + 1}</strong> de <strong>{items.length}</strong>
          </span>
          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[11px]">
            Repetição #{currentItem?.repetitions || 0}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-800/80 rounded-full h-1.5 overflow-hidden">
        <div
          className="bg-indigo-500 h-full transition-all duration-300 rounded-full"
          style={{ width: `${((currentIndex + 1) / items.length) * 100}%` }}
        />
      </div>

      {/* Prompt / Original Portuguese sentence */}
      <div className="p-4 rounded-lg bg-slate-950/80 border border-slate-800">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
          Traduza de Memória para o Inglês:
        </span>
        <p className="text-base md:text-lg font-medium text-slate-100">
          &ldquo;{currentItem?.input_pt || currentItem?.title}&rdquo;
        </p>
      </div>

      {/* Optional Peek */}
      <div className="flex items-center justify-between px-1 text-xs">
        <span className="text-slate-400">Tente formular a frase antes de olhar.</span>
        <button
          onClick={() => setIsPeeking(!isPeeking)}
          className="inline-flex items-center gap-1.5 text-slate-400 hover:text-indigo-300 transition-colors cursor-pointer"
        >
          {isPeeking ? (
            <>
              <EyeOff className="w-3.5 h-3.5" />
              <span>Ocultar Resposta</span>
            </>
          ) : (
            <>
              <Eye className="w-3.5 h-3.5" />
              <span>Espiar Frase Ideal</span>
            </>
          )}
        </button>
      </div>

      {isPeeking && (
        <div className="p-3 rounded-lg bg-indigo-950/30 border border-indigo-900/50 text-indigo-200 text-sm font-medium">
          {targetEnglish}
        </div>
      )}

      {/* Recall Input Field */}
      <div className="space-y-2">
        <textarea
          rows={2}
          value={typedInput}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Digite a frase em inglês aqui e pressione Enter..."
          className="w-full bg-slate-950/80 border border-slate-800 rounded-lg p-3.5 text-slate-100 placeholder-slate-500 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all resize-none"
        />

        <div className="flex items-center justify-between text-xs text-slate-400 px-1">
          <span>Pressione Enter para verificar</span>
          {isExact && isDiffVisible && (
            <span className="text-emerald-400 font-semibold inline-flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> 100% Correto!
            </span>
          )}
        </div>
      </div>

      {/* Word Diff Display (On Demand) */}
      {isDiffVisible && typedInput.trim().length > 0 && (
        <div className="p-4 rounded-lg bg-slate-950/80 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-wider">Comparativo</span>
            <span className="italic">Ao voltar a digitar, o comparativo é ocultado.</span>
          </div>
          <div className="text-sm font-mono flex flex-wrap gap-1 leading-relaxed">
            {diffParts.map((part, idx) => {
              if (part.added) {
                return (
                  <span
                    key={idx}
                    className="px-1.5 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800/80 line-through text-xs"
                  >
                    {part.value}
                  </span>
                );
              }
              if (part.removed) {
                return (
                  <span
                    key={idx}
                    className="px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/80 underline decoration-amber-400 text-xs font-semibold"
                  >
                    {part.value}
                  </span>
                );
              }
              return (
                <span
                  key={idx}
                  className="px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/60 text-xs"
                >
                  {part.value}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* SM-2 Self-Assessment Grading Bar */}
      <div className="pt-3 border-t border-slate-800 space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">
          Como foi a sua retenção desta frase?
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            onClick={() => handleGrade(1)}
            disabled={isSubmitting}
            className="flex flex-col items-center justify-center p-2.5 rounded-lg bg-rose-950/30 hover:bg-rose-950/60 border border-rose-900/50 text-rose-300 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
          >
            <span>Errei / Blackout</span>
            <span className="text-[10px] text-rose-400/80 font-normal mt-0.5">Repete em 1 dia</span>
          </button>

          <button
            onClick={() => handleGrade(3)}
            disabled={isSubmitting}
            className="flex flex-col items-center justify-center p-2.5 rounded-lg bg-amber-950/30 hover:bg-amber-950/60 border border-amber-900/50 text-amber-300 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
          >
            <span>Difícil / Esforço</span>
            <span className="text-[10px] text-amber-400/80 font-normal mt-0.5">Mantém intervalo</span>
          </button>

          <button
            onClick={() => handleGrade(4)}
            disabled={isSubmitting}
            className="flex flex-col items-center justify-center p-2.5 rounded-lg bg-indigo-950/30 hover:bg-indigo-950/60 border border-indigo-900/50 text-indigo-300 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
          >
            <span>Bom / Normal</span>
            <span className="text-[10px] text-indigo-400/80 font-normal mt-0.5">Avança intervalo</span>
          </button>

          <button
            onClick={() => handleGrade(5)}
            disabled={isSubmitting}
            className="flex flex-col items-center justify-center p-2.5 rounded-lg bg-emerald-950/30 hover:bg-emerald-950/60 border border-emerald-900/50 text-emerald-300 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
          >
            <span>Fácil / Instantâneo</span>
            <span className="text-[10px] text-emerald-400/80 font-normal mt-0.5">Avança + Bônus EF</span>
          </button>
        </div>
      </div>
    </div>
  );
}
