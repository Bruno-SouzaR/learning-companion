'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles, Loader2, ArrowRight } from 'lucide-react';
import type { RefineResult } from '@/server/llm';

interface EnglishPreFlightProps {
  onRefined: (input: string, result: RefineResult) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export function EnglishPreFlight({
  onRefined,
  isLoading,
  setIsLoading,
}: EnglishPreFlightProps) {
  const [inputText, setInputText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const COACH_STEPS = [
    'Analisando o contexto da comunicação...',
    'Mapeando vícios de linguagem e expressões literais do português...',
    'Estruturando concordância verbal e tempos gramaticais...',
    'Lapidando a frase para a cadência natural de um nativo...',
    'Sintetizando vocabulário técnico e expressões idiomáticas...',
  ];

  useEffect(() => {
    if (!isLoading) {
      setCurrentStepIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setCurrentStepIndex((prev) => (prev + 1) % COACH_STEPS.length);
    }, 3200);

    return () => clearInterval(interval);
  }, [isLoading, COACH_STEPS.length]);
  async function handleRefine() {
    if (!inputText.trim() || isLoading) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: inputText.trim() }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Falha ao processar solicitação');
      }

      onRefined(inputText.trim(), data.data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao conectar com a LLM';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleRefine();
    }
  }

  return (
    <div className="w-full bg-slate-900/60 border border-slate-800 rounded-xl p-5 md:p-6 shadow-xl backdrop-blur-sm">
      <div className="flex items-center justify-between mb-3">
        <label
          htmlFor="raw-input"
          className="text-sm font-semibold tracking-wide text-slate-300 uppercase flex items-center gap-2"
        >
          <Sparkles className="w-4 h-4 text-indigo-400" />
          O que você quer dizer?
        </label>
      </div>

      <textarea
        id="raw-input"
        rows={4}
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Escreva em português, inglês informal ou misturado..."
        className="w-full bg-slate-950/80 border border-slate-800 rounded-lg p-3.5 text-slate-100 placeholder-slate-500 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all resize-y"
        disabled={isLoading}
      />

      {isLoading && (
        <div className="mt-4 p-4 rounded-xl bg-slate-950/80 border border-indigo-900/50 space-y-3 animate-pulse">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
              Coach de Comunicação Nativa:
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              Etapa {currentStepIndex + 1} de {COACH_STEPS.length}
            </span>
          </div>
          <p className="text-sm font-medium text-slate-200 transition-all duration-300 min-h-[24px]">
            {COACH_STEPS[currentStepIndex]}
          </p>
          <div className="w-full bg-slate-800/60 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-indigo-500 h-full transition-all duration-500 rounded-full"
              style={{ width: `${((currentStepIndex + 1) / COACH_STEPS.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="mt-3 p-3 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300 text-sm">
          <strong>Atenção:</strong> {errorMessage}
        </div>
      )}
      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-slate-400">
          Usa LLM local ou Groq configurada no seu <code className="text-indigo-400 font-mono">.env</code>
        </span>

        <button
          onClick={handleRefine}
          disabled={!inputText.trim() || isLoading}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white shadow-lg shadow-indigo-600/20 transition-all cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Analisando...</span>
            </>
          ) : (
            <>
              <span>Analisar e Aprender</span>
              <kbd className="hidden sm:inline-flex text-[10px] bg-indigo-700/80 px-1.5 py-0.5 rounded text-indigo-200 border border-indigo-400/30">Enter</kbd>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
