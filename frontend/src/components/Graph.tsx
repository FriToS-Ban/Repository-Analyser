import React, { useMemo, useEffect, useState, useRef } from "react";
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
  ReactFlowProvider,
  useReactFlow,
} from "reactflow";
import "reactflow/dist/style.css";
import { FileNode } from "./FileNode";
import { FolderGroupNode } from "./FolderGroupNode";
import { Search, X, Maximize2, Download } from "lucide-react";
import { toPng } from "html-to-image";


interface GraphNode {
  id: string;
  language: string;
  loc: number;
}

interface GraphEdge {
  source: string;
  target: string;
}

interface GraphProps {
  data: {
    nodes: GraphNode[];
    edges: GraphEdge[];
  };
  selectedFile: { path: string; language: string; loc: number } | null;
  onSelectFile: (file: { path: string; language: string; loc: number } | null) => void;
}

// Layout constants
const NODE_W = 200;
const NODE_H = 72;
const F_PADDING = 14;
const F_HEADER_H = 38;
const FILE_GAP = 10;
const FOLDER_COL_GAP = 310;
const FOLDER_ROW_GAP = 30;
const FOLDER_W = NODE_W + F_PADDING * 2;
const folderHeight = (count: number) =>
  F_HEADER_H + F_PADDING + count * NODE_H + Math.max(count - 1, 0) * FILE_GAP + F_PADDING;

// Cluster-by-folder layout: groups files into parent folder nodes,
// positions folder columns by average BFS level of their children.
const layoutNodesGrouped = (
  nodes: GraphNode[],
  edges: GraphEdge[]
): { rfNodes: any[]; absoluteXMap: Map<string, number> } => {
  if (nodes.length === 0) return { rfNodes: [], absoluteXMap: new Map() };

  // 1. Group files by directory
  const folderGroups: Record<string, GraphNode[]> = {};
  nodes.forEach((n) => {
    const parts = n.id.split("/");
    const dir = parts.length > 1 ? parts.slice(0, -1).join("/") : "__root__";
    if (!folderGroups[dir]) folderGroups[dir] = [];
    folderGroups[dir].push(n);
  });

  // 2. BFS to compute per-file dependency levels
  const adj: Record<string, string[]> = {};
  const inDegree: Record<string, number> = {};
  nodes.forEach((n) => { adj[n.id] = []; inDegree[n.id] = 0; });
  edges.forEach((e) => {
    if (adj[e.source]) adj[e.source].push(e.target);
    if (inDegree[e.target] !== undefined) inDegree[e.target]++;
  });
  const q: string[] = [];
  const levels: Record<string, number> = {};
  nodes.forEach((n) => { if (inDegree[n.id] === 0) { q.push(n.id); levels[n.id] = 0; } });
  if (q.length === 0 && nodes.length > 0) { q.push(nodes[0].id); levels[nodes[0].id] = 0; }
  while (q.length > 0) {
    const cur = q.shift()!;
    (adj[cur] || []).forEach((t) => {
      if (levels[t] === undefined || levels[t] < (levels[cur] || 0) + 1) {
        levels[t] = (levels[cur] || 0) + 1;
        q.push(t);
      }
    });
  }
  nodes.forEach((n) => { if (levels[n.id] === undefined) levels[n.id] = 0; });

  // 3. Average BFS level per folder → determines horizontal column
  const folderAvgLevel: Record<string, number> = {};
  Object.entries(folderGroups).forEach(([dir, fnodes]) => {
    folderAvgLevel[dir] = Math.round(
      fnodes.reduce((s, n) => s + (levels[n.id] || 0), 0) / fnodes.length
    );
  });

  // 4. Group folders by column level
  const foldersByLevel: Record<number, string[]> = {};
  Object.keys(folderGroups).forEach((dir) => {
    const lvl = folderAvgLevel[dir];
    if (!foldersByLevel[lvl]) foldersByLevel[lvl] = [];
    foldersByLevel[lvl].push(dir);
  });

  // 5. Compute folder positions (stack vertically within each column)
  const CANVAS_CENTER_Y = 450;
  const folderPos: Record<string, { x: number; y: number }> = {};
  Object.entries(foldersByLevel).forEach(([lvlStr, dirs]) => {
    const lvl = parseInt(lvlStr);
    const x = lvl * FOLDER_COL_GAP + 60;
    const totalH =
      dirs.reduce((s, d) => s + folderHeight(folderGroups[d].length), 0) +
      Math.max(dirs.length - 1, 0) * FOLDER_ROW_GAP;
    let y = CANVAS_CENTER_Y - totalH / 2;
    dirs.forEach((dir) => {
      folderPos[dir] = { x, y };
      y += folderHeight(folderGroups[dir].length) + FOLDER_ROW_GAP;
    });
  });

  // 6. Build ReactFlow nodes (folder parents + file children)
  const rfNodes: any[] = [];
  const absoluteXMap = new Map<string, number>();

  Object.entries(folderGroups).forEach(([dir, fnodes]) => {
    const { x, y } = folderPos[dir] || { x: 0, y: 0 };
    const height = folderHeight(fnodes.length);

    // Folder container node
    rfNodes.push({
      id: `folder:${dir}`,
      type: "folderNode",
      position: { x, y },
      data: {
        label: dir === "__root__" ? "/" : (dir.split("/").pop() || dir),
        fullPath: dir,
        count: fnodes.length,
        isFolder: true,
      },
      style: { width: FOLDER_W, height },
      selectable: true,
      draggable: true,
    });

    // File nodes positioned relative to their parent folder
    fnodes.forEach((n, idx) => {
      const fileX = F_PADDING;
      const fileY = F_HEADER_H + F_PADDING + idx * (NODE_H + FILE_GAP);
      absoluteXMap.set(n.id, x + fileX);
      rfNodes.push({
        id: n.id,
        type: "fileNode",
        parentId: `folder:${dir}`,
        position: { x: fileX, y: fileY },
        data: {
          id: n.id,
          language: n.language,
          loc: n.loc,
          incomingEdges: inDegree[n.id] || 0,
          isHighlighted: false,
          isSearchActive: false,
        },
      });
    });
  });

  return { rfNodes, absoluteXMap };
};

