'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { Sparkles, BookOpen, GraduationCap, Flame, FileText, Bot, Loader2 } from 'lucide-react';
import { EnglishPreFlight } from '@/components/english-preflight';
import type { RefineResult } from '@/server/llm';

// Dynamic leaf imports for bundle splitting (modern-frontend-craft)
const ActiveRecall = dynamic(
  () => import('@/components/active-recall').then((m) => m.ActiveRecall),
  {
    loading: () => (
      <div className="flex flex-col items-center justify-center py-20 space-y-3 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
        <p className="text-xs">Carregando prática de Active Recall...</p>
      </div>
    ),
  }
);

const StudyIngest = dynamic(
  () => import('@/components/study-ingest').then((m) => m.StudyIngest),
  {
    loading: () => (
      <div className="flex flex-col items-center justify-center py-24 space-y-4 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
        <p className="text-sm">Carregando ambiente de estudos...</p>
      </div>
    ),
  }
);

const StudyRecords = dynamic(
  () => import('@/components/study-records').then((m) => m.StudyRecords),
  {
    loading: () => (
      <div className="flex flex-col items-center justify-center py-24 space-y-4 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
        <p className="text-sm">Carregando caderno de notas...</p>
      </div>
    ),
  }
);

const DailyReview = dynamic(
  () => import('@/components/daily-review').then((m) => m.DailyReview),
  {
    loading: () => (
      <div className="flex flex-col items-center justify-center py-24 space-y-4 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
        <p className="text-sm">Carregando revisão diária...</p>
      </div>
    ),
  }
);

const TutorDrawer = dynamic(
  () => import('@/components/tutor-drawer').then((m) => m.TutorDrawer),
  {
    ssr: false,
  }
);

