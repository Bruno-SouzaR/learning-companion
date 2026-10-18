'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Send,
  Loader2,
  Sparkles,
  BookOpen,
  RotateCcw,
  Bot,
  User,
  History,
  MessageSquare,
  HelpCircle,
} from 'lucide-react';
import { MarkdownView } from './markdown-view';

export interface TutorMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at?: string;
}

interface TutorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  entryId?: string | null;
  documentTitle?: string | null;
  documentTopic?: string | null;
  onNavigateToRecords?: () => void;
}

export function TutorDrawer({
  isOpen,
  onClose,
  entryId,
  documentTitle,
  documentTopic,
  onNavigateToRecords,
}: TutorDrawerProps) {
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [showHistoryView, setShowHistoryView] = useState(false);
  const [sessionList, setSessionList] = useState<
    Array<{ id: string; title: string; topic: string; total_turns: number; created_at: string }>
  >([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom of conversation
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent]);

  // Load session & history whenever drawer opens or entryId changes
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsLoadingHistory(true);
    setStreamingContent('');

    const fetchHistory = async () => {
      try {
        const url = entryId
          ? `/api/study/tutor/history?entryId=${encodeURIComponent(entryId)}`
          : '/api/study/tutor/history';

        const res = await fetch(url);
        const json = await res.json();

        if (isMounted && json.success && json.data) {
          setSessionId(json.data.session.id);
          const turns = (json.data.turns || []).map((t: any) => ({
            id: t.id,
            role: t.role,
            content: t.content,
            created_at: t.created_at,
          }));
          setMessages(turns);
        }
      } catch (err) {
        console.error('Falha ao carregar histórico do tutor:', err);
      } finally {
        if (isMounted) {
          setIsLoadingHistory(false);
          // Focus input on open
          setTimeout(() => textareaRef.current?.focus(), 150);
        }
      }
    };

    fetchHistory();

    return () => {
      isMounted = false;
    };
  }, [isOpen, entryId]);

  // Fetch session list for history browser
  const handleOpenHistoryList = async () => {
    setShowHistoryView(true);
    try {
      const res = await fetch('/api/study/tutor/history?list=true');
      const json = await res.json();
      if (json.success && json.data?.sessions) {
        setSessionList(json.data.sessions);
      }
    } catch (e) {
      console.error('Falha ao listar sessões:', e);
    }
  };

  // Select a past session from the history list
  const handleSelectPastSession = async (pastSessionId: string) => {
    setShowHistoryView(false);
    setIsLoadingHistory(true);
    try {
      const res = await fetch(
        `/api/study/tutor/history?sessionId=${encodeURIComponent(pastSessionId)}`
      );
      const json = await res.json();
      if (json.success && json.data) {
        setSessionId(json.data.session.id);
        const turns = (json.data.turns || []).map((t: any) => ({
          id: t.id,
          role: t.role,
          content: t.content,
          created_at: t.created_at,
        }));
        setMessages(turns);
      }
    } catch (err) {
      console.error('Falha ao abrir sessão passada:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Send message and stream response
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isStreaming) return;

    setInputMessage('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Add user message to UI immediately
    const tempUserMsg: TutorMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    setIsStreaming(true);
    setStreamingContent('');

    try {
      const res = await fetch('/api/study/tutor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionId || undefined,
          entryId: entryId || undefined,
          title: documentTitle || undefined,
          topic: documentTopic || undefined,
          message: text,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Erro na conexão com o tutor (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;
      let accumulated = '';

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunkStr = decoder.decode(value, { stream: true });
          const lines = chunkStr.split('\n');

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            const dataStr = trimmed.slice(6);

            try {
              const eventData = JSON.parse(dataStr);
              if (eventData.type === 'init' && eventData.sessionId) {
                setSessionId(eventData.sessionId);
              } else if (eventData.type === 'chunk' && eventData.content) {
                accumulated += eventData.content;
                setStreamingContent((prev) => prev + eventData.content);
              } else if (eventData.type === 'done') {
                const finalContent = eventData.totalText || accumulated;
                const assistantMsg: TutorMessage = {
                  id: eventData.assistantTurnId || `ast_${Date.now()}`,
                  role: 'assistant',
                  content: finalContent,
                  created_at: new Date().toISOString(),
                };
                setMessages((prev) => [...prev, assistantMsg]);
                setStreamingContent('');
              } else if (eventData.type === 'error') {
                console.error('[Tutor Stream Error]:', eventData.error);
              }
            } catch {
              // Ignore partial JSON chunks
            }
          }
        }
      }
    } catch (err: unknown) {
      console.error('Falha no streaming do tutor:', err);
      const errorMsg: TutorMessage = {
        id: `err_${Date.now()}`,
        role: 'assistant',
        content:
          'Desculpe, ocorreu uma oscilação na conexão com a IA local. Por favor, tente perguntar novamente.',
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsStreaming(false);
      setStreamingContent('');
    }
  };

  // Auto-resize textarea
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputMessage(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const starterPrompts = [
    'Pode me explicar o conceito central em palavras simples?',
    'Como funciona esse mecanismo passo a passo na prática?',
    'Quais são os principais trade-offs e limitações abordados?',
  ];

  return (
    <aside
      role="region"
      aria-label="Tutor de Estudos"
      className={`fixed sm:sticky top-14 sm:top-16 right-0 bottom-0 sm:bottom-auto h-[calc(100vh-3.5rem)] sm:h-[calc(100vh-4rem)] border-l border-slate-800/80 bg-slate-950 shadow-2xl sm:shadow-none flex flex-col shrink-0 z-20 transition-all duration-300 ease-in-out ${
        isOpen
          ? 'w-full sm:w-[440px] lg:w-[480px] xl:w-[520px] 2xl:w-[560px] opacity-100 translate-x-0'
          : 'w-0 overflow-hidden border-none opacity-0 pointer-events-none translate-x-full sm:translate-x-0'
      }`}
    >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800/80 bg-slate-950/90 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-100 tracking-tight">Tutor Pedagógico</h3>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-indigo-950 text-indigo-300 border border-indigo-800/50">
                  Gemma 4 E4B
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate max-w-[260px] sm:max-w-[300px]">
                {documentTitle ? `Material: ${documentTitle}` : 'Dúvidas e aprofundamento conceitual'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleOpenHistoryList}
              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-slate-800/60 transition-colors cursor-pointer"
              title="Ver histórico de conversas anteriores"
              aria-label="Histórico de conversas"
            >
              <History className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 transition-colors cursor-pointer"
              title="Fechar gaveta"
              aria-label="Fechar gaveta"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {showHistoryView ? (
            /* History Browser Modal within Drawer */
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
                  Conversas Anteriores
                </span>
                <button
                  type="button"
                  onClick={() => setShowHistoryView(false)}
                  className="text-xs text-indigo-400 hover:underline cursor-pointer"
                >
                  Voltar ao Chat
                </button>
              </div>

              {sessionList.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">
                  Nenhuma conversa anterior registrada.
                </p>
              ) : (
                <div className="space-y-2">
                  {sessionList.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => handleSelectPastSession(s.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                        sessionId === s.id
                          ? 'bg-indigo-950/40 border-indigo-700/60 text-slate-100'
                          : 'bg-slate-900/60 border-slate-800/80 text-slate-300 hover:bg-slate-850 hover:border-slate-700'
                      }`}
                    >
                      <h4 className="text-xs font-bold text-slate-200 truncate">{s.title}</h4>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                        <span>{s.topic}</span>
                        <span>&bull;</span>
                        <span>{s.total_turns} turnos</span>
                        <span>&bull;</span>
                        <span>{new Date(s.created_at).toLocaleDateString('pt-BR')}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : isLoadingHistory ? (
            /* Loading State */
            <div className="h-full flex flex-col items-center justify-center text-center py-12 space-y-3">
              <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
              <p className="text-xs text-slate-400">Carregando diálogo com o tutor...</p>
            </div>
          ) : messages.length === 0 && !isStreaming ? (
            /* Context-Aware Empty State */
            !entryId && !documentTitle ? (
              /* No document open: Guide user clearly to open one */
              <div className="py-12 px-4 text-center space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-indigo-600/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mx-auto shadow-sm">
                  <BookOpen className="w-7 h-7" />
                </div>
                <div className="space-y-2 max-w-sm mx-auto">
                  <h4 className="text-sm font-bold text-slate-100">
                    Nenhum material de estudo selecionado
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Para que o Tutor possa responder com precisão máxima e sem alucinações, abra um resumo no Caderno ou inicie uma leitura na aba Estudos.
                  </p>
                </div>

                {onNavigateToRecords && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onNavigateToRecords();
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
                    >
                      <BookOpen className="w-4 h-4" />
                      <span>Escolher Resumo no Caderno</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Document is active: Ready to answer doubts */
              <div className="py-8 px-2 text-center space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mx-auto shadow-sm">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div className="space-y-1.5 max-w-sm mx-auto">
                  <h4 className="text-sm font-bold text-slate-100">
                    Pronto para sanar todas as suas dúvidas!
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Pergunte qualquer detalhe sobre teoremas, restrições, comandos ou formulações. O
                    tutor responde com base estrita no material de estudo.
                  </p>
                </div>

                {/* Starter Prompt Chips */}
                <div className="pt-3 space-y-2 text-left">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-1">
                    Sugestões de Perguntas:
                  </span>
                  <div className="space-y-1.5">
                    {starterPrompts.map((prompt, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSendMessage(prompt)}
                        className="w-full text-left p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300 hover:text-indigo-200 hover:bg-indigo-950/30 hover:border-indigo-800/40 transition-all cursor-pointer flex items-center justify-between group"
                      >
                        <span>{prompt}</span>
                        <Sparkles className="w-3 h-3 text-indigo-400 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )
          ) : (
            /* Chat Transcript */
            <>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-6 h-6 rounded-md bg-indigo-950 border border-indigo-800 flex items-center justify-center text-indigo-400 shrink-0 mt-0.5">
                      <Bot className="w-3.5 h-3.5" />
                    </div>
                  )}

                  <div
                    className={`rounded-2xl text-xs sm:text-[13px] leading-relaxed transition-all ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white p-3 rounded-tr-xs max-w-[85%] shadow-sm'
                        : 'bg-slate-900/90 border border-slate-800 text-slate-200 p-4 rounded-tl-xs max-w-[92%] space-y-2'
                    }`}
                  >
                    {msg.role === 'assistant' ? (
                      <MarkdownView content={msg.content} />
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>

                  {msg.role === 'user' && (
                    <div className="w-6 h-6 rounded-md bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0 mt-0.5">
                      <User className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>
              ))}

              {/* Live Streaming Turn */}
              {isStreaming && (
                <div className="flex gap-2.5 justify-start">
                  <div className="w-6 h-6 rounded-md bg-indigo-950 border border-indigo-800 flex items-center justify-center text-indigo-400 shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5" />
                  </div>

                  <div className="bg-slate-900/90 border border-indigo-900/60 text-slate-200 p-4 rounded-2xl rounded-tl-xs max-w-[92%] space-y-2 shadow-sm">
                    {streamingContent ? (
                      <div>
                        <MarkdownView content={streamingContent} />
                        <span className="inline-block w-1.5 h-3.5 bg-indigo-400 animate-pulse ml-0.5 align-middle" />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 py-1 text-slate-400 text-xs">
                        <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                        <span>Consultando material e estruturando resposta...</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Footer / Input Area */}
        <div className="p-3 sm:p-4 border-t border-slate-800/80 bg-slate-950 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-end gap-2 bg-slate-900/90 border border-slate-800 rounded-xl p-2 focus-within:border-indigo-500/80 focus-within:ring-1 focus-within:ring-indigo-500/40 transition-all"
          >
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputMessage}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              disabled={isStreaming}
              placeholder="Tire qualquer dúvida sobre o material... (Enter para enviar)"
              className="flex-1 bg-transparent text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 resize-none outline-none max-h-36 py-1 px-1.5 leading-relaxed"
            />

            <button
              type="submit"
              disabled={!inputMessage.trim() || isStreaming}
              className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 disabled:hover:bg-indigo-600 transition-colors cursor-pointer shrink-0 shadow-xs"
              title="Enviar pergunta (Enter)"
              aria-label="Enviar pergunta"
            >
              {isStreaming ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </form>
          <div className="flex items-center justify-between mt-2 px-1 text-[11px] text-slate-500">
            <span>Shift + Enter para quebra de linha</span>
            {sessionId && (
              <span className="font-mono text-[10px] text-slate-600">ID: {sessionId.slice(0, 14)}...</span>
            )}
          </div>
        </div>
    </aside>
  );
}