// Tarjan's algorithm to find strongly connected components and cyclic edges
const findCyclicEdges = (nodes: GraphNode[], edges: GraphEdge[]): Set<string> => {
  const cyclicEdges = new Set<string>();
  if (nodes.length === 0) return cyclicEdges;

  const adj: Record<string, string[]> = {};
  nodes.forEach((n) => { adj[n.id] = []; });
  edges.forEach((e) => {
    if (adj[e.source] && adj[e.target]) adj[e.source].push(e.target);
  });

  const indexMap = new Map<string, number>();
  const lowlinkMap = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  let index = 0;
  const sccs: string[][] = [];

  // Iterative Tarjan using an explicit work stack to avoid recursion limits
  nodes.forEach((startNode) => {
    if (indexMap.has(startNode.id)) return;

    const workStack: { v: string; neighborIdx: number }[] = [{ v: startNode.id, neighborIdx: 0 }];

    while (workStack.length > 0) {
      const frame = workStack[workStack.length - 1];
      const v = frame.v;

      if (frame.neighborIdx === 0) {
        indexMap.set(v, index);
        lowlinkMap.set(v, index);
        index++;
        stack.push(v);
        onStack.add(v);
      }

      const neighbors = adj[v] || [];
      if (frame.neighborIdx < neighbors.length) {
        const w = neighbors[frame.neighborIdx];
        frame.neighborIdx++;

        if (!indexMap.has(w)) {
          workStack.push({ v: w, neighborIdx: 0 });
        } else if (onStack.has(w)) {
          lowlinkMap.set(v, Math.min(lowlinkMap.get(v)!, indexMap.get(w)!));
        }
      } else {
        workStack.pop();
        if (workStack.length > 0) {
          const parent = workStack[workStack.length - 1].v;
          lowlinkMap.set(parent, Math.min(lowlinkMap.get(parent)!, lowlinkMap.get(v)!));
        }

        if (lowlinkMap.get(v) === indexMap.get(v)) {
          const scc: string[] = [];
          while (true) {
            const w = stack.pop()!;
            onStack.delete(w);
            scc.push(w);
            if (w === v) break;
          }
          sccs.push(scc);
        }
      }
    }
  });

  const nodeSccMap = new Map<string, number>();
  sccs.forEach((scc, sccIdx) => {
    scc.forEach((nodeId) => nodeSccMap.set(nodeId, sccIdx));
  });

  edges.forEach((e) => {
    if (e.source === e.target) {
      cyclicEdges.add(JSON.stringify([e.source, e.target]));
    } else {
      const sccIdxSource = nodeSccMap.get(e.source);
      const sccIdxTarget = nodeSccMap.get(e.target);
      if (sccIdxSource !== undefined && sccIdxSource === sccIdxTarget) {
        if (sccs[sccIdxSource].length > 1) {
          cyclicEdges.add(JSON.stringify([e.source, e.target]));
        }
      }
    }
  });

  return cyclicEdges;
};

