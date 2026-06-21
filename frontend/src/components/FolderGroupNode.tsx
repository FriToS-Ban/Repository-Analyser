import { memo } from "react";
import { Folder } from "lucide-react";

export const FolderGroupNode = memo(({ data }: any) => (
  <div className="w-full h-full rounded-xl border border-slate-700/40 bg-slate-900/25 backdrop-blur-sm overflow-hidden">
    <div className="px-3 py-2 border-b border-slate-700/35 flex items-center gap-2 bg-slate-800/35 rounded-t-xl">
      <Folder className="h-3.5 w-3.5 text-indigo-400/80 shrink-0" />
      <span
        className="text-[11px] font-semibold text-slate-300 truncate"
        title={data.fullPath === "__root__" ? "(root)" : data.fullPath}
      >
        {data.label}
      </span>
      <span className="ml-auto text-[9px] text-slate-500 font-mono shrink-0 whitespace-nowrap">
        {data.count} {data.count === 1 ? "file" : "files"}
      </span>
    </div>
  </div>
));

FolderGroupNode.displayName = "FolderGroupNode";
