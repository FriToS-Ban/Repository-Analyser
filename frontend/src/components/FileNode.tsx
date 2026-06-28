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

  const filename = data.id.split("/").pop() || data.id;

  const isSearchActive = data.isSearchActive;
  const isHighlighted = data.isHighlighted;
  const isSelected = data.isSelected;
  const isOrphan = data.isOrphan;
  const isPinned = data.isPinned;
  const diffStatus = data.diffStatus as string | undefined;

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

  return (
    <div
      className={`relative group px-4 py-3 rounded-xl border backdrop-blur-sm shadow-xl transition-all duration-200 min-w-[150px] text-center select-none ${diffStatus ? getDiffNodeStyle(diffStatus) : getLangStyles(data.language)} ${!diffStatus ? highlightClass : ""} ${isOrphan && !diffStatus ? "border-dashed" : ""}`}
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
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-slate-500 !w-2.5 !h-2.5"
      />
    </div>
  );
});

FileNode.displayName = "FileNode";