import React, { useState, useEffect } from "react";
import { X, GitCompare, ArrowRight, Plus, Minus, Loader2 } from "lucide-react";
import { API_BASE_URL } from "../services/apiConfig.js";

export default function VersionDiffModal({
  isOpen,
  onClose,
  documentId,
  versions = [],
  initialVersionA,
  initialVersionB,
}) {
  const [versionA, setVersionA] = useState(initialVersionA);
  const [versionB, setVersionB] = useState(initialVersionB);
  const [diffData, setDiffData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (initialVersionA) setVersionA(initialVersionA);
    if (initialVersionB) setVersionB(initialVersionB);
  }, [initialVersionA, initialVersionB]);

  useEffect(() => {
    if (!isOpen || !versionA || !versionB) return;

    async function fetchDiff() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/documents/${documentId}/versions/compare?from=${versionA}&to=${versionB}`
        );
        if (!res.ok) {
          throw new Error("Failed to load difference");
        }
        const data = await res.json();
        setDiffData(data);
      } catch (err) {
        console.error("Diff fetch error:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchDiff();
  }, [isOpen, documentId, versionA, versionB]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center">
              <GitCompare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Compare Versions</h2>
              <p className="text-xs text-slate-500">Visual side-by-side text difference between two checkpoints</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Version Selectors Bar */}
        <div className="px-6 py-3 bg-white border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-1.5 text-xs">
              <span className="font-medium text-slate-500">Base Version:</span>
              <select
                value={versionA}
                onChange={(e) => setVersionA(Number(e.target.value))}
                className="bg-slate-100 border border-slate-200 text-slate-800 rounded-lg px-2.5 py-1.5 font-medium focus:outline-none focus:border-purple-500"
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    V{v.versionNumber} ({v.createdByName} - {new Date(v.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                  </option>
                ))}
              </select>
            </div>

            <ArrowRight className="w-4 h-4 text-slate-400" />

            <div className="flex items-center space-x-1.5 text-xs">
              <span className="font-medium text-slate-500">Compare With:</span>
              <select
                value={versionB}
                onChange={(e) => setVersionB(Number(e.target.value))}
                className="bg-slate-100 border border-slate-200 text-slate-800 rounded-lg px-2.5 py-1.5 font-medium focus:outline-none focus:border-purple-500"
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    V{v.versionNumber} ({v.createdByName} - {new Date(v.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {diffData?.statistics && (
            <div className="flex items-center space-x-3 text-xs font-medium">
              <span className="flex items-center space-x-1 text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                <Plus className="w-3.5 h-3.5" />
                <span>{diffData.statistics.addedWords} words added</span>
              </span>
              <span className="flex items-center space-x-1 text-rose-600 bg-rose-50 px-2.5 py-1 rounded-full border border-rose-200">
                <Minus className="w-3.5 h-3.5" />
                <span>{diffData.statistics.removedWords} words removed</span>
              </span>
            </div>
          )}
        </div>

        {/* Diff Content Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/40">
          {loading && (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
              <p className="text-xs">Computing difference...</p>
            </div>
          )}

          {error && (
            <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs">
              {error}
            </div>
          )}

          {!loading && !error && diffData && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs leading-relaxed font-sans text-sm min-h-[300px] whitespace-pre-wrap">
              {diffData.diff && diffData.diff.length > 0 ? (
                diffData.diff.map((chunk, idx) => {
                  if (chunk.type === "added") {
                    return (
                      <span
                        key={idx}
                        className="bg-emerald-100 text-emerald-900 px-1 py-0.5 rounded-sm font-medium border-b-2 border-emerald-400"
                        title="Added in newer version"
                      >
                        {chunk.text}
                      </span>
                    );
                  } else if (chunk.type === "removed") {
                    return (
                      <span
                        key={idx}
                        className="bg-rose-100 text-rose-800 line-through px-1 py-0.5 rounded-sm opacity-80"
                        title="Removed"
                      >
                        {chunk.text}
                      </span>
                    );
                  }
                  return <span key={idx}>{chunk.text}</span>;
                })
              ) : (
                <div className="text-center text-slate-400 py-12">
                  No text differences found between these two versions.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-white border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
          >
            Close Diff
          </button>
        </div>
      </div>
    </div>
  );
}
