import { useState, useMemo } from "react";
import { FolderGit2, Play, AlertCircle, FileCode2, Hash, GitCompare, BookOpen, X, Loader2 } from "lucide-react";
import { Graph } from "./components/Graph";
import { SidePanel } from "./components/SidePanel";

const API_BASE_URL = "http://localhost:8000";

interface GraphNode {
  id: string;
  language: string;
  loc: number;
}

interface GraphEdge {
  source: string;
  target: string;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface FileDetails {
  path: string;
  language: string;
  loc: number;
  fanIn: number;
}

interface DiffNode {
  id: string;
  language: string;
  loc: number;
  status: "added" | "removed" | "changed" | "unchanged";
}

interface DiffEdge {
  source: string;
  target: string;
  status: "added" | "removed" | "unchanged";
}

interface DiffData {
  base_sha: string;
  head_sha: string;
  nodes: DiffNode[];
  edges: DiffEdge[];
  summary: { added: number; removed: number; changed: number; unchanged: number };
}

interface GitRefs {
  branches: string[];
  current_branch: string;
  recent_commits: { sha: string; subject: string }[];
}

function App() {
  const [repoPath, setRepoPath] = useState("");
  const [loadingGraph, setLoadingGraph] = useState(false);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);

  const [diffMode, setDiffMode] = useState(false);
  const [baseRef, setBaseRef] = useState("");
  const [headRef, setHeadRef] = useState("");
  const [diffData, setDiffData] = useState<DiffData | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [gitRefs, setGitRefs] = useState<GitRefs | null>(null);

