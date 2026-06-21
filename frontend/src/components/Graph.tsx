import React, { useMemo, useEffect, useState } from "react";
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
import { Search, X, Maximize2 } from "lucide-react";

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
  onSelectFile: (file: { path: string; language: string; loc: number }) => void;
}

// Simple BFS layered layout algorithm to compute X and Y coordinates dynamically
const layoutNodes = (nodes: GraphNode[], edges: GraphEdge[]) => {
  const adj: Record<string, string[]> = {};
  const inDegree: Record<string, number> = {};

  nodes.forEach((n) => {
    adj[n.id] = [];
    inDegree[n.id] = 0;
  });

  edges.forEach((e) => {
    if (adj[e.source]) {
      adj[e.source].push(e.target);
    }
    if (inDegree[e.target] !== undefined) {
      inDegree[e.target]++;
    }
  });

  const queue: string[] = [];
  const levels: Record<string, number> = {};

  nodes.forEach((n) => {
    if (inDegree[n.id] === 0) {
      queue.push(n.id);
      levels[n.id] = 0;
    }
  });

  if (queue.length === 0 && nodes.length > 0) {
    queue.push(nodes[0].id);
    levels[nodes[0].id] = 0;
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentLevel = levels[current] || 0;

    const targets = adj[current] || [];
    targets.forEach((target) => {
      if (levels[target] === undefined || levels[target] < currentLevel + 1) {
        levels[target] = currentLevel + 1;
        queue.push(target);
      }
    });
  }

  // Ensure all nodes have levels
  nodes.forEach((n) => {
    if (levels[n.id] === undefined) {
      levels[n.id] = 0;
    }
  });

  const nodesByLevel: Record<number, GraphNode[]> = {};
  nodes.forEach((n) => {
    const lvl = levels[n.id];
    if (!nodesByLevel[lvl]) {
      nodesByLevel[lvl] = [];
    }
    nodesByLevel[lvl].push(n);
  });

  const HORIZONTAL_SPACING = 280;
  const VERTICAL_SPACING = 110;

  return nodes.map((n) => {
    const lvl = levels[n.id];
    const levelNodes = nodesByLevel[lvl];
    const idx = levelNodes.indexOf(n);

    // Center vertical alignment
    const totalHeight = (levelNodes.length - 1) * VERTICAL_SPACING;
    const yPos = idx * VERTICAL_SPACING - totalHeight / 2;

    return {
      id: n.id,
      type: "fileNode",
      data: { id: n.id, language: n.language, loc: n.loc, incomingEdges: inDegree[n.id] || 0 },
      position: {
        x: lvl * HORIZONTAL_SPACING + 150,
        y: yPos + 350,
      },
    };
  });
};

