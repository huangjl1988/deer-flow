"use client";

import {
  BotIcon,
  CircleIcon,
  CodeIcon,
  DiamondIcon,
  FileInputIcon,
  FileOutputIcon,
  PlayIcon,
  SaveIcon,
  SquareIcon,
  Undo2Icon,
  Redo2Icon,
  WrenchIcon,
  ZoomInIcon,
  ZoomOutIcon,
  CheckCircle2Icon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  WorkspaceBody,
  WorkspaceContainer,
  WorkspaceHeader,
} from "@/components/workspace/workspace-container";
import { useI18n } from "@/core/i18n/hooks";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkflowNode {
  id: string;
  node_type: "agent" | "tool" | "condition" | "input" | "output";
  name: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
}

interface WorkflowEdge {
  id: string;
  source_node_id: string;
  target_node_id: string;
  condition: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Node palette items
// ---------------------------------------------------------------------------

const NODE_TYPES = [
  { type: "agent" as const, label: "Agent Node", icon: BotIcon, color: "text-blue-500" },
  { type: "tool" as const, label: "Tool Node", icon: WrenchIcon, color: "text-purple-500" },
  { type: "condition" as const, label: "Condition", icon: DiamondIcon, color: "text-amber-500" },
  { type: "input" as const, label: "Input", icon: FileInputIcon, color: "text-green-500" },
  { type: "output" as const, label: "Output", icon: FileOutputIcon, color: "text-orange-500" },
];

// ---------------------------------------------------------------------------
// Canvas node rendering
// ---------------------------------------------------------------------------

function NodeIcon({ type }: { type: WorkflowNode["node_type"] }) {
  const config = NODE_TYPES.find((n) => n.type === type);
  if (!config) return <CircleIcon className="h-4 w-4" />;
  const Icon = config.icon;
  return <Icon className={`h-4 w-4 ${config.color}`} />;
}

const NODE_COLORS: Record<string, string> = {
  agent: "border-blue-500/50 bg-blue-500/5",
  tool: "border-purple-500/50 bg-purple-500/5",
  condition: "border-amber-500/50 bg-amber-500/5",
  input: "border-green-500/50 bg-green-500/5",
  output: "border-orange-500/50 bg-orange-500/5",
};

// ---------------------------------------------------------------------------
// Main Editor component
// ---------------------------------------------------------------------------

export default function EditorPage() {
  const { t } = useI18n();
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [edges, setEdges] = useState<WorkflowEdge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState("Untitled Workflow");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [history, setHistory] = useState<{ nodes: WorkflowNode[]; edges: WorkflowEdge[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ nodeId: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [connecting, setConnecting] = useState<{ fromId: string } | null>(null);

  useEffect(() => {
    document.title = `Editor - ${t.pages.appName}`;
  }, [t.pages.appName]);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  // History management
  const pushHistory = useCallback((newNodes: WorkflowNode[], newEdges: WorkflowEdge[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({ nodes: newNodes, edges: newEdges });
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const prev = history[historyIndex - 1];
      if (prev) {
        setNodes(prev.nodes);
        setEdges(prev.edges);
        setHistoryIndex(historyIndex - 1);
      }
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const next = history[historyIndex + 1];
      if (next) {
        setNodes(next.nodes);
        setEdges(next.edges);
        setHistoryIndex(historyIndex + 1);
      }
    }
  }, [history, historyIndex]);

  // Add node from palette
  const addNode = useCallback((type: WorkflowNode["node_type"]) => {
    const newNode: WorkflowNode = {
      id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      node_type: type,
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${nodes.length + 1}`,
      config: {},
      position: { x: 200 + nodes.length * 40, y: 150 + nodes.length * 30 },
    };
    const newNodes = [...nodes, newNode];
    setNodes(newNodes);
    pushHistory(newNodes, edges);
    setSelectedNodeId(newNode.id);
  }, [nodes, edges, pushHistory]);

  // Node dragging
  const onNodeMouseDown = useCallback((e: React.MouseEvent, node: WorkflowNode) => {
    e.stopPropagation();
    setSelectedNodeId(node.id);
    dragRef.current = {
      nodeId: node.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: node.position.x,
      origY: node.position.y,
    };
  }, []);

  const onCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current) return;
    const { nodeId, startX, startY, origX, origY } = dragRef.current;
    const dx = (e.clientX - startX) / zoom;
    const dy = (e.clientY - startY) / zoom;
    setNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId
          ? { ...n, position: { x: origX + dx, y: origY + dy } }
          : n,
      ),
    );
  }, [zoom]);

  const onCanvasMouseUp = useCallback(() => {
    if (dragRef.current) {
      pushHistory(nodes, edges);
      dragRef.current = null;
    }
  }, [nodes, edges, pushHistory]);

  // Canvas pan
  const onCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.canvasBg === "true") {
      setSelectedNodeId(null);
      setConnecting(null);
      const startX = e.clientX;
      const startY = e.clientY;
      const origPan = { ...pan };
      const onMove = (ev: MouseEvent) => {
        setPan({ x: origPan.x + (ev.clientX - startX), y: origPan.y + (ev.clientY - startY) });
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    }
  }, [pan]);

  // Connect nodes
  const onNodeOutputClick = useCallback((nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (connecting?.fromId === nodeId) {
      setConnecting(null);
      return;
    }
    if (connecting) {
      if (connecting.fromId !== nodeId) {
        const newEdge: WorkflowEdge = {
          id: `edge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          source_node_id: connecting.fromId,
          target_node_id: nodeId,
          condition: {},
        };
        const newEdges = [...edges, newEdge];
        setEdges(newEdges);
        pushHistory(nodes, newEdges);
      }
      setConnecting(null);
    } else {
      setConnecting({ fromId: nodeId });
    }
  }, [connecting, edges, nodes, pushHistory]);

  // Delete selected node
  const deleteSelectedNode = useCallback(() => {
    if (!selectedNodeId) return;
    const newNodes = nodes.filter((n) => n.id !== selectedNodeId);
    const newEdges = edges.filter((e) => e.source_node_id !== selectedNodeId && e.target_node_id !== selectedNodeId);
    setNodes(newNodes);
    setEdges(newEdges);
    setSelectedNodeId(null);
    pushHistory(newNodes, newEdges);
  }, [selectedNodeId, nodes, edges, pushHistory]);

  // Update node properties
  const updateNodeProp = useCallback((prop: "name" | "config", value: string | Record<string, unknown>) => {
    if (!selectedNodeId) return;
    const newNodes = nodes.map((n) =>
      n.id === selectedNodeId ? { ...n, [prop]: value } : n,
    );
    setNodes(newNodes);
  }, [selectedNodeId, nodes]);

  // Save workflow
  const handleSave = useCallback(async () => {
    if (!workflowId) {
      // Create new workflow
      try {
        const resp = await fetch("/api/workflows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: workflowName }),
        });
        if (!resp.ok) throw new Error("Failed to create workflow");
        const wf = await resp.json();
        setWorkflowId(wf.id);
        // Save version
        await fetch(`/api/workflows/${wf.id}/versions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: workflowName, nodes, edges, config: {} }),
        });
      } catch {
        setSaveStatus("idle");
      }
      return;
    }
    setSaveStatus("saving");
    try {
      await fetch(`/api/workflows/${workflowId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: workflowName, nodes, edges, config: {} }),
      });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("idle");
    }
  }, [workflowId, workflowName, nodes, edges]);

  // Run All
  const handleRunAll = useCallback(async () => {
    if (!workflowId) return;
    try {
      await fetch(`/api/workflows/${workflowId}/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input_data: {} }),
      });
    } catch {
      // Ignore
    }
  }, [workflowId]);

  return (
    <WorkspaceContainer>
      <WorkspaceHeader />
      <WorkspaceBody>
        <div className="flex h-full flex-col">
          {/* Toolbar */}
          <div className="flex items-center gap-2 border-b px-4 py-2">
            <Input
              value={workflowName}
              onChange={(e) => setWorkflowName(e.target.value)}
              className="h-8 w-64"
              placeholder="Workflow name"
            />
            <Button size="sm" variant="outline" onClick={handleSave} disabled={saveStatus === "saving"}>
              {saveStatus === "saving" ? <SaveIcon className="h-4 w-4 animate-pulse" /> :
               saveStatus === "saved" ? <CheckCircle2Icon className="h-4 w-4 text-green-500" /> :
               <SaveIcon className="h-4 w-4" />}
              <span className="ml-1">{saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved" : "Save"}</span>
            </Button>
            <Button size="sm" variant="default" onClick={handleRunAll} disabled={!workflowId}>
              <PlayIcon className="h-4 w-4" />
              <span className="ml-1">Run All</span>
            </Button>
            <Separator orientation="vertical" className="mx-1 h-6" />
            <Button size="sm" variant="ghost" onClick={undo} disabled={historyIndex <= 0}>
              <Undo2Icon className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={redo} disabled={historyIndex >= history.length - 1}>
              <Redo2Icon className="h-4 w-4" />
            </Button>
            <Separator orientation="vertical" className="mx-1 h-6" />
            <Button size="sm" variant="ghost" onClick={() => setZoom((z) => Math.min(z + 0.1, 2))}>
              <ZoomInIcon className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setZoom((z) => Math.max(z - 0.1, 0.3))}>
              <ZoomOutIcon className="h-4 w-4" />
            </Button>
            <span className="text-muted-foreground text-xs">{Math.round(zoom * 100)}%</span>
            {connecting && (
              <Badge variant="secondary" className="ml-2">
                Connecting from {connecting.fromId.slice(-6)}...click target
              </Badge>
            )}
          </div>

          {/* Main editor area */}
          <div className="flex flex-1 overflow-hidden">
            {/* Left: Node palette */}
            <div className="w-52 shrink-0 border-r p-3">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Node Palette
              </h3>
              <div className="flex flex-col gap-2">
                {NODE_TYPES.map((nt) => {
                  const Icon = nt.icon;
                  return (
                    <button
                      key={nt.type}
                      onClick={() => addNode(nt.type)}
                      className="flex items-center gap-2 rounded-md border border-border p-2 text-sm transition-colors hover:bg-accent hover:border-accent"
                    >
                      <Icon className={`h-4 w-4 ${nt.color}`} />
                      <span>{nt.label}</span>
                    </button>
                  );
                })}
              </div>
              <Separator className="my-4" />
              <div className="text-xs text-muted-foreground">
                <p className="mb-1 font-medium">Tips:</p>
                <ul className="space-y-1">
                  <li>Click a node to select</li>
                  <li>Drag nodes to move</li>
                  <li>Click output dot to connect</li>
                  <li>Del key to delete node</li>
                </ul>
              </div>
            </div>

            {/* Center: Canvas */}
            <div
              ref={canvasRef}
              className="relative flex-1 overflow-hidden bg-muted/30"
              onMouseDown={onCanvasMouseDown}
              onMouseMove={onCanvasMouseMove}
              onMouseUp={onCanvasMouseUp}
              onKeyDown={(e) => {
                if (e.key === "Delete" || e.key === "Backspace") {
                  if (selectedNodeId) deleteSelectedNode();
                }
              }}
              tabIndex={0}
              style={{
                backgroundImage: "radial-gradient(circle, hsl(var(--muted-foreground) / 0.15) 1px, transparent 1px)",
                backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
                backgroundPosition: `${pan.x}px ${pan.y}px`,
                cursor: dragRef.current ? "grabbing" : "default",
              }}
            >
              <div
                data-canvas-bg="true"
                className="absolute inset-0"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: "0 0",
                }}
              >
                {/* Edges */}
                <svg className="pointer-events-none absolute inset-0 h-full w-full" style={{ overflow: "visible" }}>
                  {edges.map((edge) => {
                    const source = nodes.find((n) => n.id === edge.source_node_id);
                    const target = nodes.find((n) => n.id === edge.target_node_id);
                    if (!source || !target) return null;
                    const x1 = source.position.x + 120;
                    const y1 = source.position.y + 35;
                    const x2 = target.position.x;
                    const y2 = target.position.y + 35;
                    const midX = (x1 + x2) / 2;
                    return (
                      <g key={edge.id}>
                        <path
                          d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                          fill="none"
                          stroke="hsl(var(--muted-foreground))"
                          strokeWidth={2}
                          markerEnd="url(#arrowhead)"
                        />
                      </g>
                    );
                  })}
                  <defs>
                    <marker
                      id="arrowhead"
                      markerWidth="10"
                      markerHeight="7"
                      refX="8"
                      refY="3.5"
                      orient="auto"
                    >
                      <polygon points="0 0, 10 3.5, 0 7" fill="hsl(var(--muted-foreground))" />
                    </marker>
                  </defs>
                </svg>

                {/* Nodes */}
                {nodes.map((node) => (
                  <div
                    key={node.id}
                    className={`absolute w-30 select-none rounded-md border-2 px-3 py-2 ${NODE_COLORS[node.node_type] ?? ""} ${
                      selectedNodeId === node.id ? "ring-2 ring-primary" : ""
                    } cursor-grab active:cursor-grabbing`}
                    style={{
                      left: node.position.x,
                      top: node.position.y,
                      width: 120,
                    }}
                    onMouseDown={(e) => onNodeMouseDown(e, node)}
                  >
                    <div className="flex items-center gap-2">
                      <NodeIcon type={node.node_type} />
                      <span className="flex-1 truncate text-xs font-medium">{node.name}</span>
                    </div>
                    {/* Connection dots */}
                    <button
                      className="absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-background bg-muted-foreground hover:bg-primary"
                      onClick={(e) => onNodeOutputClick(node.id, e)}
                      title="Click to connect"
                    />
                    <div
                      className={`absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-background bg-muted-foreground ${
                        connecting?.fromId ? "hover:bg-primary" : ""
                      }`}
                    />
                  </div>
                ))}

                {nodes.length === 0 && (
                  <div
                    data-canvas-bg="true"
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center"
                  >
                    <CodeIcon className="mx-auto mb-2 h-12 w-12 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">
                      Drag nodes from the left panel to start building your DAG
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Properties panel */}
            <div className="w-72 shrink-0 border-l">
              {selectedNode ? (
                <div className="flex h-full flex-col">
                  <div className="border-b px-4 py-3">
                    <h3 className="text-sm font-semibold">Properties</h3>
                    <p className="text-xs text-muted-foreground">{selectedNode.node_type} node</p>
                  </div>
                  <ScrollArea className="flex-1">
                    <div className="space-y-4 p-4">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">
                          Node Name
                        </label>
                        <Input
                          value={selectedNode.name}
                          onChange={(e) => updateNodeProp("name", e.target.value)}
                          className="h-8"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">
                          Node ID
                        </label>
                        <code className="block rounded bg-muted px-2 py-1 text-xs">
                          {selectedNode.id}
                        </code>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">
                          Position
                        </label>
                        <div className="flex gap-2 text-xs">
                          <span>x: {Math.round(selectedNode.position.x)}</span>
                          <span>y: {Math.round(selectedNode.position.y)}</span>
                        </div>
                      </div>
                      <Separator />
                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">
                          Configuration (JSON)
                        </label>
                        <Textarea
                          value={JSON.stringify(selectedNode.config, null, 2)}
                          onChange={(e) => {
                            try {
                              const parsed = JSON.parse(e.target.value);
                              updateNodeProp("config", parsed);
                            } catch {
                              // Invalid JSON, don't update
                            }
                          }}
                          className="h-40 font-mono text-xs"
                        />
                      </div>
                      {selectedNode.node_type === "agent" && (
                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">
                            Agent Settings
                          </label>
                          <Tabs defaultValue="model">
                            <TabsList variant="line" className="w-full">
                              <TabsTrigger value="model" className="text-xs">Model</TabsTrigger>
                              <TabsTrigger value="skills" className="text-xs">Skills</TabsTrigger>
                              <TabsTrigger value="tools" className="text-xs">Tools</TabsTrigger>
                            </TabsList>
                            <TabsContent value="model" className="mt-2">
                              <Input placeholder="model name" className="h-8 text-xs" />
                            </TabsContent>
                            <TabsContent value="skills" className="mt-2">
                              <p className="text-xs text-muted-foreground">No skills assigned</p>
                            </TabsContent>
                            <TabsContent value="tools" className="mt-2">
                              <p className="text-xs text-muted-foreground">No tools assigned</p>
                            </TabsContent>
                          </Tabs>
                        </div>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        className="w-full"
                        onClick={deleteSelectedNode}
                      >
                        <SquareIcon className="h-3 w-3" />
                        Delete Node
                      </Button>
                    </div>
                  </ScrollArea>
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center p-4 text-center">
                  <CodeIcon className="mb-2 h-10 w-10 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">
                    Select a node to edit its properties
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </WorkspaceBody>
    </WorkspaceContainer>
  );
}