  const [selectedFile, setSelectedFile] = useState<FileDetails | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);

  const [repoSummary, setRepoSummary] = useState<string | null>(null);
  const [loadingRepoSummary, setLoadingRepoSummary] = useState(false);
  const [showRepoSummary, setShowRepoSummary] = useState(false);

  const handleRepoSummary = async () => {
    setShowRepoSummary(true);
    if (repoSummary) return; // already fetched
    setLoadingRepoSummary(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/repo-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo_path: repoPath.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to generate repo summary.");
      }
      const data = await res.json();
      setRepoSummary(data.summary);
    } catch (err: any) {
      setRepoSummary(`Error: ${err.message}`);
    } finally {
      setLoadingRepoSummary(false);
    }
  };

  const handleAnalyse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoPath.trim()) return;

    setLoadingGraph(true);
    setGraphError(null);
    setSelectedFile(null);
    setSidePanelOpen(false);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/graph?path=${encodeURIComponent(repoPath.trim())}`
      );
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "Failed to fetch repository graph.");
      }
      const data: GraphData = await response.json();
      setGraphData(data);
      handleFetchRefs(repoPath.trim());
    } catch (err: any) {
      setGraphError(err.message || "An unexpected error occurred.");
      setGraphData(null);
    } finally {
      setLoadingGraph(false);
    }
  };

  const handleSelectFile = async (file: FileDetails | null) => {
    setSelectedFile(file);
    if (!file) {
      setSidePanelOpen(false);
      setSummary(null);
      return;
    }

    setSidePanelOpen(true);
    setLoadingSummary(true);
    setSummary(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/summarise`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          file_path: file.path,
          repo_path: repoPath.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to load explanation.");
      }

      const data = await response.json();
      setSummary(data.summary);
    } catch (err: any) {
      setSummary("Failed to load summary. Check your backend connection.");
    } finally {
      setLoadingSummary(false);
    }
  };

  const handleFetchRefs = async (path: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/refs?path=${encodeURIComponent(path)}`);
      if (!res.ok) return;
      const data: GitRefs = await res.json();
      setGitRefs(data);
      setBaseRef(data.current_branch);
      // Default head to first branch that isn't current
      const other = data.branches.find((b) => b !== data.current_branch);
      if (other) setHeadRef(other);
    } catch {
      // silently ignore — diff UI will just show free-text inputs
    }
  };

  const handleRunDiff = async () => {
    if (!repoPath.trim() || !baseRef.trim() || !headRef.trim()) return;
    setLoadingDiff(true);
    setDiffError(null);
    setDiffData(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/diff?path=${encodeURIComponent(repoPath.trim())}&base=${encodeURIComponent(baseRef)}&head=${encodeURIComponent(headRef)}`
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Diff failed.");
      }
      setDiffData(await res.json());
    } catch (err: any) {
      setDiffError(err.message);
    } finally {
      setLoadingDiff(false);
    }
  };

  const repoStats = useMemo(() => {
    if (!graphData) return null;
    const totalFiles = graphData.nodes.length;
    const totalLoc = graphData.nodes.reduce((sum, n) => sum + n.loc, 0);
    const langMap: Record<string, number> = {};
    graphData.nodes.forEach((n) => {
      const key = n.language.toLowerCase();
      langMap[key] = (langMap[key] || 0) + 1;
    });
    return { totalFiles, totalLoc, langMap };
  }, [graphData]);

  const LANG_STYLES: Record<string, { pill: string; dot: string; label: string }> = {
    python: { pill: "bg-blue-950/60 text-blue-300 border-blue-800/60", dot: "bg-blue-400", label: "Python" },
    javascript: { pill: "bg-yellow-950/60 text-yellow-300 border-yellow-800/60", dot: "bg-yellow-400", label: "JS" },
    typescript: { pill: "bg-cyan-950/60 text-cyan-300 border-cyan-800/60", dot: "bg-cyan-400", label: "TS" },
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0b0f19] text-slate-100 select-none">
      {/* Topbar */}
      <header className="border-b border-slate-800 bg-[#0b0f19]/80 backdrop-blur-md z-10 shrink-0">
        {/* Main toolbar row */}
        <div className="h-14 flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <FolderGit2 className="h-6 w-6 text-indigo-400" />
            <h1 className="font-bold text-lg tracking-wide bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
              Repo Analyser
            </h1>
          </div>

          <form onSubmit={handleAnalyse} className="flex items-center gap-2 max-w-xl flex-1 px-4">
            <input
              type="text"
              placeholder="Enter absolute local repository path..."
              value={repoPath}
              onChange={(e) => setRepoPath(e.target.value)}
              disabled={loadingGraph}
              className="w-full bg-slate-900/60 border border-slate-800 text-slate-200 px-4 py-2 rounded-lg text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-50 transition-all font-mono"
            />
            <button
              type="submit"
              disabled={loadingGraph || !repoPath.trim()}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800/40 text-white font-semibold text-xs px-4 py-2.5 rounded-lg disabled:opacity-50 transition-all cursor-pointer whitespace-nowrap"
            >
              {loadingGraph ? (
                <div className="h-4.5 w-4.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-current" />
                  Analyse
                </>
              )}
            </button>
          </form>
          {graphData && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleRepoSummary}
                disabled={loadingRepoSummary}
                className="flex items-center gap-1.5 font-semibold text-xs px-4 py-2.5 rounded-lg transition-all whitespace-nowrap border cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700 disabled:opacity-50"
              >
                {loadingRepoSummary
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <BookOpen className="h-3.5 w-3.5" />}
                Explain Repo
              </button>
              <button
                onClick={() => { setDiffMode((d) => !d); setDiffData(null); setDiffError(null); }}
                className={`flex items-center gap-1.5 font-semibold text-xs px-4 py-2.5 rounded-lg transition-all whitespace-nowrap border cursor-pointer ${diffMode
                    ? "bg-violet-600 hover:bg-violet-500 text-white border-violet-500"
                    : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
                  }`}
              >
                <GitCompare className="h-3.5 w-3.5" />
                {diffMode ? "Exit Diff" : "Diff"}
              </button>
            </div>
          )}
        </div>

        {/* Stats strip — visible only after a successful analysis */}
        {repoStats && (
          <div className="px-6 pb-2.5 flex items-center gap-4 animate-[fadeIn_0.4s_ease-out]">
            {/* Total files */}
            <div className="flex items-center gap-1.5 text-slate-400">
              <FileCode2 className="h-3.5 w-3.5 text-indigo-400" />
              <span className="text-xs font-semibold text-slate-200">{repoStats.totalFiles.toLocaleString()}</span>
              <span className="text-[11px]">files</span>
            </div>

            <span className="text-slate-700 text-xs">·</span>

            {/* Total LOC */}
            <div className="flex items-center gap-1.5 text-slate-400">
              <Hash className="h-3.5 w-3.5 text-indigo-400" />
              <span className="text-xs font-semibold text-slate-200">{repoStats.totalLoc.toLocaleString()}</span>
              <span className="text-[11px]">lines of code</span>
            </div>

            <span className="text-slate-700 text-xs">·</span>

            {/* Language breakdown pills */}
            <div className="flex items-center gap-1.5">
              {Object.entries(repoStats.langMap)
                .sort(([, a], [, b]) => b - a)
                .map(([lang, count]) => {
                  const style = LANG_STYLES[lang] || {
                    pill: "bg-slate-800/60 text-slate-300 border-slate-700",
                    dot: "bg-slate-400",
                    label: lang.charAt(0).toUpperCase() + lang.slice(1),
                  };
                  const pct = Math.round((count / repoStats.totalFiles) * 100);
                  return (
                    <span
                      key={lang}
                      className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${style.pill}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                      {style.label}
                      <span className="opacity-70">{count} · {pct}%</span>
                    </span>
                  );
                })}
            </div>
          </div>
        )}
      </header>

      {/* Main Canvas Area */}
      <main className="flex-1 relative overflow-hidden bg-[#070b13]">
        {diffMode && graphData && (
          <div className="absolute top-4 right-4 z-20 w-80 bg-slate-900/95 border border-slate-700 backdrop-blur-md rounded-xl p-4 shadow-2xl flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <GitCompare className="h-4 w-4 text-violet-400" />
              <span className="text-sm font-semibold text-slate-200">Branch / Commit Diff</span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Base (from)</label>
              {gitRefs ? (
                <select
                  value={baseRef}
                  onChange={(e) => setBaseRef(e.target.value)}
                  className="bg-slate-950 border border-slate-700 text-slate-200 px-3 py-2 rounded-lg text-xs focus:outline-none focus:border-violet-500 font-mono"
                >
                  {gitRefs.branches.map((b) => <option key={b} value={b}>{b}</option>)}
                  {gitRefs.recent_commits.map((c) => (
                    <option key={c.sha} value={c.sha}>{c.sha} — {c.subject.slice(0, 35)}</option>
                  ))}
                </select>
              ) : (
                <input value={baseRef} onChange={(e) => setBaseRef(e.target.value)}
                  placeholder="main"
                  className="bg-slate-950 border border-slate-700 text-slate-200 px-3 py-2 rounded-lg text-xs focus:outline-none focus:border-violet-500 font-mono" />
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Head (to)</label>
              {gitRefs ? (
                <select
                  value={headRef}
                  onChange={(e) => setHeadRef(e.target.value)}
                  className="bg-slate-950 border border-slate-700 text-slate-200 px-3 py-2 rounded-lg text-xs focus:outline-none focus:border-violet-500 font-mono"
                >
                  {gitRefs.branches.map((b) => <option key={b} value={b}>{b}</option>)}
                  {gitRefs.recent_commits.map((c) => (
                    <option key={c.sha} value={c.sha}>{c.sha} — {c.subject.slice(0, 35)}</option>
                  ))}
                </select>
              ) : (
                <input value={headRef} onChange={(e) => setHeadRef(e.target.value)}
                  placeholder="feature/my-branch"
                  className="bg-slate-950 border border-slate-700 text-slate-200 px-3 py-2 rounded-lg text-xs focus:outline-none focus:border-violet-500 font-mono" />
              )}
            </div>

            <button
              onClick={handleRunDiff}
              disabled={loadingDiff || !baseRef.trim() || !headRef.trim()}
              className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold text-xs py-2.5 px-3 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {loadingDiff
                ? <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <GitCompare className="h-3.5 w-3.5" />}
              {loadingDiff ? "Comparing..." : "Compare"}
            </button>

            {diffError && (
              <p className="text-[10px] text-red-400 font-mono bg-red-950/20 border border-red-500/20 rounded-lg p-2">{diffError}</p>
            )}

            {diffData && (
              <div className="border-t border-slate-800 pt-3 flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { label: "Added", count: diffData.summary.added, color: "text-emerald-400 bg-emerald-950/40 border-emerald-800/50" },
                    { label: "Removed", count: diffData.summary.removed, color: "text-red-400 bg-red-950/40 border-red-800/50" },
                    { label: "Changed", count: diffData.summary.changed, color: "text-yellow-400 bg-yellow-950/40 border-yellow-800/50" },
                    { label: "Unchanged", count: diffData.summary.unchanged, color: "text-slate-400 bg-slate-800/40 border-slate-700/50" },
                  ].map(({ label, count, color }) => (
                    <div key={label} className={`rounded-lg border px-2 py-1.5 text-center ${color}`}>
                      <div className="text-sm font-bold">{count}</div>
                      <div className="text-[9px] font-semibold uppercase tracking-wider opacity-80">{label}</div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 font-mono text-center">
                  {diffData.base_sha.slice(0, 7)} → {diffData.head_sha.slice(0, 7)}
                </p>
              </div>
            )}
          </div>
        )}
        {graphData ? (
          <Graph
            data={diffMode && diffData
              ? { nodes: diffData.nodes, edges: diffData.edges }
              : graphData
            }
            selectedFile={selectedFile}
            onSelectFile={handleSelectFile}
            diffMode={diffMode && !!diffData}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center space-y-4">
            {graphError ? (
              <div className="flex flex-col items-center space-y-3 max-w-md bg-red-950/20 border border-red-500/20 p-6 rounded-xl">
                <AlertCircle className="h-10 w-10 text-red-400" />
                <h3 className="font-semibold text-red-200">Analysis Error</h3>
                <p className="text-xs text-red-400 font-mono leading-relaxed">{graphError}</p>
              </div>
            ) : (
              <div className="max-w-md space-y-2">
                <h3 className="text-xl font-semibold text-slate-300">
                  Welcome to Repository Structure Analyser
                </h3>
                <p className="text-sm text-slate-400">
                  Provide an absolute path to a Git repository in the text field above to visualize file relationships and get automated code structure summaries.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Side Panel for summaries */}
        <SidePanel
          isOpen={sidePanelOpen}
          onClose={() => handleSelectFile(null)}
          fileInfo={selectedFile}
          summary={summary}
          loading={loadingSummary}
          repoPath={repoPath.trim()}
          apiBaseUrl={API_BASE_URL}
        />

        {/* Repo-level architectural summary modal */}
        {showRepoSummary && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm" onClick={() => setShowRepoSummary(false)}>
            <div className="relative w-full max-w-2xl bg-[#0f172a] border border-slate-700 rounded-2xl shadow-2xl flex flex-col gap-4 p-6" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-indigo-400" />
                  <h2 className="font-bold text-slate-100 text-base">Repository Overview</h2>
                </div>
                <button onClick={() => setShowRepoSummary(false)} className="text-slate-400 hover:text-slate-200 hover:bg-slate-800 p-1.5 rounded-lg transition-colors cursor-pointer">
                  <X className="h-5 w-5" />
                </button>
              </div>
              {/* Body */}
              <div className="min-h-[120px] flex items-start">
                {loadingRepoSummary ? (
                  <div className="w-full flex flex-col items-center justify-center py-10 gap-3">
                    <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
                    <span className="text-xs text-slate-400 animate-pulse">Analysing codebase architecture...</span>
                  </div>
                ) : (
                  <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{repoSummary}</p>
                )}
              </div>
              {/* Refresh */}
              {!loadingRepoSummary && (
                <button
                  onClick={() => { setRepoSummary(null); handleRepoSummary(); }}
                  className="self-end text-[10px] font-semibold text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                >
                  Regenerate
                </button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
