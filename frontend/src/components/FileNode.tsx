import { memo } from "react";
import { Handle, Position } from "reactflow";

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

  let highlightClass = "";
  if (isSearchActive) {
    if (isHighlighted) {
      highlightClass = "ring-2 ring-indigo-400 border-indigo-400 shadow-[0_0_15px_rgba(129,140,248,0.5)] scale-105 z-50";
    } else {
      highlightClass = "opacity-25 border-slate-700/40 bg-slate-950/20 text-slate-500 shadow-none";
    }
  }

  return (
    <div
      className={`px-4 py-3 rounded-xl border backdrop-blur-sm shadow-xl transition-all duration-200 min-w-[150px] text-center select-none ${getLangStyles(
        data.language
      )} ${highlightClass}`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-slate-500 !w-2.5 !h-2.5"
      />
      <div className="font-semibold text-xs truncate max-w-[160px] tracking-wide">
        {filename}
      </div>
      <div className="text-[9px] opacity-75 mt-1 font-mono tracking-wider flex items-center justify-center gap-1.5">
        <span>{data.loc} LOC</span>
        <span>•</span>
        <span>{data.incomingEdges || 0} {data.incomingEdges === 1 ? "import" : "imports"}</span>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-slate-500 !w-2.5 !h-2.5"
      />
    </div>
  );
});

FileNode.displayName = "FileNode";
