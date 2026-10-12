'use client';

import React, { useState } from 'react';
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
