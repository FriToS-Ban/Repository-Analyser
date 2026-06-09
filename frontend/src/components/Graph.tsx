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
  const { fitView } = useReactFlow();
  const nodeTypes = useMemo(() => ({ fileNode: FileNode }), []);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [searchQuery, setSearchQuery] = useState("");

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
  }, [data]);

  useEffect(() => {
    const isSearchActive = searchQuery.trim() !== "";
    const query = searchQuery.toLowerCase();

    setNodes(prev => prev.map(node => {
      const filename = node.data.id.split("/").pop() || node.data.id;
      const isHighlighted = isSearchActive && filename.toLowerCase().includes(query);
      return { ...node, data: { ...node.data, isHighlighted, isSearchActive } };
    }));

    setEdges(prev => prev.map(edge => {
      const isSourceMatch = (edge.source.split("/").pop() || edge.source).toLowerCase().includes(query);
      const isTargetMatch = (edge.target.split("/").pop() || edge.target).toLowerCase().includes(query);
      const isEdgeHighlighted = isSearchActive && isSourceMatch && isTargetMatch;
      const defaultColor = getEdgeColor(edge.source, edge.target);

      return {
        ...edge,
        animated: !isSearchActive || isEdgeHighlighted,
        style: {
          stroke: isSearchActive ? (isEdgeHighlighted ? defaultColor : "#1e293b") : defaultColor,
          strokeWidth: isEdgeHighlighted ? 2 : 1,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isSearchActive ? (isEdgeHighlighted ? defaultColor : "#1e293b") : defaultColor,
          width: 16,
          height: 16,
        },
      };
    }));
  }, [searchQuery]);

  const onNodeClick = (_event: React.MouseEvent, node: any) => {
    onSelectFile({
      path: node.data.id,
      language: node.data.language,
      loc: node.data.loc,
    });
  };

  return (
    <div className="w-full h-full relative">
      {/* Search / Filter Bar */}
      <div className="absolute top-4 left-4 z-10 w-72 bg-slate-900/90 border border-slate-800 backdrop-blur-md rounded-xl p-3 shadow-2xl flex flex-col gap-2">
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
          onClick={() => fitView({ duration: 800 })}
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
  );
};

export const Graph: React.FC<GraphProps> = (props) => {
  return (
    <ReactFlowProvider>
      <GraphCanvas {...props} />
    </ReactFlowProvider>
  );
};
