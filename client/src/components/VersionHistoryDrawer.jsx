import React, { useState } from "react";
import {
  X,
  History,
  Plus,
  Eye,
  GitCompare,
  RotateCcw,
  Clock,
  User,
  Sparkles,
  Loader2,
  CheckCircle2,
} from "lucide-react";

export default function VersionHistoryDrawer({
  isOpen,
  onClose,
  versions = [],
  loading = false,
  onViewVersion,
  onCompareVersions,
  onRestoreVersion,
  onCreateCheckpoint,
  activePreviewVersion = null,
}) {
  const [showNewCheckpointDialog, setShowNewCheckpointDialog] = useState(false);
  const [checkpointDesc, setCheckpointDesc] = useState("");
  const [submittingCheckpoint, setSubmittingCheckpoint] = useState(false);

  // Compare selection state (picking 2 versions)
  const [selectedForCompare, setSelectedForCompare] = useState([]);

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setSubmittingCheckpoint(true);
    try {
      await onCreateCheckpoint(checkpointDesc.trim());
      setCheckpointDesc("");
      setShowNewCheckpointDialog(false);
    } finally {
      setSubmittingCheckpoint(false);
    }
  };

  const toggleCompareSelection = (versionId) => {
    if (selectedForCompare.includes(versionId)) {
      setSelectedForCompare(selectedForCompare.filter((id) => id !== versionId));
    } else {
      if (selectedForCompare.length >= 2) {
        // Keep the second one and add the new one
        setSelectedForCompare([selectedForCompare[1], versionId]);
      } else {
        setSelectedForCompare([...selectedForCompare, versionId]);
      }
    }
  };

  const handleLaunchCompare = () => {
    if (selectedForCompare.length === 2) {
      onCompareVersions(selectedForCompare[0], selectedForCompare[1]);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-sm sm:max-w-md bg-white shadow-2xl border-l border-slate-200 flex flex-col animate-in slide-in-from-right duration-200">
      {/* Top Header */}
      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
            <History className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">Version History</h2>
            <p className="text-[11px] text-slate-500">Track changes, checkpoints & restore</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors"
          title="Close panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Action Bar */}
      <div className="p-3 bg-white border-b border-slate-100 flex items-center justify-between gap-2">
        <button
          onClick={() => setShowNewCheckpointDialog(true)}
          className="flex-1 flex items-center justify-center space-x-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white py-1.5 px-3 rounded-lg text-xs font-semibold shadow-xs transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Save Checkpoint</span>
        </button>

        {selectedForCompare.length === 2 && (
          <button
            onClick={handleLaunchCompare}
            className="flex items-center space-x-1.5 bg-purple-600 hover:bg-purple-700 text-white py-1.5 px-3 rounded-lg text-xs font-semibold shadow-xs animate-in zoom-in-95 duration-100 transition-colors"
          >
            <GitCompare className="w-3.5 h-3.5" />
            <span>Compare (2)</span>
          </button>
        )}
      </div>

      {/* New Checkpoint Quick Modal */}
      {showNewCheckpointDialog && (
        <form onSubmit={handleCreateSubmit} className="p-4 bg-blue-50/60 border-b border-blue-100 space-y-2.5 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-900 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              Name This Checkpoint:
            </span>
            <button
              type="button"
              onClick={() => setShowNewCheckpointDialog(false)}
              className="text-slate-400 hover:text-slate-600 text-xs"
            >
              Cancel
            </button>
          </div>

          <input
            type="text"
            value={checkpointDesc}
            onChange={(e) => setCheckpointDesc(e.target.value)}
            placeholder="e.g. Added Redis caching section..."
            className="w-full px-3 py-1.5 bg-white border border-blue-200 rounded-lg text-xs focus:outline-none focus:border-blue-500"
            autoFocus
          />

          <div className="flex justify-end space-x-2">
            <button
              type="submit"
              disabled={submittingCheckpoint}
              className="px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {submittingCheckpoint ? "Saving..." : "Save Now"}
            </button>
          </div>
        </form>
      )}

      {/* Versions List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Current Working Version Card */}
        <div className={`p-3.5 rounded-xl border transition-all ${
          !activePreviewVersion
            ? "bg-blue-50/40 border-blue-200 ring-1 ring-blue-300"
            : "bg-slate-50 border-slate-200"
        }`}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center space-x-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold text-slate-800">Current Version (Live)</span>
            </div>
            {!activePreviewVersion && (
              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full">
                Active
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500">Live collaborative document currently being edited</p>
        </div>

        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-1 pt-2">
          Saved Checkpoints ({versions.length})
        </div>

        {loading && versions.length === 0 && (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 space-y-2">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            <span className="text-xs">Loading history...</span>
          </div>
        )}

        {!loading && versions.length === 0 && (
          <div className="text-center py-12 px-4 text-slate-400">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-xs font-medium">No saved versions yet.</p>
            <p className="text-[11px] mt-1">Click "Save Checkpoint" above or edit for auto-save.</p>
          </div>
        )}

        {versions.map((ver, idx) => {
          const isViewing = activePreviewVersion?.id === ver.id;
          const isSelectedForCompare = selectedForCompare.includes(ver.id);

          return (
            <div
              key={ver.id}
              className={`p-3.5 rounded-xl border transition-all ${
                isViewing
                  ? "bg-amber-50/60 border-amber-300 ring-2 ring-amber-400/50"
                  : isSelectedForCompare
                  ? "bg-purple-50/40 border-purple-300 ring-1 ring-purple-300"
                  : "bg-white border-slate-200 hover:border-slate-300 shadow-2xs"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center space-x-2">
                  <span className="bg-slate-900 text-white text-[11px] font-bold px-2 py-0.5 rounded-md">
                    V{ver.versionNumber}
                  </span>
                  <span className="text-xs font-semibold text-slate-800 flex items-center gap-1">
                    <User className="w-3 h-3 text-slate-400" />
                    {ver.createdByName}
                  </span>
                </div>

                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(ver.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {/* Summary */}
              <p className="text-xs text-slate-600 line-clamp-2 mb-3 font-normal italic">
                "{ver.changeSummary || "Snapshot checkpoint"}"
              </p>

              {ver.restoredFromVersion && (
                <div className="mb-2 text-[10px] text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-100 flex items-center gap-1">
                  <RotateCcw className="w-3 h-3" />
                  Restored from Version {ver.restoredFromVersion}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => onViewVersion(ver)}
                    className={`flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                      isViewing
                        ? "bg-amber-200/80 text-amber-900"
                        : "hover:bg-slate-100 text-slate-600 hover:text-slate-900"
                    }`}
                    title="View this historical version in read-only mode"
                  >
                    <Eye className="w-3 h-3" />
                    <span>{isViewing ? "Viewing" : "View"}</span>
                  </button>

                  <button
                    onClick={() => onRestoreVersion(ver)}
                    className="flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
                    title="Restore active document to this state"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Restore</span>
                  </button>
                </div>

                {/* Compare Checkbox */}
                <button
                  onClick={() => toggleCompareSelection(ver.id)}
                  className={`text-[11px] px-2 py-0.5 rounded flex items-center gap-1 font-medium transition-colors ${
                    isSelectedForCompare
                      ? "bg-purple-100 text-purple-700"
                      : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                  }`}
                  title="Select for comparison"
                >
                  <GitCompare className="w-3 h-3" />
                  <span>{isSelectedForCompare ? "Selected" : "Compare"}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
