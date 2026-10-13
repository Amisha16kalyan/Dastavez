import React from "react";
import { History, RotateCcw, ArrowLeft, Clock, User } from "lucide-react";

export default function VersionPreviewBanner({
  version,
  onRestore,
  onExitPreview,
  restoring = false,
}) {
  if (!version) return null;

  return (
    <div className="bg-amber-500 text-white px-4 py-2.5 shadow-md sticky top-[57px] z-10 flex flex-wrap items-center justify-between gap-3 border-b border-amber-600 animate-in slide-in-from-top-2 duration-150">
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 rounded-lg bg-black/15 flex items-center justify-center">
          <History className="w-4 h-4" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-bold text-sm bg-black/20 px-2 py-0.5 rounded text-xs">
              Viewing Version {version.versionNumber}
            </span>
            <span className="text-xs text-amber-100 font-medium">
              (Read-Only Preview)
            </span>
          </div>
          <div className="flex items-center space-x-3 text-xs text-amber-100 mt-0.5">
            <span className="flex items-center space-x-1">
              <User className="w-3 h-3" />
              <span>{version.createdByName}</span>
            </span>
            <span>•</span>
            <span className="flex items-center space-x-1">
              <Clock className="w-3 h-3" />
              <span>{new Date(version.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </span>
            {version.changeSummary && (
              <>
                <span>•</span>
                <span className="italic">"{version.changeSummary}"</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <button
          onClick={onExitPreview}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/15 hover:bg-white/25 active:bg-white/30 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Current</span>
        </button>

        <button
          onClick={() => onRestore(version)}
          disabled={restoring}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 active:bg-black transition-colors shadow-xs disabled:opacity-50"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${restoring ? "animate-spin" : ""}`} />
          <span>{restoring ? "Restoring..." : "Restore This Version"}</span>
        </button>
      </div>
    </div>
  );
}
