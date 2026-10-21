import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  Check,
  X,
  RefreshCw,
  Sliders,
  Scissors,
  Maximize2,
  FileText,
  Briefcase,
  SpellCheck,
  RotateCcw,
  Copy,
  AlertCircle,
  ArrowRight,
  Loader2,
  Smile,
  GraduationCap,
  Sparkle,
} from "lucide-react";
import { requestAiAssistance } from "../services/aiApi.js";

const OPERATIONS = [
  {
    id: "improve",
    label: "Improve Writing",
    desc: "Enhance clarity, vocabulary & flow",
    icon: Sparkles,
    color: "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/10",
  },
  {
    id: "grammar",
    label: "Fix Grammar",
    desc: "Correct spelling, syntax & punctuation",
    icon: SpellCheck,
    color: "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/10",
  },
  {
    id: "professional",
    label: "Make Professional",
    desc: "Format for business & formal docs",
    icon: Briefcase,
    color: "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-500/10",
  },
  {
    id: "concise",
    label: "Make Concise",
    desc: "Shorten and cut out unnecessary fluff",
    icon: Scissors,
    color: "text-violet-600 bg-violet-50 dark:text-violet-400 dark:bg-violet-500/10",
  },
  {
    id: "expand",
    label: "Expand",
    desc: "Add depth, context & nuance",
    icon: Maximize2,
    color: "text-indigo-600 bg-indigo-50 dark:text-indigo-400 dark:bg-indigo-500/10",
  },
  {
    id: "summarize",
    label: "Summarize",
    desc: "Distill into core key takeaways",
    icon: FileText,
    color: "text-teal-600 bg-teal-50 dark:text-teal-400 dark:bg-teal-500/10",
  },
  {
    id: "rewrite",
    label: "Rewrite",
    desc: "Rephrase with alternative phrasing",
    icon: RefreshCw,
    color: "text-rose-600 bg-rose-50 dark:text-rose-400 dark:bg-rose-500/10",
  },
];

const TONES = [
  { id: "professional", label: "Professional", icon: Briefcase },
  { id: "friendly", label: "Friendly", icon: Smile },
  { id: "formal", label: "Formal", icon: GraduationCap },
  { id: "simple", label: "Simple", icon: Sparkle },
];

