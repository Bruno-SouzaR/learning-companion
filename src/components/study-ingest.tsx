'use client';

import React, { useState, useEffect } from 'react';
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  Loader2,
  Sparkles,
  BookOpen,
  ArrowRight,
  BrainCircuit,
  Check,
  AlertCircle,
  Tag,
  RotateCcw,
  Trophy,
  HelpCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  X,
  CornerDownRight,
  Bot,
} from 'lucide-react';
import { MarkdownView } from './markdown-view';
import { jumpToConceptHeading } from './landmark-navigation';
import { ActiveStatusBar } from './active-status-bar';
import type { IngestJob, CompletedSectionData } from '@/server/ingest-job-manager';
import type { QuizSession, QuizEvaluationResult } from '@/server/quiz-engine';
interface StudyIngestProps {
  onNavigateToRecords?: () => void;
  initialEntryId?: string | null;
  onOpenTutor?: (options: { entryId?: string; documentTitle?: string; documentTopic?: string }) => void;
}

export function StudyIngest({ onNavigateToRecords, initialEntryId, onOpenTutor }: StudyIngestProps) {
  // Input form state
  const [inputMode, setInputMode] = useState<'file' | 'text'>('file');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [textContent, setTextContent] = useState('');
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Active Job state (Progressive Ingestion)
  const [activeJob, setActiveJob] = useState<IngestJob | null>(null);
  const [pollInterval, setPollInterval] = useState<number | null>(null);

  // Resume: discover in-flight or recent jobs on mount for continuity
  const [recentJobs, setRecentJobs] = useState<Array<{ id: string; title: string; status: string; totalSections: number }>>([]);

  // Accordion state: global collapse + per-section collapse
  const [isSummaryCollapsed, setIsSummaryCollapsed] = useState(false);
  const [collapsedSectionIndices, setCollapsedSectionIndices] = useState<Record<number, boolean>>({});
  const [isRetryingSection, setIsRetryingSection] = useState<Record<number, boolean>>({});
  const [expandedQuizCardId, setExpandedQuizCardId] = useState<string | null>(null);
  // Quiz collapse state (mirrors summary collapse behavior)
  const [isQuizCollapsed, setIsQuizCollapsed] = useState(false);
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const res = await fetch('/api/study/ingest');
        const json = await res.json();
        if (json.success && json.data?.jobs) {
          setRecentJobs(json.data.jobs);
        }
      } catch (err) {
        console.error('Falha ao consultar jobs:', err);
      }
    }, 5000);

    const bootstrap = async () => {
      try {
        const res = await fetch('/api/study/ingest');
        const json = await res.json();
        if (json.success && json.data?.jobs) {
          setRecentJobs(json.data.jobs);
        }
      } catch (err) {
        console.error('Falha ao listar jobs iniciais:', err);
      }
    };
    void bootstrap();
    return () => clearInterval(timer);
  }, []);

  // Quiz state
  const [quizSession, setQuizSession] = useState<QuizSession | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [isSubmittingQuiz, setIsSubmittingQuiz] = useState(false);
  const [quizEvaluation, setQuizEvaluation] = useState<QuizEvaluationResult | null>(null);

  // Auto-restore last active job from localStorage on initial mount
  useEffect(() => {
    try {
      const lastJobId = localStorage.getItem('learning_active_job_id');
      if (lastJobId && !activeJob) {
        void fetch(`/api/study/ingest?jobId=${encodeURIComponent(lastJobId)}`)
          .then((r) => r.json())
          .then((json) => {
            if (json.success && json.data) {
              setActiveJob(json.data);
            }
          });
      }
    } catch (e) {
      console.warn('Falha ao restaurar job ativo do localStorage:', e);
    }
  }, []);

  // Persist activeJob id to localStorage
  useEffect(() => {
    if (activeJob?.id) {
      try {
        localStorage.setItem('learning_active_job_id', activeJob.id);
      } catch {}
    }
  }, [activeJob?.id]);

  // Rehydrate draft answers or evaluation whenever quizSession changes
  useEffect(() => {
    if (!quizSession) return;
    try {
      const savedDraft = localStorage.getItem(`learning_quiz_answers_${quizSession.id}`);
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft);
        if (parsed && typeof parsed === 'object') {
          setQuizAnswers((prev) => ({ ...parsed, ...prev }));
        }
      }
      const savedEval = localStorage.getItem(`learning_quiz_eval_${quizSession.id}`);
      if (savedEval) {
        const parsedEval = JSON.parse(savedEval);
        if (parsedEval && parsedEval.quizId === quizSession.id) {
          setQuizEvaluation(parsedEval);
        }
      }
    } catch (e) {
      console.warn('Falha ao reidratar rascunho de simulado:', e);
    }
  }, [quizSession?.id]);

  // Update answers state and persist directly to localStorage
  const handleAnswerInput = (questionId: string, val: string) => {
    setQuizAnswers((prev) => {
      const updated = { ...prev, [questionId]: val };
      if (quizSession?.id) {
        try {
          localStorage.setItem(`learning_quiz_answers_${quizSession.id}`, JSON.stringify(updated));
        } catch {}
      }
      return updated;
    });
  };
  // Auto-load material directly if initialEntryId is supplied (e.g. from Caderno "Praticar Material")
  useEffect(() => {
    if (!initialEntryId) return;
    const loadEntry = async () => {
      try {
        const res = await fetch(`/api/study/ingest?entryId=${encodeURIComponent(initialEntryId)}`);
        const json = await res.json();
        if (json.success && json.data) {
          setActiveJob(json.data);
          if (json.quiz) {
            setQuizSession(json.quiz);
          }
        }
      } catch (err) {
        console.error('Falha ao carregar material selecionado:', err);
      }
    };
    void loadEntry();
  }, [initialEntryId]);

  const handleDismissJob = async (jobId: string) => {
    try {
      setRecentJobs((prev) => prev.filter((j) => j.id !== jobId));
      await fetch('/api/study/ingest/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });
    } catch (err) {
      console.error('Falha ao dispensar trabalho:', err);
    }
  };
  // Polling for active background job
  useEffect(() => {
    if (!activeJob || activeJob.status === 'completed' || activeJob.status === 'failed') {
      return;
    }

    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/study/ingest?jobId=${encodeURIComponent(activeJob.id)}`);
        const json = await res.json();
        if (json.success && json.data) {
          setActiveJob(json.data);
          if (json.data.status === 'completed' || json.data.status === 'failed') {
            clearInterval(timer);
          }
        }
      } catch (err) {
        console.error('Falha ao consultar status do job:', err);
      }
    }, 2500);

    return () => clearInterval(timer);
  }, [activeJob]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    if (file && !title) {
      const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ');
      setTitle(cleanName.charAt(0).toUpperCase() + cleanName.slice(1));
    }
  }

  async function handleStartIngestion(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    if (!title.trim() || !topic.trim()) {
      setErrorMessage('Título e tópico são campos obrigatórios.');
      return;
    }

    if (inputMode === 'file' && !selectedFile) {
      setErrorMessage('Selecione um arquivo PDF para upload.');
      return;
    }

    if (inputMode === 'text' && !textContent.trim()) {
      setErrorMessage('O conteúdo do texto não pode estar vazio.');
      return;
    }

    setIsStarting(true);

    try {
      let res: Response;

      if (inputMode === 'file' && selectedFile) {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('title', title.trim());
        formData.append('topic', topic.trim());
        if (tagsInput.trim()) {
          formData.append('tags', tagsInput.trim());
        }

        res = await fetch('/api/study/ingest', {
          method: 'POST',
          body: formData,
        });
      } else {
        const tags = tagsInput
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);

        res = await fetch('/api/study/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title.trim(),
            topic: topic.trim(),
            content: textContent.trim(),
            tags: tags.length > 0 ? tags : undefined,
          }),
        });
      }

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Falha ao iniciar processamento do documento.');
      }

      setActiveJob({
        id: json.data.jobId,
        title: json.data.title,
        topic: json.data.topic,
        status: 'processing',
        totalSections: json.data.totalSections,
        completedSections: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao iniciar ingestão.';
      setErrorMessage(message);
    } finally {
      setIsStarting(false);
    }
  }

  async function handleOpenJob(jobId: string) {
    try {
      const res = await fetch(`/api/study/ingest?jobId=${encodeURIComponent(jobId)}`);
      const json = await res.json();
      if (json.success && json.data) {
        setActiveJob(json.data);
        if (json.data.latestQuiz) {
          setQuizSession(json.data.latestQuiz);
          setIsSummaryCollapsed(true);
          setIsQuizCollapsed(true); // Ambos contraídos por padrão
        } else {
          setQuizSession(null);
          setQuizEvaluation(null);
        }
      }
    } catch (err) {
      console.error('Falha ao abrir job:', err);
    }
  }

  async function handleGenerateQuiz(count = 10) {
    if (!activeJob) return;

    setIsGeneratingQuiz(true);
    // Auto-collapse summary and expand quiz on generation
    setIsSummaryCollapsed(true);
    setIsQuizCollapsed(false);
    try {
      const studyEntryId = activeJob.entryId || activeJob.id;
      const res = await fetch('/api/study/quiz/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studyEntryId,
          questionCount: count,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Falha ao gerar simulado.');
      }

      setQuizSession(json.data);
      setQuizAnswers({});
      setQuizEvaluation(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao gerar simulado.';
      setErrorMessage(message);
    } finally {
      setIsGeneratingQuiz(false);
    }
  }
  function toggleSectionCollapse(index: number) {
    setCollapsedSectionIndices((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  }

  function handleJumpToConcept(sectionIndex: number, bulletText: string, bulletIdx: number, totalBullets: number) {
    // If section is collapsed, auto-expand it first so elements exist in DOM
    if (collapsedSectionIndices[sectionIndex]) {
      setCollapsedSectionIndices((prev) => ({
        ...prev,
        [sectionIndex]: false,
      }));
    }

    setTimeout(() => {
      const sectionArticle = document.getElementById(`section-article-${sectionIndex}`);
      if (!sectionArticle) return;

      jumpToConceptHeading({
        container: sectionArticle,
        bulletText,
        bulletIndex: bulletIdx,
        totalBullets,
      });
    }, 60);
  }

  async function handleRetrySection(sectionIndex: number) {
    if (!activeJob) return;
    setIsRetryingSection((prev) => ({ ...prev, [sectionIndex]: true }));
    setErrorMessage(null);
    try {
      const res = await fetch('/api/study/section/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: activeJob.id, sectionIndex }),
      });
      const json = await res.json();
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error || 'Falha ao regenerar seção');
      }

      const updatedSection = json.data as CompletedSectionData;
      setActiveJob((prev) => {
        if (!prev) return prev;
        const copy = [...prev.completedSections];
        const idx = copy.findIndex((s) => s.sectionIndex === sectionIndex);
        if (idx !== -1) {
          copy[idx] = updatedSection;
        } else {
          copy.push(updatedSection);
          copy.sort((a, b) => a.sectionIndex - b.sectionIndex);
        }
        return { ...prev, completedSections: copy };
      });
    } catch (err: unknown) {
      console.error('Erro ao regenerar seção:', err);
      const msg = err instanceof Error ? err.message : 'Falha ao regenerar seção';
      setErrorMessage(`Erro ao regenerar Seção ${sectionIndex}: ${msg}`);
    } finally {
      setIsRetryingSection((prev) => ({ ...prev, [sectionIndex]: false }));
    }
  }
  async function handleSubmitQuiz(e: React.FormEvent) {
    e.preventDefault();
    if (!quizSession) return;

    setIsSubmittingQuiz(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/study/quiz/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quizId: quizSession.id,
          answers: quizAnswers,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Falha ao avaliar simulado.');
      }
      setQuizEvaluation(json.data);
      if (quizSession?.id) {
        try {
          localStorage.setItem(`learning_quiz_eval_${quizSession.id}`, JSON.stringify(json.data));
        } catch {}
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao submeter simulado.';
      setErrorMessage(message);
    } finally {
      setIsSubmittingQuiz(false);
    }
  }

  async function handleReinforceSection(sectionIndex: number) {
    if (!quizSession) return;

    setIsGeneratingQuiz(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/study/quiz/reinforce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quizId: quizSession.id,
          weakSectionIndex: sectionIndex,
          count: 5,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Falha ao gerar reforço.');
      }

      setQuizSession(json.data);
      setQuizAnswers({});
      setQuizEvaluation(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao gerar reforço de seção.';
      setErrorMessage(message);
    } finally {
      setIsGeneratingQuiz(false);
    }
  }

  function handleResetAll() {
    setActiveJob(null);
    setQuizSession(null);
    setQuizAnswers({});
    setQuizEvaluation(null);
    setSelectedFile(null);
    setTextContent('');
    setTitle('');
    setTopic('');
    setTagsInput('');
    setErrorMessage(null);
  }

  // 3. PROGRESSIVE INGESTION & TEXTBOOK READING VIEW
  if (activeJob) {
    const isCompleted = activeJob.status === 'completed';
    const isFailed = activeJob.status === 'failed';
    const completedCount = activeJob.completedSections.length;
    const progressPercent = Math.min(100, Math.round((completedCount / Math.max(1, activeJob.totalSections)) * 100));

    return (
      <div className="w-full space-y-6 bg-slate-900/60 border border-slate-800 rounded-xl p-5 md:p-7 shadow-xl backdrop-blur-sm">
        {/* Header & Stepper */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              {isCompleted ? (
                <span className="p-1 rounded-md bg-emerald-950/80 border border-emerald-800 text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                </span>
              ) : isFailed ? (
                <span className="p-1 rounded-md bg-rose-950/80 border border-rose-800 text-rose-400">
                  <AlertCircle className="w-4 h-4" />
                </span>
              ) : (
                <span className="p-1 rounded-md bg-indigo-950/80 border border-indigo-800 text-indigo-400 animate-pulse">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </span>
              )}
              <h3 className="text-lg font-bold text-slate-100">{activeJob.title}</h3>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Tópico: <strong className="text-slate-300">{activeJob.topic}</strong> &bull;{' '}
              {isCompleted
                ? 'Síntese completa concluída'
                : isFailed
                ? `Erro: ${activeJob.errorMessage || 'Falha no processamento'}`
                : activeJob.currentStep || `Processando Seção ${completedCount + 1} de ${activeJob.totalSections}...`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleResetAll}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Ingerir Outro</span>
            </button>
            {onOpenTutor && (
              <button
                type="button"
                onClick={() =>
                  onOpenTutor({
                    entryId: activeJob.entryId || undefined,
                    documentTitle: activeJob.title,
                    documentTopic: activeJob.topic,
                  })
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-300 bg-indigo-950/80 border border-indigo-800/60 hover:bg-indigo-900/60 transition-colors cursor-pointer shadow-xs"
                title="Tirar dúvidas deste material com o Tutor IA"
              >
                <Bot className="w-3.5 h-3.5 text-indigo-400" />
                <span>Tutor IA</span>
              </button>
            )}
            {isCompleted && onNavigateToRecords && (
              <button
                onClick={onNavigateToRecords}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Caderno</span>
              </button>
            )}
            {isCompleted && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setIsSummaryCollapsed(!isSummaryCollapsed)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
                  title={isSummaryCollapsed ? 'Expandir resumo completo' : 'Recolher resumo para focar nas questões'}
                >
                  {isSummaryCollapsed ? (
                    <>
                      <ChevronDown className="w-3.5 h-3.5" />
                      <span>Expandir Resumo</span>
                    </>
                  ) : (
                    <>
                      <ChevronUp className="w-3.5 h-3.5" />
                      <span>Recolher Resumo</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => handleGenerateQuiz(10)}
                  disabled={isGeneratingQuiz}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isGeneratingQuiz ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Gerando Simulado...</span>
                    </>
                  ) : (
                    <>
                      <BrainCircuit className="w-3.5 h-3.5" />
                      <span>Iniciar Simulado (10 Questões)</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
        {/* OMP-Style Live Status Bar (Timer • Contextual Step • Adaptive ETA • Progress) */}
        {!isCompleted && !isFailed && (
          <ActiveStatusBar
            currentStep={activeJob.currentStep}
            progressPercent={progressPercent}
            startedAt={activeJob.startedAt || activeJob.createdAt}
            completedCount={completedCount}
            totalCount={activeJob.totalSections}
            isCompleted={isCompleted}
            isFailed={isFailed}
            errorMessage={activeJob.errorMessage}
            label="seções"
          />
        )}

        {/* Progressive Section Reading Stream */}
        {!isSummaryCollapsed ? (
          <div className="space-y-5">
            {activeJob.completedSections.map((sec) => {
              const isSectionCollapsed = !!collapsedSectionIndices[sec.sectionIndex];
              return (
                <article
                  key={sec.sectionIndex}
                  id={`section-article-${sec.sectionIndex}`}
                  className="p-5 md:p-6 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3 shadow-sm transition-all"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-indigo-950 text-indigo-300 border border-indigo-800">
                        Seção {sec.sectionIndex}
                      </span>
                      <h4 className="text-base font-bold text-slate-100">{sec.sectionTitle}</h4>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleRetrySection(sec.sectionIndex)}
                        disabled={isRetryingSection[sec.sectionIndex]}
                        className="p-1 rounded text-slate-400 hover:text-indigo-300 hover:bg-slate-800/60 transition-colors cursor-pointer"
                        title="Reanalisar e regenerar esta seção com IA"
                        aria-label="Reanalisar e regenerar esta seção com IA"
                      >
                        <RotateCcw
                          className={`w-3.5 h-3.5 ${
                            isRetryingSection[sec.sectionIndex] ? 'animate-spin text-indigo-400' : ''
                          }`}
                        />
                      </button>

                      <button
                        onClick={() => toggleSectionCollapse(sec.sectionIndex)}
                        className="p-1 rounded text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                        title={isSectionCollapsed ? 'Expandir seção' : 'Recolher seção'}
                        aria-label={isSectionCollapsed ? 'Expandir seção' : 'Recolher seção'}
                      >
                        {isSectionCollapsed ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronUp className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {isRetryingSection[sec.sectionIndex] ? (
                    <div className="p-6 rounded-xl bg-slate-900/40 border border-indigo-500/30 border-dashed animate-pulse text-center space-y-2">
                      <Loader2 className="w-5 h-5 text-indigo-400 animate-spin mx-auto" />
                      <p className="text-xs font-semibold text-indigo-300">
                        Reanalisando e regenerando Seção {sec.sectionIndex} com o Gemma 4 E4B...
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Processando o trecho do PDF original e atualizando o material...
                      </p>
                    </div>
                  ) : !isSectionCollapsed && (
                    <>
                      {sec.keyPoints && sec.keyPoints.length > 0 && (
                        <div className="bg-slate-900/70 p-4 sm:p-5 rounded-xl border border-slate-800/80 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                              Pontos Nucleares da Seção:
                            </span>
                            <span className="text-[11px] text-slate-400 font-normal lowercase hidden sm:inline">
                              (clique para saltar ao conceito)
                            </span>
                          </div>
                          <ul className="text-sm sm:text-[15px] text-slate-200 space-y-1.5 pl-1 list-none leading-relaxed">
                            {sec.keyPoints.map((kp, kIdx) => (
                              <li key={kIdx}>
                                <button
                                  type="button"
                                  onClick={() => handleJumpToConcept(sec.sectionIndex, kp, kIdx, sec.keyPoints.length)}
                                  className="w-full text-left flex items-start gap-2.5 py-1.5 px-2 rounded-lg text-slate-200 hover:text-indigo-200 hover:bg-indigo-950/40 transition-all cursor-pointer group"
                                  title="Clique para centralizar a explicação deste conceito na tela"
                                >
                                  <CornerDownRight className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                                  <span>{kp}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <MarkdownView content={sec.markdown} />
                    </>
                  )}
                </article>
              );
            })}

            {/* Active Skeleton Card: Shows user that the next section is actively being generated */}
            {!isCompleted && !isFailed && (
              <div className="p-5 md:p-6 rounded-xl bg-slate-950/40 border border-slate-800/80 border-dashed space-y-2.5 animate-pulse">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-amber-950/60 text-amber-300 border border-amber-900/60">
                    Em Elaboração
                  </span>
                  <h4 className="text-sm font-bold text-slate-300">
                    Sintetizando Seção {completedCount + 1} de {activeJob.totalSections}...
                  </h4>
                </div>
                <p className="text-xs text-slate-400">
                  Estruturando definições teóricas, mecanismos práticos e tabelas conceituais. Esta seção será liberada automaticamente para leitura assim que for finalizada.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800 text-center flex items-center justify-between">
            <span className="text-xs text-slate-400">
              Resumo recolhido para leitura focada. Clique para expandir a qualquer momento.
            </span>
            <button
              onClick={() => setIsSummaryCollapsed(false)}
              className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 cursor-pointer"
            >
              Expandir Resumo
            </button>
          </div>
        )}
        {/* Unified Interactive Section (Quiz / Evaluation) on the SAME screen */}
        {quizEvaluation ? (
          <div className="pt-6 border-t border-slate-800 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded-md bg-emerald-950/80 border border-emerald-800 text-emerald-400">
                  <Trophy className="w-4 h-4" />
                </span>
                <h3 className="text-base font-bold text-slate-100">Resultado do Simulado</h3>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsQuizCollapsed(!isQuizCollapsed)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
                  title={isQuizCollapsed ? 'Expandir resultado' : 'Recolher resultado'}
                >
                  {isQuizCollapsed ? (
                    <>
                      <ChevronDown className="w-3.5 h-3.5" />
                      <span>Expandir Resultado</span>
                    </>
                  ) : (
                    <>
                      <ChevronUp className="w-3.5 h-3.5" />
                      <span>Recolher Resultado</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleGenerateQuiz(10)}
                  disabled={isGeneratingQuiz}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Novo Simulado</span>
                </button>
              </div>
            </div>
            {!isQuizCollapsed ? (
              <div className="space-y-6">
                {/* Score Banner */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800 text-center">
                <span className="text-xs text-slate-400 block mb-1">Acertos</span>
                <span className="text-2xl font-extrabold text-emerald-400">
                  {quizEvaluation.score} / {quizEvaluation.totalQuestions}
                </span>
              </div>
              <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800 text-center">
                <span className="text-xs text-slate-400 block mb-1">Aproveitamento</span>
                <span className="text-2xl font-extrabold text-indigo-400">
                  {quizEvaluation.percentage}%
                </span>
              </div>
              <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800 text-center">
                <span className="text-xs text-slate-400 block mb-1">Diagnóstico</span>
                <span className="text-sm font-semibold text-slate-200">
                  {quizEvaluation.percentage >= 70 ? 'Domínio Sólido' : 'Requer Reforço'}
                </span>
              </div>
            </div>

            {/* Weak Sections Reinforcement Action */}
            {quizEvaluation.weakSections.length > 0 && (
              <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-900/60 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-bold text-amber-300 uppercase tracking-wide block">
                      Pontos Fracos Identificados
                    </span>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Você teve divergências na Seção {quizEvaluation.weakSections.join(', ')}. Deseja fixar o conceito com novas questões sob outra ótica?
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleReinforceSection(quizEvaluation.weakSections[0])}
                    disabled={isGeneratingQuiz}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 shadow transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    <BrainCircuit className="w-4 h-4" />
                    <span>Reforçar Seção {quizEvaluation.weakSections[0]} (+5 Questões)</span>
                  </button>
                </div>
              </div>
            )}

            {/* Detailed Correction */}
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Correção Detalhada Questão por Questão
              </h4>

              {quizEvaluation.results.map((res, idx) => {
                const isCardExpanded = expandedQuizCardId === res.questionId;
                return (
                  <div
                    key={res.questionId}
                    className={`bg-slate-900/60 border rounded-xl p-4.5 transition-all shadow-sm ${
                      res.isCorrect ? 'border-emerald-900/50 hover:border-emerald-800' : 'border-rose-900/50 hover:border-rose-800'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-1.5">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              res.isCorrect
                                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                                : 'bg-rose-950/80 text-rose-300 border border-rose-800/60'
                            }`}
                          >
                            {res.isCorrect ? 'Acerto' : 'Revisar'}
                          </span>
                          {res.scorePercentage !== undefined && (
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono border ${
                                res.scorePercentage >= 70
                                  ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/50'
                                  : res.scorePercentage >= 40
                                  ? 'bg-amber-950/60 text-amber-400 border-amber-800/50'
                                  : 'bg-rose-950/60 text-rose-400 border-rose-800/50'
                              }`}
                            >
                              {res.scorePercentage}% precisão
                            </span>
                          )}
                          <span className="text-xs px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800 font-mono">
                            Seção {res.sectionIndex}
                          </span>
                          <h4 className="text-sm font-semibold text-slate-100">
                            Questão {idx + 1}
                          </h4>
                        </div>

                        <p className="text-xs sm:text-sm font-medium text-slate-200 mt-1">
                          {res.question}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setExpandedQuizCardId(isCardExpanded ? null : res.questionId)}
                        aria-label={isCardExpanded ? 'Recolher detalhes' : 'Expandir detalhes'}
                        className="min-w-[36px] min-h-[36px] flex items-center justify-center p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                        title={isCardExpanded ? 'Recolher detalhes' : 'Expandir detalhes'}
                      >
                        {isCardExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                    </div>

                    <div className="mt-2.5 p-3 rounded-lg bg-slate-950/60 border border-slate-800/60 text-xs">
                      <span className="text-slate-400 font-semibold block mb-0.5">Sua Resposta:</span>
                      <p className="text-slate-200 italic">{res.userAnswer || '(Em branco)'}</p>
                    </div>

                    {isCardExpanded && (
                      <div className="mt-3 pt-3 border-t border-slate-800/60 text-xs space-y-2.5">
                        <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-900/40">
                          <span className="text-emerald-400 font-semibold block mb-0.5">Resposta Esperada Oficial:</span>
                          <p className="text-slate-100">{res.expectedAnswer}</p>
                        </div>

                        {res.whatWasGood ? (
                          <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-900/50 text-emerald-200 flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                            <div>
                              <strong className="block text-emerald-300 font-semibold mb-0.5">O que você explicou bem:</strong>
                              <span>{res.whatWasGood}</span>
                            </div>
                          </div>
                        ) : null}

                        {res.whatWasMissing ? (
                          <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-900/50 text-amber-200 flex items-start gap-2">
                            <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <div>
                              <strong className="block text-amber-300 font-semibold mb-0.5">O que poderia complementar:</strong>
                              <span>{res.whatWasMissing}</span>
                            </div>
                          </div>
                        ) : null}

                        {res.misconceptionsFeedback ? (
                          <div className="p-2.5 rounded-lg bg-rose-950/30 border border-rose-900/50 text-rose-200 flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                            <div>
                              <strong className="block text-rose-300 font-semibold mb-0.5">Ponto de Atenção Conceitual:</strong>
                              <span>{res.misconceptionsFeedback}</span>
                            </div>
                          </div>
                        ) : null}

                        <div className="text-slate-300 italic pt-1">
                          <strong>Diagnóstico Geral:</strong> {res.feedback}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800 text-center flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  Resultado do Simulado ({quizEvaluation.score}/{quizEvaluation.totalQuestions} acertos &bull; {quizEvaluation.percentage}%). Clique para ver a correção.
                </span>
                <button
                  type="button"
                  onClick={() => setIsQuizCollapsed(false)}
                  className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 cursor-pointer flex items-center gap-1"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                  <span>Expandir Resultado</span>
                </button>
              </div>
            )}
          </div>
        ) : isGeneratingQuiz ? (
          <div className="pt-6 border-t border-slate-800 space-y-4">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-md bg-indigo-950/80 border border-indigo-800 text-indigo-400">
                <BrainCircuit className="w-4 h-4 animate-pulse" />
              </span>
              <h3 className="text-base font-bold text-slate-100">Gerando Questões de Fixação</h3>
            </div>
            <ActiveStatusBar
              currentStep="Elaborando 10 questões de active recall distribuídas pelas seções..."
              progressPercent={50}
              label="questões"
            />
          </div>
        ) : quizSession ? (
          <div className="pt-6 border-t border-slate-800 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-1 rounded-md bg-indigo-950/80 border border-indigo-800 text-indigo-400">
                    <HelpCircle className="w-4 h-4" />
                  </span>
                  <h3 className="text-base font-bold text-slate-100">{quizSession.title}</h3>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Responda de memória para testar retenção ativa &bull; As respostas corretas serão reveladas na submissão
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsQuizCollapsed(!isQuizCollapsed)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
                title={isQuizCollapsed ? 'Expandir simulado' : 'Recolher simulado'}
              >
                {isQuizCollapsed ? (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" />
                    <span>Expandir Simulado</span>
                  </>
                ) : (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" />
                    <span>Recolher Simulado</span>
                  </>
                )}
              </button>
            </div>

            {!isQuizCollapsed ? (

            <form onSubmit={handleSubmitQuiz} className="space-y-4">
              {quizSession.questions.map((q, idx) => (
                <div
                  key={q.id}
                  className="bg-slate-900/60 border border-slate-800 rounded-xl p-4.5 space-y-2.5 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-950/80 text-indigo-300 border border-indigo-800/60">
                        Seção {q.sectionIndex}
                      </span>
                      <h4 className="text-xs font-semibold text-slate-300">
                        Questão {idx + 1} de {quizSession.questions.length}
                      </h4>
                    </div>

                    {q.clozeHint && (
                      <span className="text-[11px] text-slate-400 italic">
                        Dica: {q.clozeHint}
                      </span>
                    )}
                  </div>

                  <label htmlFor={q.id} className="text-xs sm:text-sm font-semibold text-slate-100 block">
                    {q.question}
                  </label>

                  <textarea
                    id={q.id}
                    rows={2}
                    value={quizAnswers[q.id] || ''}
                    onChange={(e) => handleAnswerInput(q.id, e.target.value)}
                    placeholder="Digite sua resposta de memória aqui..."
                    disabled={isSubmittingQuiz}
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-lg p-3 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all resize-none"
                  />
                </div>
              ))}

              {errorMessage && (
                <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="pt-2 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  {Object.keys(quizAnswers).filter((k) => (quizAnswers[k] || '').trim().length > 0).length} de{' '}
                  {quizSession.questions.length} respondidas
                </span>

                <button
                  type="submit"
                  disabled={isSubmittingQuiz}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
                >
                  {isSubmittingQuiz ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Avaliando...</span>
                    </>
                  ) : (
                    <>
                      <span>Submeter Respostas e Ver Correção</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
              </form>
            ) : (
              <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800 text-center flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  Simulado ativo ({quizSession.questions.length} questões). Clique para continuar respondendo.
                </span>
                <button
                  type="button"
                  onClick={() => setIsQuizCollapsed(false)}
                  className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 cursor-pointer flex items-center gap-1"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                  <span>Expandir Simulado</span>
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    );
  }

  // 4. INITIAL INGESTION FORM VIEW
  const banner = recentJobs.length > 0 ? (
    <div className="space-y-3 rounded-xl bg-slate-800/50 border border-slate-700/60 p-4">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">
        Materiais Recentes em Andamento ({Math.min(3, recentJobs.length)})
      </span>
      <div className="space-y-1.5">
        {recentJobs.slice(0, 3).map((job) => (
          <div key={job.id} className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleOpenJob(job.id)}
              className="flex-1 flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left text-xs font-medium text-slate-300 hover:bg-slate-700/50 bg-slate-800/30 border border-slate-800 transition-colors cursor-pointer truncate"
            >
              <span className="truncate">{job.title}</span>
              <span className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-semibold ${
                job.status === 'completed'
                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                  : 'bg-indigo-950/80 text-indigo-300 border border-indigo-800/60'
              }`}>
                {job.status === 'completed' ? `Concluído · ${job.totalSections}p` : `Processando · ${job.totalSections}p`}
              </span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleDismissJob(job.id);
              }}
              className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 transition-colors cursor-pointer shrink-0"
              title="Dispensar do painel recente"
              aria-label="Dispensar trabalho"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-400">
        Selecione um material para retomar a leitura ou praticar o simulado. O histórico completo está no Caderno.
      </p>
    </div>
  ) : null;

  return (
    <div className="w-full space-y-5 bg-slate-900/60 border border-slate-800 rounded-xl p-5 md:p-6 shadow-xl backdrop-blur-sm">
      {banner}
      {/* Mode Selector Tabs */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Formato de Entrada</span>
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button
            type="button"
            onClick={() => setInputMode('file')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              inputMode === 'file'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Upload PDF</span>
          </button>
          <button
            type="button"
            onClick={() => setInputMode('text')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              inputMode === 'text'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Colar Texto</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleStartIngestion} className="space-y-4">
        {/* Dual Input: File Dropzone or Textarea */}
        {inputMode === 'file' ? (
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 block mb-1.5">
              Selecione o Arquivo PDF
            </label>
            <div className="relative border-2 border-dashed border-slate-800 hover:border-indigo-500/60 rounded-xl p-6 text-center transition-all bg-slate-950/40 cursor-pointer">
              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={handleFileChange}
                disabled={isStarting}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
              />
              <div className="flex flex-col items-center justify-center space-y-2 pointer-events-none">
                <div className="w-10 h-10 rounded-full bg-indigo-950/80 border border-indigo-800/80 flex items-center justify-center text-indigo-400">
                  <UploadCloud className="w-5 h-5" />
                </div>
                {selectedFile ? (
                  <div>
                    <span className="text-sm font-semibold text-emerald-400 block">{selectedFile.name}</span>
                    <span className="text-xs text-slate-400">
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB &bull; Clique para trocar
                    </span>
                  </div>
                ) : (
                  <div>
                    <span className="text-sm font-semibold text-slate-200 block">
                      Arraste um PDF ou clique para navegar
                    </span>
                    <span className="text-xs text-slate-400 block mt-0.5">
                      Processamento 100% local com extração in-process e zero egress
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div>
            <label
              htmlFor="study-text-input"
              className="text-xs font-semibold uppercase tracking-wider text-slate-300 block mb-1.5"
            >
              Conteúdo do Documento ou Artigo
            </label>
            <textarea
              id="study-text-input"
              rows={6}
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              placeholder="Cole aqui o conteúdo de um capítulo, anotações de aula ou artigo técnico..."
              disabled={isStarting}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-lg p-3.5 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all resize-y"
            />
          </div>
        )}

        {/* Metadata Inputs: Title & Topic */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="study-title"
              className="text-xs font-semibold uppercase tracking-wider text-slate-300 block mb-1.5"
            >
              Título do Material
            </label>
            <input
              id="study-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Sistemas de Arquivos: Estrutura e Cache"
              disabled={isStarting}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
            />
          </div>

          <div>
            <label
              htmlFor="study-topic"
              className="text-xs font-semibold uppercase tracking-wider text-slate-300 block mb-1.5"
            >
              Tópico / Disciplina
            </label>
            <input
              id="study-topic"
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Ex: Sistemas Operacionais"
              disabled={isStarting}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
            />
          </div>
        </div>

        {/* Tags */}
        <div>
          <label
            htmlFor="study-tags"
            className="text-xs font-semibold uppercase tracking-wider text-slate-300 block mb-1.5"
          >
            Tags (separadas por vírgula)
          </label>
          <input
            id="study-tags"
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="Ex: so, fs, inodes, cache"
            disabled={isStarting}
            className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
          />
        </div>

        {/* Inline Error */}
        {errorMessage && (
          <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Action Button */}
        <div className="pt-2 flex items-center justify-between">
          <span className="text-xs text-slate-400 hidden sm:inline">
            Inicia síntese autônoma com entrega progressiva de seções.
          </span>

          <button
            type="submit"
            disabled={isStarting}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white shadow-lg shadow-indigo-600/20 transition-all cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            {isStarting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Iniciando Job...</span>
              </>
            ) : (
              <>
                <span>Iniciar Síntese do Material</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
