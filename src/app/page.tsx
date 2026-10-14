'use client';

import React, { useState } from 'react';
import { Sparkles, BookOpen, GraduationCap, Flame, FileText } from 'lucide-react';
import { EnglishPreFlight } from '@/components/english-preflight';
import { ActiveRecall } from '@/components/active-recall';
import { StudyRecords } from '@/components/study-records';
import { DailyReview } from '@/components/daily-review';
import { StudyIngest } from '@/components/study-ingest';
import type { RefineResult } from '@/server/llm';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'english' | 'ingest' | 'review' | 'records'>('english');
  const [rawInput, setRawInput] = useState<string | null>(null);
  const [refinedResult, setRefinedResult] = useState<RefineResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeStudyEntryId, setActiveStudyEntryId] = useState<string | null>(null);
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
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-2.5 sm:py-0 sm:h-16 flex flex-col sm:flex-row items-center sm:justify-between gap-2.5 sm:gap-4">
          <div className="flex items-center justify-between w-full sm:w-auto">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shrink-0">
                <GraduationCap className="w-5 h-5" />
              </div>
              <h1 className="text-sm sm:text-base font-bold text-slate-100 tracking-tight">
                Learning Companion
              </h1>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav
            aria-label="Navegação Principal"
            className="flex items-center justify-between w-full sm:w-auto gap-0.5 sm:gap-1 bg-slate-900/90 p-1 rounded-lg border border-slate-800 overflow-x-auto"
          >
            <button
              onClick={() => setActiveTab('english')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 sm:py-1.5 min-h-[38px] sm:min-h-0 rounded-md text-[11px] sm:text-xs font-semibold whitespace-nowrap transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                activeTab === 'english'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>Pre-Flight</span>
            </button>
            <button
              onClick={() => setActiveTab('ingest')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 sm:py-1.5 min-h-[38px] sm:min-h-0 rounded-md text-[11px] sm:text-xs font-semibold whitespace-nowrap transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                activeTab === 'ingest'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <FileText className="w-3.5 h-3.5 shrink-0" />
              <span>Estudos</span>
            </button>
            <button
              onClick={() => setActiveTab('review')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 sm:py-1.5 min-h-[38px] sm:min-h-0 rounded-md text-[11px] sm:text-xs font-semibold whitespace-nowrap transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                activeTab === 'review'
                  ? 'bg-amber-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <Flame className="w-3.5 h-3.5 shrink-0" />
              <span>
                <span className="sm:hidden">Revisão</span>
                <span className="hidden sm:inline">Revisão SRS</span>
              </span>
            </button>
            <button
              onClick={() => setActiveTab('records')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 sm:py-1.5 min-h-[38px] sm:min-h-0 rounded-md text-[11px] sm:text-xs font-semibold whitespace-nowrap transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                activeTab === 'records'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 shrink-0" />
              <span>Caderno</span>
            </button>
          </nav>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-4 sm:py-6 flex flex-col">
        {activeTab === 'english' ? (
          <div className="flex-1 flex flex-col w-full">
            {!refinedResult ? (
              <div className="flex-1 flex flex-col w-full max-w-3xl mx-auto pt-[10vh] sm:pt-[13vh]">
                {/* Title and Hero Section shifted down by ~14% */}
                <div className="text-center space-y-2">
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
                    Aprimore sua Comunicação em Inglês
                  </h2>
                  <p className="text-sm text-slate-400 max-w-xl mx-auto leading-relaxed">
                    Escreva pensamentos, pedidos ou mensagens diárias. A IA local gera a versão idiomática, aponta os erros e desafia sua retenção ativa antes de copiar.
                  </p>
                </div>

                {/* Input Card maintaining relative distance */}
                <div className="w-full mt-28 sm:mt-36 pb-6">
                  <EnglishPreFlight
                    onRefined={handleRefined}
                    isLoading={isLoading}
                    setIsLoading={setIsLoading}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-6 w-full">
                <ActiveRecall
                  rawInput={rawInput || ''}
                  result={refinedResult}
                  onReset={handleReset}
                />
              </div>
            )}
          </div>
        ) : activeTab === 'ingest' ? (
          <div className="flex-1 flex flex-col w-full max-w-3xl mx-auto pt-[4vh] sm:pt-[6vh]">
            <div className="text-center space-y-2 mb-6">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
                Ingestão de Materiais &amp; PDFs
              </h2>
              <p className="text-sm text-slate-400 max-w-xl mx-auto leading-relaxed">
                Envie capítulos de livros, PDFs ou notas de aula. O sistema fatia o documento, sintetiza resumos seccionais e gera questões de Active Recall para o seu SRS.
              </p>
            </div>
            <StudyIngest
              onNavigateToRecords={() => setActiveTab('records')}
              initialEntryId={activeStudyEntryId}
            />
          </div>
        ) : activeTab === 'review' ? (
          <div className="flex-1 flex flex-col w-full max-w-3xl mx-auto pt-[10vh] sm:pt-[13vh]">
            {/* Title and Hero Section matching Pre-Flight descent */}
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-950/80 text-amber-300 border border-amber-800/60 shadow-sm">
                <Flame className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Aquecimento do Dia &bull; Repetição Espaçada</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
                Consolidação Ativa de Memória
              </h2>
              <p className="text-sm text-slate-400 max-w-xl mx-auto leading-relaxed">
                Revise as frases que seu cérebro está prestes a esquecer. Avalie a facilidade de recall para otimizar os intervalos de repetição do algoritmo SM-2.
              </p>
            </div>

            {/* DailyReview Card */}
            <div className="w-full mt-8 sm:mt-10 pb-6">
              <DailyReview onComplete={() => setActiveTab('english')} />
            </div>
          </div>
        ) : (
          <StudyRecords
            onPracticeEntry={(entryId) => {
              setActiveStudyEntryId(entryId);
              setActiveTab('ingest');
            }}
          />
        )}
      </main>

    </div>
  );
}
