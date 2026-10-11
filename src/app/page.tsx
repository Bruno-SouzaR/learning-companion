'use client';

import React, { useState } from 'react';
import { Sparkles, BookOpen, GraduationCap } from 'lucide-react';
import { EnglishPreFlight } from '@/components/english-preflight';
import { ActiveRecall } from '@/components/active-recall';
import { StudyRecords } from '@/components/study-records';
import type { RefineResult } from '@/server/llm';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'english' | 'records'>('english');
  const [rawInput, setRawInput] = useState<string | null>(null);
  const [refinedResult, setRefinedResult] = useState<RefineResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  function handleRefined(input: string, result: RefineResult) {
    setRawInput(input);
    setRefinedResult(result);
  }

  function handleReset() {
    setRawInput(null);
    setRefinedResult(null);
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      {/* Top Header */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-100 leading-tight">
                Learning Companion
              </h1>
              <p className="text-[11px] text-slate-400">
                Markdown Wiki + In-Process Embeddings
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => setActiveTab('english')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'english'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>English Pre-Flight</span>
            </button>
            <button
              onClick={() => setActiveTab('records')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'records'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Study Records</span>
            </button>
          </nav>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-6 md:py-8">
        {activeTab === 'english' ? (
          <div className="space-y-6">
            {!refinedResult ? (
              <div className="space-y-4">
                <div className="mb-2">
                  <h2 className="text-xl font-bold text-slate-100">
                    Aprimore sua Comunicação em Inglês
                  </h2>
                  <p className="text-sm text-slate-400 mt-1">
                    Escreva pensamentos, pedidos ou mensagens diárias. A IA gera a versão idiomática, aponta os erros e desafia sua retenção ativa antes de copiar.
                  </p>
                </div>

                <EnglishPreFlight
                  onRefined={handleRefined}
                  isLoading={isLoading}
                  setIsLoading={setIsLoading}
                />
              </div>
            ) : (
              <ActiveRecall
                rawInput={rawInput || ''}
                result={refinedResult}
                onReset={handleReset}
              />
            )}
          </div>
        ) : (
          <StudyRecords />
        )}
      </main>

      {/* Subtle Footer */}
      <footer className="border-t border-slate-900 py-4 text-center text-xs text-slate-400">
        <div className="max-w-4xl mx-auto px-4 flex items-center justify-between">
          <span>Learning Companion &bull; Local-first</span>
          <span className="text-slate-500">
            Active Recall &bull; Markdown Wiki &bull; Local Embeddings
          </span>
        </div>
      </footer>
    </div>
  );
}
