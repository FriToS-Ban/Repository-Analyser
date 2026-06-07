import React, { useMemo, useEffect } from "react";
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
} from "reactflow";
import "reactflow/dist/style.css";
import { FileNode } from "./FileNode";

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
      data: { id: n.id, language: n.language, loc: n.loc },
      position: {
        x: lvl * HORIZONTAL_SPACING + 150,
        y: yPos + 350,
      },
    };
  });
};

export const Graph: React.FC<GraphProps> = ({ data, onSelectFile }) => {
  const nodeTypes = useMemo(() => ({ fileNode: FileNode }), []);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    if (!data.nodes || data.nodes.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

    // Apply layout positions
    const laidOutNodes = layoutNodes(data.nodes, data.edges);

    const formattedEdges = data.edges.map((e, index) => ({
      id: `e-${index}`,
      source: e.source,
      target: e.target,
      type: "smoothstep",
      animated: true,
      style: { stroke: "#4b5563" },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: "#4b5563",
        width: 16,
        height: 16,
      },
    }));

    setNodes(laidOutNodes);
    setEdges(formattedEdges);
  }, [data, setNodes, setEdges]);

  const onNodeClick = (_event: React.MouseEvent, node: any) => {
    onSelectFile({
      path: node.data.id,
      language: node.data.language,
      loc: node.data.loc,
    });
  };

  return (
    <div className="w-full h-full relative">
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
