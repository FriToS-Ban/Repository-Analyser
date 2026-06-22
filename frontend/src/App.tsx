import { useState, useMemo } from "react";
import { FolderGit2, Play, AlertCircle, FileCode2, Hash } from "lucide-react";
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
}

function App() {
  const [repoPath, setRepoPath] = useState("");
  const [loadingGraph, setLoadingGraph] = useState(false);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);

  // SidePanel state
  const [selectedFile, setSelectedFile] = useState<FileDetails | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);

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
    python:     { pill: "bg-blue-950/60 text-blue-300 border-blue-800/60",   dot: "bg-blue-400",   label: "Python" },
    javascript: { pill: "bg-yellow-950/60 text-yellow-300 border-yellow-800/60", dot: "bg-yellow-400", label: "JS" },
    typescript: { pill: "bg-cyan-950/60 text-cyan-300 border-cyan-800/60",   dot: "bg-cyan-400",   label: "TS" },
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
        {graphData ? (
          <Graph
            data={graphData}
            selectedFile={selectedFile}
            onSelectFile={handleSelectFile}
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
        />
      </main>
    </div>
  );
}

export default App;
