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

const BRAILLE_DOTS = ['.:', ':.', '::', '.:'];

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

  // Animated dots pulse every 350ms while active
  useEffect(() => {
    if (isCompleted || isFailed) return;
    const interval = setInterval(() => {
      setDotIndex((prev) => (prev + 1) % BRAILLE_DOTS.length);
    }, 350);
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
            <span className="font-mono text-amber-400 font-bold px-1.5 py-0.5 rounded bg-amber-950/60 border border-amber-900/60 select-none">
              {BRAILLE_DOTS[dotIndex]}
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