export default function AiWritingAssistant({
  isOpen,
  onClose,
  selectedText,
  selectionRange,
  context,
  documentId,
  position, // { top, left } or null
  onAccept,
}) {
  const [activeView, setActiveView] = useState("menu"); // 'menu' | 'result'
  const [currentOp, setCurrentOp] = useState("improve");
  const [currentTone, setCurrentTone] = useState("professional");

  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState("");
  const [error, setError] = useState(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [copied, setCopied] = useState(false);

  const abortControllerRef = useRef(null);
  const popoverRef = useRef(null);

  // Reset or close cleanly
  useEffect(() => {
    if (!isOpen) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setActiveView("menu");
      setSuggestion("");
      setError(null);
      setLoading(false);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen) {
        handleCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setLoading(false);
    onClose();
  };

  const executeAiOperation = async (op, tone = currentTone) => {
    if (!selectedText || !selectedText.trim()) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setCurrentOp(op);
    if (tone) setCurrentTone(tone);
    setActiveView("result");
    setLoading(true);
    setError(null);
    setSuggestion("");

    try {
      const response = await requestAiAssistance({
        text: selectedText,
        operation: op,
        tone: op === "tone" ? tone : undefined,
        context,
        documentId,
        signal: abortControllerRef.current.signal,
      });

      setSuggestion(response.result);
      setIsDemoMode(Boolean(response.isDemo));
      setLoading(false);
    } catch (err) {
      if (err.name === "AbortError") {
        return; // user cancelled, do not display error
      }
      console.error("AI Assistant Error:", err);
      setError(err.message || "Failed to generate suggestions. Please check connection.");
      setLoading(false);
    }
  };

  const handleAcceptSuggestion = () => {
    if (!suggestion || !selectionRange) return;
    onAccept(suggestion, selectionRange);
    onClose();
  };

  const handleCopySuggestion = async () => {
    if (!suggestion) return;
    try {
      await navigator.clipboard.writeText(suggestion);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  if (!isOpen) return null;

  // Determine intelligent placement
  let style = {};
  if (position) {
    const menuWidth = activeView === "result" ? 440 : 320;
    const desiredHeight = activeView === "result" ? 480 : 420;
    const padding = 16;
    const gap = 8;
    let left = position.left;

    // Boundary clamping
    if (left + menuWidth > window.innerWidth - padding) {
      left = window.innerWidth - menuWidth - padding;
    }
    if (left < padding) {
      left = padding;
    }

    // Open on whichever side of the selection has more room, capped to the viewport
    const spaceBelow = window.innerHeight - position.bottom - gap - padding;
    const spaceAbove = position.top - gap - padding;

    style = { position: "fixed", left: `${left}px`, zIndex: 50 };
    if (spaceBelow >= desiredHeight || (spaceBelow >= spaceAbove && spaceBelow >= 240)) {
      style.top = `${position.bottom + gap}px`;
      style.maxHeight = `${spaceBelow}px`;
    } else if (spaceAbove >= 240) {
      style.bottom = `${window.innerHeight - position.top + gap}px`;
      style.maxHeight = `${spaceAbove}px`;
    } else {
      style.top = `${padding}px`;
      style.maxHeight = `${window.innerHeight - padding * 2}px`;
    }
  } else {
    // Default fallback center/floating position
    style = {
      position: "fixed",
      top: "120px",
      right: "32px",
      maxHeight: "calc(100vh - 136px)",
      zIndex: 50,
    };
  }

  const activeOpObj = OPERATIONS.find((o) => o.id === currentOp) || {
    label: currentOp === "tone" ? `Tone: ${currentTone}` : "AI Suggestion",
    icon: Sparkles,
  };
  const ActiveIcon = activeOpObj.icon;

  return (
    <div
      ref={popoverRef}
      style={style}
      className={`flex flex-col bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-xl shadow-2xl shadow-black/20 dark:shadow-black/50 border border-slate-200 dark:border-slate-700/80 overflow-hidden animate-in fade-in zoom-in-95 duration-150 ${
        activeView === "result" ? "w-[440px] max-w-[95vw]" : "w-[320px] max-w-[95vw]"
      }`}
    >
      {/* Header */}
      <div className="shrink-0 px-3 py-2.5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 text-white flex items-center justify-center shadow-sm">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <h3 className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
            <span>AI Assist</span>
            {isDemoMode && activeView === "result" && (
              <span className="text-[9px] font-semibold uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/30">
                Demo
              </span>
            )}
          </h3>
        </div>

        <button
          onClick={handleCancel}
          className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
          title="Close (Esc)"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* VIEW 1: OPERATIONS MENU */}
      {activeView === "menu" && (
        <div className="flex-1 min-h-0 p-2 space-y-1 overflow-y-auto">
          <div className="px-2 pt-1 pb-1.5 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Edit selection
          </div>

          {OPERATIONS.map((op) => {
            const Icon = op.icon;
            return (
              <button
                key={op.id}
                onClick={() => executeAiOperation(op.id)}
                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-2.5 group cursor-pointer"
              >
                <div
                  className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${op.color}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-slate-800 dark:text-slate-100">
                    {op.label}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{op.desc}</div>
                </div>
                <ArrowRight className="w-3 h-3 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 group-hover:text-indigo-500 transition-all shrink-0" />
              </button>
            );
          })}

          {/* Tone Adjustment Sub-menu */}
          <div className="pt-2 mt-1 border-t border-slate-200 dark:border-slate-800">
            <div className="px-2 pb-1.5 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <Sliders className="w-3 h-3" />
              Change tone
            </div>
            <div className="flex flex-wrap gap-1.5 px-2 pb-1">
              {TONES.map((t) => {
                const ToneIcon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => executeAiOperation("tone", t.id)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-purple-50 hover:border-purple-300 hover:text-purple-700 dark:hover:bg-purple-500/10 dark:hover:border-purple-500/40 dark:hover:text-purple-300 transition-colors cursor-pointer"
                  >
                    <ToneIcon className="w-3 h-3 shrink-0" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: RESULT & REVIEW */}
      {activeView === "result" && (
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3.5">
          {/* Operation Pill and Back action */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:border-indigo-500/30 capitalize">
                <ActiveIcon className="w-3 h-3" />
                <span>
                  {currentOp === "tone" ? `Tone: ${currentTone}` : activeOpObj.label}
                </span>
              </span>
            </div>

            <button
              onClick={() => setActiveView("menu")}
              className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 flex items-center gap-1 font-medium transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Other actions</span>
            </button>
          </div>

          {/* Original Text Snippet */}
          <div>
            <div className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
              Original
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 border-l-2 border-slate-300 dark:border-slate-600 rounded-r-lg px-3 py-2 max-h-24 overflow-y-auto leading-relaxed select-text">
              {selectedText}
            </div>
          </div>

          {/* AI Suggestion Body */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-[10px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                <span>Suggestion</span>
              </div>

              {suggestion && (
                <button
                  onClick={handleCopySuggestion}
                  className="text-[11px] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center gap-1 transition-colors cursor-pointer"
                  title="Copy suggestion to clipboard"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? "Copied" : "Copy"}</span>
                </button>
              )}
            </div>

            {loading ? (
              <div className="min-h-[110px] bg-indigo-50/40 dark:bg-indigo-500/5 border border-indigo-100 dark:border-indigo-500/20 rounded-lg p-4 flex flex-col items-center justify-center space-y-2">
                <div className="relative flex items-center justify-center">
                  <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
                  <Sparkles className="w-3 h-3 text-amber-500 absolute -top-1 -right-1" />
                </div>
                <p className="text-xs font-medium text-indigo-900 dark:text-indigo-200 animate-pulse">
                  Generating suggestion...
                </p>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="text-[11px] text-slate-500 hover:text-rose-600 underline cursor-pointer"
                >
                  Cancel request
                </button>
              </div>
            ) : error ? (
              <div className="min-h-[100px] bg-rose-50/80 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-lg p-3.5 flex flex-col justify-between">
                <div className="flex items-start space-x-2 text-rose-800 dark:text-rose-200 text-xs leading-relaxed">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block mb-0.5">Could not generate text</span>
                    <span className="text-rose-700 dark:text-rose-300 text-[11px]">{error}</span>
                  </div>
                </div>

                <div className="flex items-center justify-end space-x-2 mt-3 pt-2 border-t border-rose-100 dark:border-rose-500/20">
                  <button
                    onClick={() => setActiveView("menu")}
                    className="px-2.5 py-1 text-xs text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                  >
                    Back to menu
                  </button>
                  <button
                    onClick={() => executeAiOperation(currentOp, currentTone)}
                    className="px-3 py-1 text-xs font-semibold bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors shadow-2xs flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Try again</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-indigo-50/40 dark:bg-indigo-500/5 border border-indigo-200 dark:border-indigo-500/30 rounded-lg px-3 py-2.5 text-[13px] text-slate-800 dark:text-slate-100 leading-relaxed whitespace-pre-wrap select-text">
                {suggestion}
              </div>
            )}
          </div>

          {/* Action Buttons: Accept / Reject / Regenerate */}
          {!loading && !error && suggestion && (
            <div className="sticky -bottom-4 -mx-4 -mb-4 px-4 py-3 bg-white dark:bg-slate-900 flex items-center justify-between border-t border-slate-200 dark:border-slate-800 gap-2">
              <button
                onClick={() => executeAiOperation(currentOp, currentTone)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Regenerate this suggestion"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Regenerate</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Discard
                </button>

                <button
                  onClick={handleAcceptSuggestion}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Replace</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