const getDependencyChain = (
  nodes: GraphNode[],
  edges: GraphEdge[],
  selectedId: string
): { nodeIds: Set<string>; edgeIds: Set<string> } => {
  const nodeIds = new Set<string>([selectedId]);
  const edgeIds = new Set<string>();

  const outgoing: Record<string, string[]> = {};
  const incoming: Record<string, string[]> = {};

  nodes.forEach((n) => {
    outgoing[n.id] = [];
    incoming[n.id] = [];
  });

  edges.forEach((e) => {
    if (outgoing[e.source]) outgoing[e.source].push(e.target);
    if (incoming[e.target]) incoming[e.target].push(e.source);
  });

  // 1. Traverse forward (dependencies)
  const queueForward = [selectedId];
  const visitedForward = new Set<string>([selectedId]);
  while (queueForward.length > 0) {
    const curr = queueForward.shift()!;
    const targets = outgoing[curr] || [];
    targets.forEach((t) => {
      if (!visitedForward.has(t)) {
        visitedForward.add(t);
        nodeIds.add(t);
        queueForward.push(t);
      }
      edgeIds.add(`${curr}->${t}`);
    });
  }

  // 2. Traverse backward (dependents)
  const queueBackward = [selectedId];
  const visitedBackward = new Set<string>([selectedId]);
  while (queueBackward.length > 0) {
    const curr = queueBackward.shift()!;
    const sources = incoming[curr] || [];
    sources.forEach((s) => {
      if (!visitedBackward.has(s)) {
        visitedBackward.add(s);
        nodeIds.add(s);
        queueBackward.push(s);
      }
      edgeIds.add(`${s}->${curr}`);
    });
  }

  return { nodeIds, edgeIds };
};

