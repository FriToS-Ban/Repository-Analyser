import React, { useState, useEffect, useRef } from "react";
import { X, FileCode, Hash, MessageSquare, Terminal, Copy, Check, GitFork, Loader2, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";

const FAN_IN_THRESHOLD = 3;

interface SidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  fileInfo: {
    path: string;
    language: string;
    loc: number;
    fanIn: number;
  } | null;
  summary: string | null;
  loading: boolean;
  repoPath: string;
  apiBaseUrl: string;
}

export const SidePanel: React.FC<SidePanelProps> = ({
  isOpen,
  onClose,
  fileInfo,
  summary,
  loading,
  repoPath,
  apiBaseUrl,
}) => {
  const [copied, setCopied] = useState(false);

  // Refactor suggestions state
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [suggestionsExpanded, setSuggestionsExpanded] = useState(true);
  const [suggestionsCached, setSuggestionsCached] = useState(false);

  // Track which file we last fetched suggestions for to avoid duplicate calls
  const lastFetchedRef = useRef<string | null>(null);

  const isBottleneck = (fileInfo?.fanIn ?? 0) >= FAN_IN_THRESHOLD;

  useEffect(() => {
    if (!fileInfo || !isBottleneck) {
      setSuggestions([]);
      setSuggestionsError(null);
      lastFetchedRef.current = null;
      return;
    }

    // Don't re-fetch if we already loaded suggestions for this exact file
    if (lastFetchedRef.current === fileInfo.path) return;
    lastFetchedRef.current = fileInfo.path;

    setSuggestions([]);
    setSuggestionsError(null);
    setLoadingSuggestions(true);
    setSuggestionsExpanded(true);

    fetch(`${apiBaseUrl}/api/refactor-suggest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_path: fileInfo.path,
        repo_path: repoPath,
        fan_in: fileInfo.fanIn,
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || "Failed to load refactor suggestions.");
        }
        return res.json();
      })
      .then((data) => {
        setSuggestions(data.suggestions ?? []);
        setSuggestionsCached(data.cached ?? false);
      })
      .catch((err) => setSuggestionsError(err.message))
      .finally(() => setLoadingSuggestions(false));
  }, [fileInfo, isBottleneck, repoPath, apiBaseUrl]);

  if (!fileInfo) return null;

  const handleCopy = async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
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

        {/* Fan-in bottleneck badge */}
        {isBottleneck && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-950/30 border border-amber-500/30 rounded-lg">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
            <span className="text-xs text-amber-300 font-medium">
              High fan-in bottleneck —{" "}
              <span className="font-bold">{fileInfo.fanIn} files</span> import this module
            </span>
          </div>
        )}

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
                className={`flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-lg border transition-all duration-200 cursor-pointer ${copied
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

        {/* Refactor Suggestions — only shown for bottleneck files */}
        {isBottleneck && (
          <div className="space-y-3 border-t border-amber-500/20 pt-6">
            {/* Section header */}
            <button
              onClick={() => setSuggestionsExpanded((v) => !v)}
              className="w-full flex items-center justify-between group cursor-pointer"
            >
              <h4 className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <GitFork className="h-4 w-4" /> Refactor Suggestions
                {suggestionsCached && (
                  <span className="ml-1 text-[9px] font-normal text-slate-500 normal-case tracking-normal">(cached)</span>
                )}
              </h4>
              <span className="text-slate-500 group-hover:text-slate-300 transition-colors">
                {suggestionsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </span>
            </button>

            {suggestionsExpanded && (
              <>
                {loadingSuggestions ? (
                  <div className="flex items-center gap-3 py-6 justify-center">
                    <Loader2 className="h-5 w-5 text-amber-400 animate-spin" />
                    <span className="text-xs text-slate-400">Analysing responsibilities...</span>
                  </div>
                ) : suggestionsError ? (
                  <div className="flex items-start gap-2 p-3 bg-red-950/20 border border-red-500/20 rounded-lg">
                    <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-400 font-mono">{suggestionsError}</p>
                  </div>
                ) : suggestions.length > 0 ? (
                  <ol className="space-y-2">
                    {suggestions.map((s, i) => (
                      <li key={i} className="flex gap-3 p-3 bg-amber-950/10 border border-amber-500/15 rounded-lg hover:border-amber-500/30 transition-colors">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 text-[10px] font-bold flex items-center justify-center">
                          {i + 1}
                        </span>
                        <p className="text-xs text-slate-300 leading-relaxed">{s}</p>
                      </li>
                    ))}
                  </ol>
                ) : null}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};