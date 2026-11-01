'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export interface ActiveStatusBarProps {
  currentStep?: string | null;
  progressPercent?: number;
  startedAt?: string | null;
  completedCount?: number;
  totalCount?: number;
  isCompleted?: boolean;
  isFailed?: boolean;
  errorMessage?: string | null;
  label?: string;
}

const CLOCKWISE_STEPS = [0, 1, 2, 3]; // 0: Top-Left, 1: Top-Right, 2: Bottom-Right, 3: Bottom-Left

export function ActiveStatusBar({
  currentStep,
  progressPercent = 0,
  startedAt,
  completedCount = 0,
  totalCount = 1,
  isCompleted = false,
  isFailed = false,
  errorMessage,
  label = 'seções',
}: ActiveStatusBarProps) {
  const [dotIndex, setDotIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Animated 4-dot clockwise spinner every 180ms while active
  useEffect(() => {
    if (isCompleted || isFailed) return;
    const interval = setInterval(() => {
      setDotIndex((prev) => (prev + 1) % 4);
    }, 180);
    return () => clearInterval(interval);
  }, [isCompleted, isFailed]);

  // Live elapsed second-by-second timer
  useEffect(() => {
    const startTime = startedAt ? new Date(startedAt).getTime() : Date.now();

    const updateTimer = () => {
      const now = Date.now();
      const diffSecs = Math.max(0, Math.floor((now - startTime) / 1000));
      setElapsedSeconds(diffSecs);
    };

    updateTimer();
    if (isCompleted || isFailed) return;

    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [startedAt, isCompleted, isFailed]);

  // Format MM:SS
  const formattedElapsed = useMemo(() => {
    const mins = Math.floor(elapsedSeconds / 60);
    const secs = elapsedSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, [elapsedSeconds]);

  // Calculate adaptive ETA based on completed items
  const etaText = useMemo(() => {
    if (isCompleted) return 'Concluído';
    if (isFailed) return 'Falha';
    if (completedCount <= 0 || totalCount <= completedCount) {
      return 'Calculando estimativa...';
    }

    const avgSecondsPerItem = elapsedSeconds / completedCount;
    const remainingItems = totalCount - completedCount;
    const remainingSeconds = Math.max(5, Math.round(avgSecondsPerItem * remainingItems));

    const remMins = Math.floor(remainingSeconds / 60);
    const remSecs = remainingSeconds % 60;

    if (remMins === 0) {
      return `~${remSecs}s restantes`;
    }
    return `~${remMins}m ${String(remSecs).padStart(2, '0')}s restantes`;
  }, [isCompleted, isFailed, completedCount, totalCount, elapsedSeconds]);

  const displayStep = useMemo(() => {
    if (isFailed) return errorMessage || 'Falha no processamento';
    if (isCompleted) return 'Síntese completa concluída com sucesso!';
    if (currentStep) return currentStep;
    return `Processando ${label}...`;
  }, [isFailed, isCompleted, currentStep, errorMessage, label]);

  return (
    <div className="w-full bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 sm:p-4 space-y-2.5 shadow-lg backdrop-blur">
      {/* Top Status Bar: Live Timer • Contextual Step • ETA */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          {isCompleted ? (
            <span className="p-1 rounded bg-emerald-950/80 border border-emerald-800 text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </span>
          ) : isFailed ? (
            <span className="p-1 rounded bg-rose-950/80 border border-rose-800 text-rose-400">
              <AlertCircle className="w-3.5 h-3.5" />
            </span>
          ) : (
            <span
              className="inline-flex items-center justify-center p-1 rounded bg-amber-950/60 border border-amber-900/60 select-none shrink-0"
              title="Processando..."
              aria-label="Processando"
            >
              <span className="grid grid-cols-2 gap-1 w-3 h-3 items-center justify-items-center">
                {/* 0: Top-Left */}
                <span
                  className={`w-1 h-1 rounded-full transition-all duration-150 ${
                    dotIndex === 0
                      ? 'bg-amber-300 opacity-100 scale-125 shadow-[0_0_6px_rgba(251,191,36,0.9)]'
                      : (dotIndex + 3) % 4 === 0
                        ? 'bg-amber-400/60 opacity-60 scale-100'
                        : 'bg-amber-500/20 opacity-25 scale-75'
                  }`}
                />
                {/* 1: Top-Right */}
                <span
                  className={`w-1 h-1 rounded-full transition-all duration-150 ${
                    dotIndex === 1
                      ? 'bg-amber-300 opacity-100 scale-125 shadow-[0_0_6px_rgba(251,191,36,0.9)]'
                      : (dotIndex + 3) % 4 === 1
                        ? 'bg-amber-400/60 opacity-60 scale-100'
                        : 'bg-amber-500/20 opacity-25 scale-75'
                  }`}
                />
                {/* 3: Bottom-Left (Grid Row 2, Col 1) */}
                <span
                  className={`w-1 h-1 rounded-full transition-all duration-150 ${
                    dotIndex === 3
                      ? 'bg-amber-300 opacity-100 scale-125 shadow-[0_0_6px_rgba(251,191,36,0.9)]'
                      : (dotIndex + 3) % 4 === 3
                        ? 'bg-amber-400/60 opacity-60 scale-100'
                        : 'bg-amber-500/20 opacity-25 scale-75'
                  }`}
                />
                {/* 2: Bottom-Right (Grid Row 2, Col 2) */}
                <span
                  className={`w-1 h-1 rounded-full transition-all duration-150 ${
                    dotIndex === 2
                      ? 'bg-amber-300 opacity-100 scale-125 shadow-[0_0_6px_rgba(251,191,36,0.9)]'
                      : (dotIndex + 3) % 4 === 2
                        ? 'bg-amber-400/60 opacity-60 scale-100'
                        : 'bg-amber-500/20 opacity-25 scale-75'
                  }`}
                />
              </span>
            </span>
          )}

          <span className="font-mono text-slate-300 font-semibold">{formattedElapsed}</span>

          <span className="text-slate-600 hidden sm:inline">&bull;</span>

          <span className="text-slate-200 font-medium truncate max-w-[280px] sm:max-w-[420px]">
            {displayStep}
          </span>
        </div>

        <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
          {!isCompleted && !isFailed && (
            <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-indigo-300">
              {etaText}
            </span>
          )}
          <span className="text-indigo-400 font-bold">{Math.round(progressPercent)}%</span>
        </div>
      </div>

      {/* Progress Track */}
      <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden border border-slate-800/80">
        <div
          className={`h-full transition-all duration-500 rounded-full ${
            isCompleted
              ? 'bg-emerald-500'
              : isFailed
              ? 'bg-rose-500'
              : 'bg-gradient-to-r from-indigo-500 to-amber-400'
          }`}
          style={{ width: `${Math.min(100, Math.max(3, progressPercent))}%` }}
        />
      </div>
    </div>
  );
}