const GraphCanvas: React.FC<GraphProps> = ({ data, selectedFile, onSelectFile }) => {
  const { fitView, getNode, setCenter } = useReactFlow();
  const nodeTypes = useMemo(() => ({ fileNode: FileNode, folderNode: FolderGroupNode }), []);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [langFilter, setLangFilter] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  const reactFlowWrapperRef = useRef<HTMLDivElement>(null);

  const handleExportPng = () => {
    const el = reactFlowWrapperRef.current?.querySelector(".react-flow") as HTMLElement;
    if (!el) return;

    setExporting(true);

    const controls = reactFlowWrapperRef.current?.querySelector(".react-flow__controls") as HTMLElement;
    const minimap = reactFlowWrapperRef.current?.querySelector(".react-flow__minimap") as HTMLElement;
    const attribution = reactFlowWrapperRef.current?.querySelector(".react-flow__attribution") as HTMLElement;

    if (controls) controls.style.display = "none";
    if (minimap) minimap.style.display = "none";
    if (attribution) attribution.style.display = "none";

    toPng(el, {
      backgroundColor: "#070b13",
      pixelRatio: 2,
      cacheBust: true,
    })
      .then((dataUrl) => {
        const a = document.createElement("a");
        a.setAttribute("download", `repository-graph-${Date.now()}.png`);
        a.setAttribute("href", dataUrl);
        a.click();
      })
      .catch((err) => {
        console.error("Failed to export graph as PNG:", err);
      })
      .finally(() => {
        if (controls) controls.style.display = "flex";
        if (minimap) minimap.style.display = "block";
        if (attribution) attribution.style.display = "block";
        setExporting(false);
      });
  };

  // Derive unique languages present in this graph
  const availableLangs = useMemo(() => {
    const langs = new Set<string>();
    data.nodes.forEach((n) => langs.add(n.language.toLowerCase()));
    return Array.from(langs).sort();
  }, [data.nodes]);

  const toggleLang = (lang: string) => {
    setLangFilter((prev) => {
      const next = new Set(prev);
      if (next.has(lang)) next.delete(lang);
      else next.add(lang);
      return next;
    });
  };

  const isLangFilterActive = langFilter.size > 0;

  // Filtered node IDs for the current language selection
  const filteredNodeIds = useMemo(() => {
    if (!isLangFilterActive) return null;
    return new Set(data.nodes.filter((n) => langFilter.has(n.language.toLowerCase())).map((n) => n.id));
  }, [data.nodes, langFilter, isLangFilterActive]);

  const langMeta: Record<string, { label: string; active: string; inactive: string }> = {
    python: { label: "Python", active: "bg-blue-600 text-white border-blue-500 shadow-blue-500/30", inactive: "bg-blue-950/40 text-blue-400 border-blue-900/60 hover:bg-blue-900/40" },
    javascript: { label: "JavaScript", active: "bg-yellow-500 text-slate-900 border-yellow-400 shadow-yellow-500/30", inactive: "bg-yellow-950/40 text-yellow-400 border-yellow-900/60 hover:bg-yellow-900/40" },
    typescript: { label: "TypeScript", active: "bg-cyan-600 text-white border-cyan-500 shadow-cyan-500/30", inactive: "bg-cyan-950/40 text-cyan-400 border-cyan-900/60 hover:bg-cyan-900/40" },
  };

  const nodePositions = useMemo(() => {
    if (!data.nodes || data.nodes.length === 0) return new Map<string, number>();
    const { absoluteXMap } = layoutNodesGrouped(data.nodes, data.edges);
    return absoluteXMap;
  }, [data]);

  const cyclicEdges = useMemo(() => {
    return findCyclicEdges(data.nodes, data.edges);
  }, [data.nodes, data.edges]);

  const incomingEdgeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    data.nodes.forEach((n) => { counts[n.id] = 0; });
    data.edges.forEach((e) => {
      if (counts[e.target] !== undefined) counts[e.target]++;
    });
    return counts;
  }, [data.nodes, data.edges]);

  const orphanNodeIds = useMemo(() => {
    const orphans = new Set<string>();
    const hasOutgoing = new Set<string>();
    const hasIncoming = new Set<string>();
    data.edges.forEach((e) => {
      hasOutgoing.add(e.source);
      hasIncoming.add(e.target);
    });
    data.nodes.forEach((n) => {
      if (!hasOutgoing.has(n.id) && !hasIncoming.has(n.id)) {
        orphans.add(n.id);
      }
    });
    return orphans;
  }, [data.nodes, data.edges]);

  const dependencyChain = useMemo(() => {
    if (!selectedFile) return null;
    return getDependencyChain(data.nodes, data.edges, selectedFile.path);
  }, [data.nodes, data.edges, selectedFile]);

  const getEdgeColor = useMemo(() => (sourceId: string, targetId: string) => {
    if (cyclicEdges.has(JSON.stringify([sourceId, targetId]))) {
      return "#ef4444"; // Red for circular dependency
    }
    const sourceX = nodePositions.get(sourceId);
    const targetX = nodePositions.get(targetId);
    if (sourceX === undefined || targetX === undefined) return "#4b5563";
    if (sourceX < targetX) return "#3b82f6"; // Blue for forward dependency
    if (sourceX > targetX) return "#64748b"; // Slate for non-cyclic backward edges
    return "#10b981"; // Emerald/green for same level
  }, [nodePositions, cyclicEdges]);

  useEffect(() => {
    if (!data.nodes || data.nodes.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const { rfNodes } = layoutNodesGrouped(data.nodes, data.edges);
    setNodes(rfNodes.map(n => ({
      ...n,
      data: { ...n.data, isOrphan: n.data.isFolder ? false : orphanNodeIds.has(n.id) }
    })));

    setEdges(data.edges.map((e, index) => {
      const color = getEdgeColor(e.source, e.target);
      return {
        id: `e-${index}`,
        source: e.source,
        target: e.target,
        type: "smoothstep",
        animated: true,
        style: { stroke: color, strokeWidth: color === "#ef4444" ? 2 : 1 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color,
          width: 16,
          height: 16,
        },
      };
    }));
  }, [data, getEdgeColor, orphanNodeIds]);

  const prevDataRef = useRef(data);

  useEffect(() => {
    if (prevDataRef.current !== data) {
      setLangFilter(new Set());
      setSearchQuery("");
      prevDataRef.current = data;
    }
  }, [data]);

  useEffect(() => {
    const isSearchActive = searchQuery.trim() !== "";
    const isSelectedActive = selectedFile !== null;
    const query = searchQuery.toLowerCase();
    const combinedActive = isSearchActive || isLangFilterActive || isSelectedActive;

    setNodes(prev => prev.map(node => {
      if (node.data.isFolder) return node; // folder container nodes are never dimmed
      const filename = node.data.id.split("/").pop() || node.data.id;
      const passesSearch = !isSearchActive || filename.toLowerCase().includes(query);
      const passesLang = !isLangFilterActive || langFilter.has(node.data.language?.toLowerCase());
      const passesSelection = !isSelectedActive || (dependencyChain?.nodeIds.has(node.data.id) ?? false);
      const isHighlighted = combinedActive && passesSearch && passesLang && passesSelection;
      const isSelected = isSelectedActive && selectedFile?.path === node.data.id;

      return {
        ...node,
        data: {
          ...node.data,
          isHighlighted,
          isSelected,
          isSearchActive: combinedActive
        }
      };
    }));

    setEdges(prev => prev.map(edge => {
      const isSourceMatch = (edge.source.split("/").pop() || edge.source).toLowerCase().includes(query);
      const isTargetMatch = (edge.target.split("/").pop() || edge.target).toLowerCase().includes(query);
      const passesLangSource = !isLangFilterActive || (filteredNodeIds?.has(edge.source) ?? true);
      const passesLangTarget = !isLangFilterActive || (filteredNodeIds?.has(edge.target) ?? true);
      const passesSelection = !isSelectedActive || (dependencyChain?.edgeIds.has(`${edge.source}->${edge.target}`) ?? false);

      const isEdgeHighlighted = combinedActive &&
        (!isSearchActive || (isSourceMatch && isTargetMatch)) &&
        passesLangSource && passesLangTarget &&
        passesSelection;
      const defaultColor = getEdgeColor(edge.source, edge.target);

      return {
        ...edge,
        animated: !combinedActive || isEdgeHighlighted,
        style: {
          stroke: combinedActive ? (isEdgeHighlighted ? defaultColor : "#1e293b") : defaultColor,
          strokeWidth: isEdgeHighlighted ? 2.5 : (defaultColor === "#ef4444" ? 2 : 1),
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: combinedActive ? (isEdgeHighlighted ? defaultColor : "#1e293b") : defaultColor,
          width: 16,
          height: 16,
        },
      };
    }));
  }, [searchQuery, langFilter, isLangFilterActive, filteredNodeIds, getEdgeColor, selectedFile, dependencyChain]);

  const onNodeClick = (_event: React.MouseEvent, node: any) => {
    if (node.data.isFolder) return; // clicking the folder container does nothing
    onSelectFile({
      path: node.data.id,
      language: node.data.language,
      loc: node.data.loc,
    });
  };

  return (
    <div className="w-full h-full relative flex">
      {/* File Explorer Sidebar */}
      <div className="w-80 border-r border-slate-800 bg-slate-950 flex flex-col z-10 shrink-0">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <span className="font-semibold text-sm text-slate-200 tracking-wide flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-indigo-500"></span>
            Files
          </span>
          <span className="text-[10px] text-slate-500 font-mono">
            {data.nodes.length} items
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {data.nodes
            .filter((node) => !isLangFilterActive || langFilter.has(node.language.toLowerCase()))
            .slice()
            .sort((a, b) => (incomingEdgeCounts[b.id] || 0) - (incomingEdgeCounts[a.id] || 0))
            .map((node) => {
              const filename = node.id.split("/").pop() || node.id;
              const dir = node.id.split("/").slice(0, -1).join("/");
              const lang = node.language.toLowerCase();
              let langColor = "bg-slate-800 text-slate-400 border-slate-700";
              if (lang === "python") langColor = "bg-blue-950/50 text-blue-400 border-blue-900/50";
              else if (lang === "javascript") langColor = "bg-yellow-950/50 text-yellow-400 border-yellow-900/50";
              else if (lang === "typescript") langColor = "bg-cyan-950/50 text-cyan-400 border-cyan-900/50";

              return (
                <button
                  key={node.id}
                  onClick={() => {
                    setSearchQuery("");
                    const rfn = getNode(node.id);
                    if (rfn) {
                      // File nodes use relative coords inside parent folder — resolve to absolute
                      let cx = rfn.position.x + NODE_W / 2;
                      let cy = rfn.position.y + NODE_H / 2;
                      if (rfn.parentId) {
                        const parentRfn = getNode(rfn.parentId);
                        if (parentRfn) { cx += parentRfn.position.x; cy += parentRfn.position.y; }
                      }
                      setCenter(cx, cy, {
                        zoom: 1.2,
                        duration: 800,
                      });
                      onSelectFile({
                        path: node.id,
                        language: node.language,
                        loc: node.loc,
                      });
                    }
                  }}
                  className="w-full text-left p-2.5 rounded-lg border border-transparent hover:border-slate-800 hover:bg-slate-900/50 transition-all group flex items-start justify-between cursor-pointer"
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <div className="text-xs font-medium text-slate-300 group-hover:text-white truncate">
                      {filename}
                    </div>
                    {dir && (
                      <div className="text-[10px] text-slate-500 truncate font-mono mt-0.5">
                        {dir}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded border ${langColor} uppercase font-semibold tracking-wider`}>
                      {node.language}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {node.loc} LOC
                    </span>
                    {incomingEdgeCounts[node.id] > 0 && (
                      <span className="text-[9px] text-indigo-400 font-mono font-semibold">
                        ×{incomingEdgeCounts[node.id]}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 h-full relative" ref={reactFlowWrapperRef}>
        {/* Search / Filter Bar */}
        <div className="absolute top-4 left-4 z-10 w-72 bg-slate-900/90 border border-slate-800 backdrop-blur-md rounded-xl p-3 shadow-2xl flex flex-col gap-2">
          {/* Language Filter Pills */}
          {availableLangs.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Language</span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setLangFilter(new Set())}
                  className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-all shadow-sm cursor-pointer ${!isLangFilterActive
                    ? "bg-indigo-600 text-white border-indigo-500 shadow-indigo-500/30"
                    : "bg-slate-800/60 text-slate-400 border-slate-700 hover:bg-slate-700/60"
                    }`}
                >
                  All
                </button>
                {availableLangs.map((lang) => {
                  const meta = langMeta[lang] || { label: lang.charAt(0).toUpperCase() + lang.slice(1), active: "bg-indigo-600 text-white border-indigo-500 shadow-indigo-500/30", inactive: "bg-slate-800/60 text-slate-400 border-slate-700 hover:bg-slate-700/60" };
                  const isActive = langFilter.has(lang);
                  return (
                    <button
                      key={lang}
                      onClick={() => toggleLang(lang)}
                      className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-all shadow-sm cursor-pointer ${isActive ? meta.active : meta.inactive
                        }`}
                    >
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="relative flex items-center">
            <Search className="absolute left-3 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search files by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950/60 border border-slate-800 text-slate-200 pl-9 pr-8 py-2 rounded-lg text-xs focus:outline-none focus:border-indigo-500 transition-all font-sans"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 p-1 rounded-md hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <button
            onClick={() => {
              setSearchQuery("");
              setLangFilter(new Set());
              onSelectFile(null);
              fitView({ duration: 800 });
            }}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-2 px-3 rounded-lg transition-all flex items-center justify-center gap-1.5 shadow-md shadow-indigo-950/50 cursor-pointer"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            Recenter / Fit View
          </button>

          <button
            onClick={handleExportPng}
            disabled={exporting}
            className="w-full bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 text-slate-200 font-semibold text-xs py-2 px-3 rounded-lg transition-all flex items-center justify-center gap-1.5 shadow-md border border-slate-700 cursor-pointer disabled:opacity-50"
          >
            {exporting ? (
              <div className="h-3.5 w-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {exporting ? "Exporting..." : "Export as PNG"}
          </button>

          {/* Edge color legend */}
          <div className="border-t border-slate-800 pt-2 flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Edge Legend</span>
            <div className="flex items-center gap-2">
              <span className="w-4 h-0.5 bg-blue-500 rounded-full inline-block"></span>
              <span className="text-[10px] text-slate-400">Forward dependency</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-0.5 bg-slate-500 rounded-full inline-block"></span>
              <span className="text-[10px] text-slate-400">Backward (non-cyclic)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-0.5 bg-red-500 rounded-full inline-block"></span>
              <span className="text-[10px] text-slate-400">Circular dependency</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-0.5 bg-emerald-500 rounded-full inline-block"></span>
              <span className="text-[10px] text-slate-400">Same level</span>
            </div>
          </div>
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onPaneClick={() => onSelectFile(null)}
          fitView
          minZoom={0.1}
          maxZoom={1.5}
        >
          <Controls className="bg-slate-900 border border-slate-800 text-slate-100 rounded-lg p-1" />
          <MiniMap
            nodeColor={(node) => {
              if (node.data?.isFolder) return "rgba(30,41,59,0.6)";
              const lang = node.data?.language?.toLowerCase() || "";
              if (lang === "python") return "#2563eb";
              if (lang === "javascript") return "#ca8a04";
              if (lang === "typescript") return "#0891b2";
              return "#4b5563";
            }}
            maskColor="rgba(15, 23, 42, 0.7)"
            className="bg-slate-950/80 border border-slate-800 rounded-lg"
          />
          <Background color="#1e293b" gap={16} size={1} />
        </ReactFlow>
      </div>
    </div>
  );
};

export const Graph: React.FC<GraphProps> = (props) => {
  return (
    <ReactFlowProvider>
      <GraphCanvas {...props} />
    </ReactFlowProvider>
  );
};