export function LearningAppShell() {
  const [activeTab, setActiveTab] = useState<'english' | 'ingest' | 'review' | 'records'>('english');
  const [rawInput, setRawInput] = useState<string | null>(null);
  const [refinedResult, setRefinedResult] = useState<RefineResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeStudyEntryId, setActiveStudyEntryId] = useState<string | null>(null);
  const [isTutorOpen, setIsTutorOpen] = useState(false);
  const [tutorContext, setTutorContext] = useState<{
    entryId?: string | null;
    documentTitle?: string | null;
    documentTopic?: string | null;
  }>({});
  const [activeStudyDoc, setActiveStudyDoc] = useState<{
    entryId?: string | null;
    documentTitle?: string | null;
    documentTopic?: string | null;
  } | null>(null);

  const handleOpenTutor = (options?: {
    entryId?: string | null;
    documentTitle?: string | null;
    documentTopic?: string | null;
  }) => {
    if (options && (options.entryId || options.documentTitle)) {
      setTutorContext(options);
      setActiveStudyDoc(options);
    } else if (activeStudyDoc) {
      setTutorContext(activeStudyDoc);
    } else {
      setTutorContext({});
    }
    setIsTutorOpen(true);
  };

  function handleRefined(input: string, result: RefineResult) {
    setRawInput(input);
    setRefinedResult(result);
  }

  function handleReset() {
    setRawInput(null);
    setRefinedResult(null);
  }

  return (
    <div className="h-screen w-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      {/* Top Header */}
      <header className="shrink-0 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur z-20">
        <div className="max-w-4xl xl:max-w-6xl 2xl:max-w-7xl mx-auto px-4 sm:px-6 py-2.5 sm:py-0 sm:h-16 flex flex-col sm:flex-row items-center sm:justify-between gap-2.5 sm:gap-4">
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
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 sm:py-1.5 min-h-[38px] sm:min-h-0 rounded-md text-[11px] sm:text-xs font-semibold whitespace-nowrap transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                activeTab === 'review'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <Flame className="w-3.5 h-3.5 shrink-0" />
              <span>Revisão SRS</span>
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

      {/* Body Area: Left Content (scrollable) + Right Integrated Sidebar (fixed) */}
      <div className="flex-1 flex w-full relative min-w-0 overflow-hidden">
        <main className="flex-1 min-w-0 h-full overflow-y-auto flex flex-col">
          <div
            className={`w-full px-4 sm:px-6 py-4 sm:py-6 flex flex-col transition-all duration-300 ease-in-out ${
              isTutorOpen ? 'max-w-none' : 'max-w-4xl xl:max-w-6xl 2xl:max-w-7xl mx-auto'
            }`}
          >
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

                    {/* Input Card maintaining standard distance */}
                    <div className="w-full mt-28 sm:mt-36 pb-6">
                      <EnglishPreFlight
                        onRefined={handleRefined}
                        isLoading={isLoading}
                        setIsLoading={setIsLoading}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6 w-full max-w-3xl mx-auto">
                    <ActiveRecall
                      rawInput={rawInput!}
                      result={refinedResult}
                      onReset={handleReset}
                    />
                  </div>
                )}
              </div>
            ) : activeTab === 'ingest' ? (
              <div className="flex-1 flex flex-col w-full">
                <div className="text-center space-y-2 mb-6">
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
                    Ingestão de Materiais & PDFs
                  </h2>
                  <p className="text-sm text-slate-400 max-w-xl mx-auto leading-relaxed">
                    Envie capítulos de livros, PDFs ou notas de aula. O sistema fatia o documento, sintetiza resumos seccionais e gera questões de Active Recall para o seu SRS.
                  </p>
                </div>
                <StudyIngest
                  onNavigateToRecords={() => setActiveTab('records')}
                  initialEntryId={activeStudyEntryId}
                  onOpenTutor={handleOpenTutor}
                  onActiveDocumentChange={(doc) => {
                    setActiveStudyDoc(doc);
                    if (isTutorOpen && doc) {
                      setTutorContext(doc);
                    }
                  }}
                />
              </div>
            ) : activeTab === 'review' ? (
              <div className="flex-1 flex flex-col w-full">
                <div className="text-center space-y-2 mb-6">
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
                    Revisão Diária SRS
                  </h2>
                  <p className="text-sm text-slate-400 max-w-xl mx-auto leading-relaxed">
                    Aqueça sua memória ativa com repetição espaçada. O algoritmo calcula o intervalo ideal para você nunca esquecer os conceitos e vocabulários estudados.
                  </p>
                </div>
                <DailyReview onComplete={() => setActiveTab('records')} />
              </div>
            ) : (
              <StudyRecords
                onPracticeEntry={(entryId) => {
                  setActiveStudyEntryId(entryId);
                  setActiveTab('ingest');
                }}
                onOpenTutor={(doc) => {
                  const ctx = {
                    entryId: doc.entryId,
                    documentTitle: doc.documentTitle,
                    documentTopic: doc.documentTopic,
                  };
                  setActiveStudyDoc(ctx);
                  setTutorContext(ctx);
                  setActiveStudyEntryId(doc.entryId);
                  setActiveTab('ingest');
                  setIsTutorOpen(true);
                }}
              />
            )}
          </div>
        </main>

        {/* Integrated Right Sidebar (Fixed to screen, like Casa Lar) */}
        <TutorDrawer
          isOpen={isTutorOpen}
          onClose={() => setIsTutorOpen(false)}
          entryId={tutorContext.entryId}
          documentTitle={tutorContext.documentTitle}
          documentTopic={tutorContext.documentTopic}
          onNavigateToRecords={() => setActiveTab('records')}
        />
      </div>

      {/* Floating Action Button (FAB) on the right */}
      {(activeTab === 'ingest' || activeTab === 'records') && !isTutorOpen && (
        <button
          type="button"
          onClick={() => handleOpenTutor()}
          className="fixed right-6 bottom-6 z-20 flex items-center gap-2 px-4 py-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-xl shadow-indigo-950/70 hover:shadow-indigo-500/30 border border-indigo-400/40 transition-all cursor-pointer group hover:scale-105 active:scale-95"
          title="Abrir o Tutor IA para tirar dúvidas sobre os materiais"
          aria-label="Abrir o Tutor IA"
        >
          <Bot className="w-4 h-4 text-white group-hover:rotate-6 transition-transform" />
          <span>Tutor IA</span>
        </button>
      )}
    </div>
  );
}
