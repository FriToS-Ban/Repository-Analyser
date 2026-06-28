import { memo } from "react";
import { Handle, Position } from "reactflow";
import { getDiffNodeStyle } from "./Graph";
import { Pin } from "lucide-react";

export const FileNode = memo(({ data }: any) => {
  const getLangStyles = (lang: string) => {
    switch (lang.toLowerCase()) {
      case "python":
        return "border-blue-500/70 bg-blue-950/45 text-blue-200 hover:bg-blue-900/60 shadow-blue-950/40";
      case "javascript":
        return "border-yellow-500/70 bg-yellow-950/45 text-yellow-200 hover:bg-yellow-900/60 shadow-yellow-950/40";
      case "typescript":
        return "border-cyan-500/70 bg-cyan-950/45 text-cyan-200 hover:bg-cyan-900/60 shadow-cyan-950/40";
      default:
        return "border-slate-600/70 bg-slate-900/45 text-slate-200 hover:bg-slate-800/60 shadow-slate-950/40";
    }
  };

  const getChurnStyles = (ratio: number, count: number) => {
    if (count === 0) return "border-slate-800/80 bg-slate-950/70 text-slate-500 opacity-50 shadow-none";
    if (ratio > 0.66) return "border-red-500/90 bg-gradient-to-r from-red-950/90 via-rose-900/80 to-orange-950/90 text-red-100 shadow-[0_0_22px_rgba(239,68,68,0.55)] ring-1 ring-red-400/50";
    if (ratio > 0.33) return "border-amber-500/80 bg-gradient-to-r from-amber-950/85 via-orange-900/75 to-yellow-950/85 text-amber-100 shadow-[0_0_16px_rgba(245,158,11,0.4)]";
    return "border-emerald-500/70 bg-gradient-to-r from-emerald-950/80 to-teal-950/80 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.3)]";
  };

  const filename = data.id.split("/").pop() || data.id;

  const isSearchActive = data.isSearchActive;
  const isHighlighted = data.isHighlighted;
  const isSelected = data.isSelected;
  const isOrphan = data.isOrphan;
  const isPinned = data.isPinned;
  const diffStatus = data.diffStatus as string | undefined;

  const isChurnActive = data.isChurnActive;
  const churnCount = data.churnCount || 0;
  const churnRatio = data.churnRatio || 0;

  let highlightClass = "";
  if (isSearchActive) {
    if (isSelected) {
      highlightClass = "ring-2 ring-emerald-400 border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.6)] scale-110 z-50";
    } else if (isHighlighted) {
      highlightClass = "ring-2 ring-indigo-400 border-indigo-400 shadow-[0_0_15px_rgba(129,140,248,0.5)] scale-105 z-40";
    } else {
      highlightClass = "opacity-25 border-slate-700/40 bg-slate-950/20 text-slate-500 shadow-none";
    }
  }

  const baseStyle = diffStatus
    ? getDiffNodeStyle(diffStatus)
    : isChurnActive
    ? getChurnStyles(churnRatio, churnCount)
    : getLangStyles(data.language);

  return (
    <div
      className={`relative group px-4 py-3 rounded-xl border backdrop-blur-sm shadow-xl transition-all duration-200 min-w-[150px] text-center select-none ${baseStyle} ${!diffStatus && !isChurnActive ? highlightClass : ""} ${isOrphan && !diffStatus && !isChurnActive ? "border-dashed" : ""}`}
    >
      {data.onTogglePin && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            data.onTogglePin(data.id);
          }}
          className={`absolute top-1.5 right-1.5 p-1 rounded-md transition-all cursor-pointer z-10 ${
            isPinned
              ? "text-amber-400 hover:text-amber-300 bg-amber-500/10"
              : "text-slate-500 hover:text-slate-300 opacity-0 group-hover:opacity-100"
          }`}
          title={isPinned ? "Unpin node position" : "Pin node position"}
        >
          <Pin className={`h-3 w-3 ${isPinned ? "fill-amber-400/30" : ""}`} />
        </button>
      )}
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-slate-500 !w-2.5 !h-2.5"
      />
      <div className="font-semibold text-xs truncate max-w-[160px] tracking-wide pr-3">
        {filename}
      </div>
      <div className="text-[9px] opacity-75 mt-1 font-mono tracking-wider flex items-center justify-center gap-1.5">
        <span>{data.loc} LOC</span>
        <span>•</span>
        <span>{data.incomingEdges || 0} {data.incomingEdges === 1 ? "import" : "imports"}</span>
      </div>
      {isChurnActive && (
        <div className="mt-1.5 flex items-center justify-center">
          <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full border flex items-center gap-1 ${
            churnRatio > 0.66
              ? "bg-red-500/80 text-white border-red-400 shadow-sm shadow-red-500/50 animate-pulse"
              : churnRatio > 0.33
              ? "bg-amber-500/30 text-amber-200 border-amber-400/50"
              : "bg-emerald-500/30 text-emerald-200 border-emerald-400/50"
          }`}>
            🔥 {churnCount} {churnCount === 1 ? "commit" : "commits"}
          </span>
        </div>
      )}
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-slate-500 !w-2.5 !h-2.5"
      />
    </div>
  );
});

FileNode.displayName = "FileNode";