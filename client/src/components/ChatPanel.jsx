import React, { useState, useEffect, useRef } from "react";
import {
  askDocumentQuestion,
  getIndexStatus,
  getChatHistory,
  clearChatHistoryApi,
  indexDocument,
} from "../services/chatApi";

const SUGGESTED_QUESTIONS = [
  "What is this document about?",
  "Summarize the main points",
  "What database or tech stack is mentioned?",
  "What are the key decisions or architecture choices?",
  "What potential problems are highlighted?",
];

export default function ChatPanel({
  documentId,
  isOpen,
  onClose,
  editorView = null,
}) {
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [indexing, setIndexing] = useState(false);
  const [indexStats, setIndexStats] = useState({ chunkCount: 0, lastIndexed: null });

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const conversationId = useRef(`chat-${documentId || "default"}`).current;

  // Auto-scroll to bottom of chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages, loading]);

  // Load chat history & index status on mount / document change
  useEffect(() => {
    if (!documentId) return;

    let isMounted = true;

    async function loadData() {
      try {
        const [history, stats] = await Promise.all([
          getChatHistory(documentId, conversationId),
          getIndexStatus(documentId),
        ]);
        if (isMounted) {
          if (history && history.length > 0) {
            setMessages(history);
          }
          if (stats) {
            setIndexStats(stats);
          }
        }
      } catch (err) {
        console.warn("Failed to load chat history/status:", err);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [documentId, conversationId]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  // Handle re-index trigger
  const handleReindex = async () => {
    setIndexing(true);
    setError(null);
    try {
      const res = await indexDocument(documentId);
      setIndexStats({ chunkCount: res.chunkCount || res.total || 0, lastIndexed: new Date().toISOString() });
    } catch (err) {
      setError("Failed to re-index document: " + err.message);
    } finally {
      setIndexing(false);
    }
  };

  // Handle submit question
  const handleSubmit = async (e, customQ = null) => {
    if (e) e.preventDefault();
    const q = (customQ || question).trim();
    if (!q || loading) return;

    const userMsg = { role: "user", content: q, createdAt: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    if (!customQ) setQuestion("");
    setLoading(true);
    setError(null);

    try {
      const res = await askDocumentQuestion({
        documentId,
        question: q,
        conversationId,
      });

      const aiMsg = {
        role: "assistant",
        content: res.answer,
        sources: res.sources || [],
        isDemo: res.isDemo,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      setError(err.message || "Failed to get an answer. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Clear chat history
  const handleClearHistory = async () => {
    try {
      await clearChatHistoryApi(documentId, conversationId);
      setMessages([]);
      setError(null);
    } catch (err) {
      setError("Failed to clear chat history.");
    }
  };

  // Jump to section in ProseMirror editor if source is clicked
  const handleSourceClick = (source) => {
    if (!editorView || !source.text) return;

    try {
      const state = editorView.state;
      const doc = state.doc;
      const searchText = source.text.slice(0, 40).trim();

      let foundPos = -1;
      doc.descendants((node, pos) => {
        if (foundPos !== -1) return false;
        if (node.isText && node.text.includes(searchText)) {
          foundPos = pos + node.text.indexOf(searchText);
          return false;
        }
      });

      if (foundPos !== -1) {
        editorView.focus();
        editorView.dispatch(
          state.tr.setSelection(
            state.selection.constructor.near(state.doc.resolve(foundPos))
          ).scrollIntoView()
        );
      }
    } catch (err) {
      console.warn("Could not scroll to source in editor:", err);
    }
  };

  if (!isOpen) return null;

  return (
    <aside className="chat-panel flex flex-col h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl transition-all duration-300 z-30 w-80 lg:w-96 flex-shrink-0 text-slate-800 dark:text-slate-100 font-sans">
      {/* ── Panel Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800/80 select-none">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-white shadow-md">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-sm leading-tight text-slate-900 dark:text-white flex items-center gap-1.5">
              Document AI
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border border-indigo-500/20 dark:border-indigo-500/30 font-mono font-medium">
                RAG
              </span>
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {indexStats.chunkCount > 0
                ? `${indexStats.chunkCount} document chunk${indexStats.chunkCount > 1 ? "s" : ""} indexed`
                : "Not indexed yet"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleReindex}
            disabled={indexing}
            title="Re-index current document text"
            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-md transition-colors text-xs flex items-center gap-1 cursor-pointer"
          >
            <svg className={`w-3.5 h-3.5 ${indexing ? "animate-spin text-indigo-500" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          {messages.length > 0 && (
            <button
              onClick={handleClearHistory}
              title="Clear Chat History"
              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
          <button
            onClick={onClose}
            title="Close Panel"
            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Messages Container ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3.5 scrollbar-thin">
        {messages.length === 0 && !loading && (
          <div className="py-6 text-center text-slate-500 dark:text-slate-400">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-slate-800 border border-indigo-100 dark:border-slate-700/80 flex items-center justify-center mx-auto mb-3 text-indigo-600 dark:text-indigo-400 shadow-sm">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">Ask questions about this document</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-4 px-2">
              The AI retrieves specific relevant sections to answer your questions with citations.
            </p>

            <div className="text-left space-y-1.5">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-bold mb-2 px-1">
                Suggested Questions
              </p>
              {SUGGESTED_QUESTIONS.map((sq, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSubmit(null, sq)}
                  className="w-full text-left text-xs bg-slate-50 hover:bg-indigo-50/70 dark:bg-slate-800/80 dark:hover:bg-indigo-950/60 text-slate-700 dark:text-slate-300 hover:text-indigo-700 dark:hover:text-indigo-200 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700/70 hover:border-indigo-300 dark:hover:border-indigo-500/40 transition-all duration-150 group cursor-pointer shadow-2xs"
                >
                  <span className="text-indigo-500 mr-1.5 font-bold group-hover:translate-x-0.5 inline-block transition-transform">
                    →
                  </span>
                  {sq}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex flex-col ${
              msg.role === "user" ? "items-end" : "items-start"
            }`}
          >
            <div
              className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-xs ${
                msg.role === "user"
                  ? "bg-indigo-600 text-white rounded-br-xs"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700/80 rounded-bl-xs"
              }`}
            >
              <div className="whitespace-pre-wrap font-sans">{msg.content}</div>

              {/* Source Citations */}
              {msg.role === "assistant" && msg.sources && msg.sources.length > 0 && (
                <div className="mt-2.5 pt-2 border-t border-slate-200/80 dark:border-slate-700/60">
                  <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Sources ({msg.sources.length}):
                  </p>
                  <div className="space-y-1.5">
                    {msg.sources.map((src, sIdx) => (
                      <button
                        key={sIdx}
                        onClick={() => handleSourceClick(src)}
                        title="Click to locate in document"
                        className="w-full text-left bg-white dark:bg-slate-850 hover:bg-indigo-50/80 dark:hover:bg-indigo-900/40 p-2 rounded-lg border border-slate-200 dark:border-slate-700/50 hover:border-indigo-400 dark:hover:border-indigo-500/40 transition-colors text-[11px] block shadow-2xs cursor-pointer"
                      >
                        <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                          <span className="truncate">📄 {src.section || `Chunk ${src.chunkIndex + 1}`}</span>
                          <span className="text-[9px] text-slate-400 dark:text-slate-500 font-mono font-medium">
                            {Math.round((src.score || 0) * 100)}% match
                          </span>
                        </div>
                        {src.text && (
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5 italic">
                            "{src.text}"
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {msg.isDemo && msg.role === "assistant" && (
                <div className="mt-1 text-[9px] text-amber-500 font-mono">
                  ⚡ Demo mode (set LLM_API_KEY for live answers)
                </div>
              )}
            </div>

            <span className="text-[9px] text-slate-400 dark:text-slate-500 mt-1 px-1 font-medium">
              {msg.role === "user" ? "You" : "AI"} •{" "}
              {msg.createdAt
                ? new Date(msg.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : ""}
            </span>
          </div>
        ))}

        {/* Loading Spinner */}
        {loading && (
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700/80 rounded-2xl rounded-bl-xs px-3.5 py-2.5 text-xs w-max">
            <div className="flex gap-1 items-center">
              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce"></span>
              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.2s]"></span>
              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.4s]"></span>
            </div>
            <span className="text-slate-500 dark:text-slate-400 text-[11px] font-medium">Retrieving context & analyzing...</span>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2">
            <svg className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1 font-medium">{error}</div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input Form ────────────────────────────────────────────────── */}
      <form onSubmit={handleSubmit} className="p-3 bg-slate-50 dark:bg-slate-850 border-t border-slate-200 dark:border-slate-800/80">
        <div className="relative flex items-center">
          <input
            ref={inputRef}
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about this document..."
            disabled={loading}
            className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700/80 focus:border-indigo-500 dark:focus:border-indigo-500 rounded-xl pl-3 pr-10 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-none transition-colors disabled:opacity-50 shadow-2xs"
          />
          <button
            type="submit"
            disabled={!question.trim() || loading}
            className="absolute right-1.5 p-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:text-slate-400 dark:disabled:text-slate-500 text-white rounded-lg transition-colors flex items-center justify-center shadow-xs cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </div>

        <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 px-1 font-medium">
          <span>RAG-powered analysis</span>
          <span>Shift + Enter for new line</span>
        </div>
      </form>
    </aside>
  );
}
