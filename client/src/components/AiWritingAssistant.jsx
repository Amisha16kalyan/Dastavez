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
    color: "text-amber-600 bg-amber-50",
  },
  {
    id: "grammar",
    label: "Fix Grammar",
    desc: "Correct spelling, syntax & punctuation",
    icon: SpellCheck,
    color: "text-emerald-600 bg-emerald-50",
  },
  {
    id: "professional",
    label: "Make Professional",
    desc: "Format for business & formal docs",
    icon: Briefcase,
    color: "text-blue-600 bg-blue-50",
  },
  {
    id: "concise",
    label: "Make Concise",
    desc: "Shorten and cut out unnecessary fluff",
    icon: Scissors,
    color: "text-violet-600 bg-violet-50",
  },
  {
    id: "expand",
    label: "Expand",
    desc: "Add depth, context & nuance",
    icon: Maximize2,
    color: "text-indigo-600 bg-indigo-50",
  },
  {
    id: "summarize",
    label: "Summarize",
    desc: "Distill into core key takeaways",
    icon: FileText,
    color: "text-teal-600 bg-teal-50",
  },
  {
    id: "rewrite",
    label: "Rewrite",
    desc: "Rephrase with alternative phrasing",
    icon: RefreshCw,
    color: "text-rose-600 bg-rose-50",
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
  const [showToneSelector, setShowToneSelector] = useState(false);

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
      setShowToneSelector(false);
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
    const padding = 16;
    let left = position.left;
    let top = position.bottom + 8;

    // Boundary clamping
    if (left + menuWidth > window.innerWidth - padding) {
      left = window.innerWidth - menuWidth - padding;
    }
    if (left < padding) {
      left = padding;
    }

    // Flip to top if close to bottom of screen
    if (top + 380 > window.innerHeight) {
      top = Math.max(padding, position.top - 400);
    }

    style = {
      position: "fixed",
      top: `${top}px`,
      left: `${left}px`,
      zIndex: 50,
    };
  } else {
    // Default fallback center/floating position
    style = {
      position: "fixed",
      top: "120px",
      right: "32px",
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
      className={`bg-white rounded-2xl shadow-2xl border border-slate-200/90 overflow-hidden animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md transition-all ${
        activeView === "result" ? "w-[440px] max-w-[95vw]" : "w-[320px]"
      }`}
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white px-4 py-3 flex items-center justify-between border-b border-indigo-900/40">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-400/30">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="text-xs font-semibold tracking-wide text-slate-100 flex items-center gap-1.5">
              <span>AI Writing Assistant</span>
              {isDemoMode && activeView === "result" && (
                <span className="text-[9px] font-normal uppercase tracking-wider bg-indigo-500/30 text-indigo-200 px-1.5 py-0.2 rounded border border-indigo-400/30">
                  Demo
                </span>
              )}
            </h3>
          </div>
        </div>

        <button
          onClick={handleCancel}
          className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          title="Close (Esc)"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* VIEW 1: OPERATIONS MENU */}
      {activeView === "menu" && (
        <div className="p-2 space-y-1 max-h-[420px] overflow-y-auto">
          <div className="px-2 py-1 text-[11px] font-medium text-slate-400 uppercase tracking-wider">
            Choose transformation
          </div>

          {OPERATIONS.map((op) => {
            const Icon = op.icon;
            return (
              <button
                key={op.id}
                onClick={() => executeAiOperation(op.id)}
                className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-slate-50 transition-colors flex items-center space-x-3 group cursor-pointer"
              >
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${op.color}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors">
                    {op.label}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">{op.desc}</div>
                </div>
                <ArrowRight className="w-3 h-3 text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all shrink-0" />
              </button>
            );
          })}

          {/* Tone Adjustment Sub-menu */}
          <div className="pt-1 mt-1 border-t border-slate-100">
            <button
              onClick={() => setShowToneSelector(!showToneSelector)}
              className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-slate-50 transition-colors flex items-center justify-between group cursor-pointer"
            >
              <div className="flex items-center space-x-3">
                <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                  <Sliders className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-800 group-hover:text-purple-600 transition-colors">
                    Change Tone
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Currently: <span className="capitalize font-medium text-slate-600">{currentTone}</span>
                  </div>
                </div>
              </div>
              <span className="text-[10px] text-slate-400 font-semibold px-2 py-0.5 bg-slate-100 rounded-md">
                {showToneSelector ? "Hide" : "Select"}
              </span>
            </button>

            {showToneSelector && (
              <div className="grid grid-cols-2 gap-1.5 p-2 bg-slate-50/80 rounded-xl mt-1 border border-slate-100">
                {TONES.map((t) => {
                  const ToneIcon = t.icon;
                  const isSelected = currentTone === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => executeAiOperation("tone", t.id)}
                      className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all text-left cursor-pointer ${
                        isSelected
                          ? "bg-purple-600 text-white shadow-xs"
                          : "bg-white text-slate-700 hover:bg-purple-50 hover:text-purple-700 border border-slate-200/60"
                      }`}
                    >
                      <ToneIcon className="w-3 h-3 shrink-0" />
                      <span className="truncate">{t.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 2: RESULT & REVIEW */}
      {activeView === "result" && (
        <div className="p-4 space-y-3.5">
          {/* Operation Pill and Back action */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center space-x-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                <ActiveIcon className="w-3 h-3" />
                <span>
                  {currentOp === "tone" ? `Tone: ${currentTone}` : activeOpObj.label}
                </span>
              </span>
            </div>

            <button
              onClick={() => setActiveView("menu")}
              className="text-[11px] text-slate-500 hover:text-indigo-600 flex items-center gap-1 font-medium transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Other actions</span>
            </button>
          </div>

          {/* Original Text Snippet */}
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Original:
            </div>
            <div className="text-xs text-slate-600 bg-slate-50/80 border border-slate-200/70 rounded-xl p-2.5 max-h-24 overflow-y-auto leading-relaxed select-text italic">
              "{selectedText}"
            </div>
          </div>

          {/* AI Suggestion Body */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <span>AI Suggestion:</span>
              </div>

              {suggestion && (
                <button
                  onClick={handleCopySuggestion}
                  className="text-[11px] text-slate-400 hover:text-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
                  title="Copy suggestion to clipboard"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? "Copied" : "Copy"}</span>
                </button>
              )}
            </div>

            {loading ? (
              <div className="min-h-[110px] bg-indigo-50/30 border border-indigo-100 rounded-xl p-4 flex flex-col items-center justify-center space-y-2">
                <div className="relative flex items-center justify-center">
                  <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
                  <Sparkles className="w-3 h-3 text-amber-500 absolute -top-1 -right-1" />
                </div>
                <p className="text-xs font-medium text-indigo-950 animate-pulse">
                  AI is crafting improvement...
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
              <div className="min-h-[100px] bg-rose-50/80 border border-rose-200 rounded-xl p-3.5 flex flex-col justify-between">
                <div className="flex items-start space-x-2 text-rose-800 text-xs leading-relaxed">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block mb-0.5">Could not generate text</span>
                    <span className="text-rose-700 text-[11px]">{error}</span>
                  </div>
                </div>

                <div className="flex items-center justify-end space-x-2 mt-3 pt-2 border-t border-rose-100">
                  <button
                    onClick={() => setActiveView("menu")}
                    className="px-2.5 py-1 text-xs text-rose-700 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer"
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
              <div className="bg-emerald-50/20 border border-emerald-500/20 rounded-xl p-3 text-xs text-slate-800 leading-relaxed max-h-48 overflow-y-auto font-normal shadow-2xs select-text">
                {suggestion}
              </div>
            )}
          </div>

          {/* Action Buttons: Accept / Reject / Regenerate */}
          {!loading && !error && suggestion && (
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 gap-2">
              <button
                onClick={() => executeAiOperation(currentOp, currentTone)}
                className="px-3 py-2 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-100 active:bg-slate-200 transition-colors flex items-center gap-1.5 border border-slate-200/80 cursor-pointer"
                title="Regenerate this suggestion"
              >
                <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                <span>Regenerate</span>
              </button>

              <div className="flex items-center space-x-2">
                <button
                  onClick={onClose}
                  className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Reject
                </button>

                <button
                  onClick={handleAcceptSuggestion}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-md shadow-blue-600/20 flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Accept</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
