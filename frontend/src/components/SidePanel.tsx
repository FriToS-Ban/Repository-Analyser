import React, { useState } from "react";
import { X, FileCode, Hash, MessageSquare, Terminal, Copy, Check } from "lucide-react";

interface SidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  fileInfo: {
    path: string;
    language: string;
    loc: number;
  } | null;
  summary: string | null;
  loading: boolean;
}

export const SidePanel: React.FC<SidePanelProps> = ({
  isOpen,
  onClose,
  fileInfo,
  summary,
  loading,
}) => {
  if (!fileInfo) return null;

  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback for non-secure contexts
      const ta = document.createElement("textarea");
      ta.value = summary;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getLangBadgeColor = (lang: string) => {
    switch (lang.toLowerCase()) {
      case "python":
        return "bg-blue-900/40 text-blue-300 border border-blue-500/30";
      case "javascript":
        return "bg-yellow-900/40 text-yellow-300 border border-yellow-500/30";
      case "typescript":
        return "bg-cyan-900/40 text-cyan-300 border border-cyan-500/30";
      default:
        return "bg-gray-800 text-gray-300 border border-gray-700";
    }
  };

  return (
    <div className={`fixed inset-y-0 right-0 w-96 bg-[#0f172a]/95 backdrop-blur-md border-l border-slate-800 shadow-2xl flex flex-col z-50 transition-transform duration-300 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileCode className="h-5 w-5 text-indigo-400" />
          <h3 className="font-semibold text-slate-100 text-lg">File Details</h3>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-200 hover:bg-slate-800 p-1.5 rounded-lg transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Content */}
      <div className="p-6 flex-1 overflow-y-auto space-y-6">
        {/* Path Info */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            File Path
          </label>
          <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-lg select-all text-sm font-mono text-slate-300 break-all">
            {fileInfo.path}
          </div>
        </div>

        {/* Metadata grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-900/40 border border-slate-800/60 p-3 rounded-lg space-y-1">
            <span className="text-xs text-slate-400 flex items-center gap-1.5">
              <Terminal className="h-3.5 w-3.5" /> Language
            </span>
            <div className="text-sm font-medium mt-1">
              <span className={`px-2 py-0.5 rounded text-xs capitalize ${getLangBadgeColor(fileInfo.language)}`}>
                {fileInfo.language}
              </span>
            </div>
          </div>
          <div className="bg-slate-900/40 border border-slate-800/60 p-3 rounded-lg space-y-1">
            <span className="text-xs text-slate-400 flex items-center gap-1.5">
              <Hash className="h-3.5 w-3.5" /> Lines of Code
            </span>
            <div className="text-base font-bold text-slate-200 mt-0.5">
              {fileInfo.loc}
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="space-y-2 border-t border-slate-800/60 pt-6">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <MessageSquare className="h-4 w-4 text-indigo-400" /> AI-Powered Explanation
            </h4>
            {summary && !loading && (
              <button
                onClick={handleCopy}
                title={copied ? "Copied!" : "Copy summary"}
                className={`flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-lg border transition-all duration-200 cursor-pointer ${
                  copied
                    ? "bg-emerald-950/40 text-emerald-400 border-emerald-700/50 shadow-sm shadow-emerald-950/40"
                    : "bg-slate-800/60 text-slate-400 border-slate-700 hover:bg-slate-700/60 hover:text-slate-200"
                }`}
              >
                {copied ? (
                  <><Check className="h-3 w-3" /> Copied!</>
                ) : (
                  <><Copy className="h-3 w-3" /> Copy</>
                )}
              </button>
            )}
          </div>
          
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <div className="h-8 w-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-xs text-slate-400 animate-pulse">Consulting LLM...</span>
            </div>
          ) : summary ? (
            <div className="p-4 bg-indigo-950/20 border border-indigo-500/20 rounded-lg text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
              {summary}
            </div>
          ) : (
            <div className="text-slate-500 text-xs italic py-4">
              Failed to load summary. Try checking your backend connection and environment credentials.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