const GraphCanvas: React.FC<GraphProps> = ({ data, onSelectFile }) => {
  const { fitView, getNode, setCenter } = useReactFlow();
  const nodeTypes = useMemo(() => ({ fileNode: FileNode }), []);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [langFilter, setLangFilter] = useState<Set<string>>(new Set());

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
    python:     { label: "Python",     active: "bg-blue-600 text-white border-blue-500 shadow-blue-500/30",   inactive: "bg-blue-950/40 text-blue-400 border-blue-900/60 hover:bg-blue-900/40" },
    javascript: { label: "JavaScript", active: "bg-yellow-500 text-slate-900 border-yellow-400 shadow-yellow-500/30", inactive: "bg-yellow-950/40 text-yellow-400 border-yellow-900/60 hover:bg-yellow-900/40" },
    typescript: { label: "TypeScript", active: "bg-cyan-600 text-white border-cyan-500 shadow-cyan-500/30",   inactive: "bg-cyan-950/40 text-cyan-400 border-cyan-900/60 hover:bg-cyan-900/40" },
  };

  const nodePositions = useMemo(() => {
    if (!data.nodes || data.nodes.length === 0) return new Map<string, number>();
    const laidOut = layoutNodes(data.nodes, data.edges);
    const map = new Map<string, number>();
    laidOut.forEach((n) => {
      map.set(n.id, n.position.x);
    });
    return map;
  }, [data]);

  const getEdgeColor = useMemo(() => (sourceId: string, targetId: string) => {
    const sourceX = nodePositions.get(sourceId);
    const targetX = nodePositions.get(targetId);
    if (sourceX === undefined || targetX === undefined) return "#4b5563";
    if (sourceX < targetX) return "#3b82f6";
    if (sourceX > targetX) return "#ef4444";
    return "#10b981";
  }, [nodePositions]);

  useEffect(() => {
    if (!data.nodes || data.nodes.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const laidOutNodes = layoutNodes(data.nodes, data.edges);
    setNodes(laidOutNodes.map(n => ({
      ...n,
      data: { ...n.data, isHighlighted: false, isSearchActive: false }
    })));

    setEdges(data.edges.map((e, index) => {
      const color = getEdgeColor(e.source, e.target);
      return {
        id: `e-${index}`,
        source: e.source,
        target: e.target,
        type: "smoothstep",
        animated: true,
        style: { stroke: color, strokeWidth: 1 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: color,
          width: 16,
          height: 16,
        },
      };
    }));
  }, [data, getEdgeColor]);

  useEffect(() => {
    const isSearchActive = searchQuery.trim() !== "";
    const query = searchQuery.toLowerCase();

    setNodes(prev => prev.map(node => {
      const filename = node.data.id.split("/").pop() || node.data.id;
      const passesSearch = !isSearchActive || filename.toLowerCase().includes(query);
      const passesLang = !isLangFilterActive || langFilter.has(node.data.language?.toLowerCase());
      const combinedActive = isSearchActive || isLangFilterActive;
      const isHighlighted = combinedActive && passesSearch && passesLang;
      return { ...node, data: { ...node.data, isHighlighted, isSearchActive: combinedActive } };
    }));

    setEdges(prev => prev.map(edge => {
      const isSourceMatch = (edge.source.split("/").pop() || edge.source).toLowerCase().includes(query);
      const isTargetMatch = (edge.target.split("/").pop() || edge.target).toLowerCase().includes(query);
      const passesLangSource = !isLangFilterActive || (filteredNodeIds?.has(edge.source) ?? true);
      const passesLangTarget = !isLangFilterActive || (filteredNodeIds?.has(edge.target) ?? true);
      const combinedActive = isSearchActive || isLangFilterActive;
      const isEdgeHighlighted = combinedActive &&
        (!isSearchActive || (isSourceMatch && isTargetMatch)) &&
        passesLangSource && passesLangTarget;
      const defaultColor = getEdgeColor(edge.source, edge.target);

      return {
        ...edge,
        animated: !combinedActive || isEdgeHighlighted,
        style: {
          stroke: combinedActive ? (isEdgeHighlighted ? defaultColor : "#1e293b") : defaultColor,
          strokeWidth: isEdgeHighlighted ? 2 : 1,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: combinedActive ? (isEdgeHighlighted ? defaultColor : "#1e293b") : defaultColor,
          width: 16,
          height: 16,
        },
      };
    }));
  }, [searchQuery, langFilter, isLangFilterActive, filteredNodeIds, getEdgeColor]);

  const onNodeClick = (_event: React.MouseEvent, node: any) => {
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
          {data.nodes.filter((node) => !isLangFilterActive || langFilter.has(node.language.toLowerCase())).map((node) => {
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
                    setCenter(rfn.position.x + 75, rfn.position.y + 25, {
                      zoom: 1.2,
                      duration: 800,
                    });
                    setNodes((nds) =>
                      nds.map((n) => ({
                        ...n,
                        data: {
                          ...n.data,
                          isHighlighted: n.id === node.id,
                          isSearchActive: true,
                        },
                      }))
                    );
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
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 h-full relative">
        {/* Search / Filter Bar */}
        <div className="absolute top-4 left-4 z-10 w-72 bg-slate-900/90 border border-slate-800 backdrop-blur-md rounded-xl p-3 shadow-2xl flex flex-col gap-2">
          {/* Language Filter Pills */}
          {availableLangs.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Language</span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setLangFilter(new Set())}
                  className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-all shadow-sm cursor-pointer ${
                    !isLangFilterActive
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
                      className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-all shadow-sm cursor-pointer ${
                        isActive ? meta.active : meta.inactive
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
              setNodes((nds) =>
                nds.map((n) => ({
                  ...n,
                  data: {
                    ...n.data,
                    isHighlighted: false,
                    isSearchActive: false,
                  },
                }))
              );
              setSearchQuery("");
              setLangFilter(new Set());
              fitView({ duration: 800 });
            }}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-2 px-3 rounded-lg transition-all flex items-center justify-center gap-1.5 shadow-md shadow-indigo-950/50 cursor-pointer"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            Recenter / Fit View
          </button>

          {/* Edge color legend */}
          <div className="border-t border-slate-800 pt-2 flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Edge Legend</span>
            <div className="flex items-center gap-2">
              <span className="w-4 h-0.5 bg-blue-500 rounded-full inline-block"></span>
              <span className="text-[10px] text-slate-400">Forward dependency</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-0.5 bg-red-500 rounded-full inline-block"></span>
              <span className="text-[10px] text-slate-400">Backward / cyclic</span>
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
          fitView
          minZoom={0.1}
          maxZoom={1.5}
        >
          <Controls className="bg-slate-900 border border-slate-800 text-slate-100 rounded-lg p-1" />
          <MiniMap
            nodeColor={(node) => {
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
