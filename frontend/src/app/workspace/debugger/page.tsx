"use client";

import {
  BugIcon,
  ChevronRightIcon,
  CircleIcon,
  ClockIcon,
  FileJsonIcon,
  PauseIcon,
  PlayIcon,
  SkipForwardIcon,
  TerminalIcon,
  AlertCircleIcon,
  CheckCircle2Icon,
  LoaderIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  WorkspaceBody,
  WorkspaceContainer,
  WorkspaceHeader,
} from "@/components/workspace/workspace-container";
import { useI18n } from "@/core/i18n/hooks";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkflowRun {
  id: string;
  workflow_id: string;
  status: string;
  current_step: number;
  total_steps: number;
  run_id: string | null;
  thread_id: string | null;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

interface RunStep {
  id: string;
  workflow_run_id: string;
  node_id: string;
  node_name: string;
  step_index: number;
  status: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  checkpoint_id: string | null;
}

interface WorkflowSummary {
  id: string;
  name: string;
  status: string;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_ICONS: Record<string, typeof CircleIcon> = {
  pending: CircleIcon,
  running: LoaderIcon,
  success: CheckCircle2Icon,
  error: AlertCircleIcon,
  cancelled: CircleIcon,
  paused: PauseIcon,
};

const STATUS_COLORS: Record<string, string> = {
  pending: "text-muted-foreground",
  running: "text-blue-500",
  success: "text-green-500",
  error: "text-red-500",
  cancelled: "text-muted-foreground",
  paused: "text-amber-500",
};

function StatusIcon({ status }: { status: string }) {
  const Icon = STATUS_ICONS[status] ?? CircleIcon;
  const color = STATUS_COLORS[status] ?? "text-muted-foreground";
  return <Icon className={`h-4 w-4 ${color} ${status === "running" ? "animate-spin" : ""}`} />;
}

// ---------------------------------------------------------------------------
// Main Debugger component
// ---------------------------------------------------------------------------

export default function DebuggerPage() {
  const { t } = useI18n();
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>("");
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [steps, setSteps] = useState<RunStep[]>([]);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [breakpoints, setBreakpoints] = useState<Set<string>>(new Set());

  useEffect(() => {
    document.title = `Debugger - ${t.pages.appName}`;
  }, [t.pages.appName]);

  // Fetch workflows
  useEffect(() => {
    fetch("/api/workflows?limit=100")
      .then((r) => r.ok ? r.json() : [])
      .then((data: WorkflowSummary[]) => {
        setWorkflows(data);
        if (data.length > 0 && !selectedWorkflowId) {
          const first = data[0];
          if (first) setSelectedWorkflowId(first.id);
        }
      })
      .catch(() => setWorkflows([]));
  }, []);

  // Fetch runs when workflow changes
  useEffect(() => {
    if (!selectedWorkflowId) {
      setRuns([]);
      return;
    }
    fetch(`/api/workflows/${selectedWorkflowId}/runs?limit=50`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: WorkflowRun[]) => {
        setRuns(data);
        if (data.length > 0) {
          const first = data[0];
          if (first) setSelectedRunId(first.id);
        } else {
          setSelectedRunId("");
        }
      })
      .catch(() => setRuns([]));
  }, [selectedWorkflowId]);

  // Fetch steps when run changes
  useEffect(() => {
    if (!selectedRunId || !selectedWorkflowId) {
      setSteps([]);
      return;
    }
    fetch(`/api/workflows/${selectedWorkflowId}/runs/${selectedRunId}/steps`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: RunStep[]) => {
        setSteps(data);
        if (data.length > 0) {
          const first = data[0];
          if (first) setSelectedStepId(first.id);
        }
      })
      .catch(() => setSteps([]));
  }, [selectedWorkflowId, selectedRunId]);

  const selectedStep = steps.find((s) => s.id === selectedStepId) ?? null;
  const selectedRun = runs.find((r) => r.id === selectedRunId) ?? null;

  const toggleBreakpoint = (stepId: string) => {
    setBreakpoints((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };

  return (
    <WorkspaceContainer>
      <WorkspaceHeader />
      <WorkspaceBody>
        <div className="flex h-full flex-col">
          {/* Top bar: workflow + run selector + debug controls */}
          <div className="flex items-center gap-3 border-b px-4 py-2">
            <BugIcon className="h-5 w-5 text-primary" />
            <Select value={selectedWorkflowId} onValueChange={setSelectedWorkflowId}>
              <SelectTrigger className="h-8 w-56">
                <SelectValue placeholder="Select workflow" />
              </SelectTrigger>
              <SelectContent>
                {workflows.map((wf) => (
                  <SelectItem key={wf.id} value={wf.id}>
                    {wf.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedRunId} onValueChange={setSelectedRunId}>
              <SelectTrigger className="h-8 w-64">
                <SelectValue placeholder="Select run" />
              </SelectTrigger>
              <SelectContent>
                {runs.map((run) => (
                  <SelectItem key={run.id} value={run.id}>
                    <span className="flex items-center gap-2">
                      <StatusIcon status={run.status} />
                      Run {run.id.slice(-8)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedRun && (
              <div className="flex items-center gap-2">
                <StatusIcon status={selectedRun.status} />
                <Badge variant="outline" className="text-xs">
                  {selectedRun.status}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Step {selectedRun.current_step}/{selectedRun.total_steps}
                </span>
              </div>
            )}
            <Separator orientation="vertical" className="mx-1 h-6" />
            <Button size="sm" variant="outline" disabled>
              <PlayIcon className="h-3 w-3" />
              Continue
            </Button>
            <Button size="sm" variant="outline" disabled>
              <SkipForwardIcon className="h-3 w-3" />
              Step Over
            </Button>
            <Button size="sm" variant="outline" disabled>
              <PauseIcon className="h-3 w-3" />
              Pause
            </Button>
          </div>

          {/* Main debugger layout */}
          <div className="flex flex-1 overflow-hidden">
            {/* Left: Call tree / step list */}
            <div className="w-64 shrink-0 border-r">
              <div className="border-b px-3 py-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Call Tree ({steps.length})
                </h3>
              </div>
              <ScrollArea className="h-[calc(100%-2.5rem)]">
                {steps.length === 0 ? (
                  <div className="flex h-32 flex-col items-center justify-center text-center">
                    <TerminalIcon className="mb-1 h-8 w-8 text-muted-foreground/30" />
                    <p className="text-xs text-muted-foreground">
                      {selectedRunId ? "No steps recorded" : "Select a run"}
                    </p>
                  </div>
                ) : (
                  <div className="py-1">
                    {steps.map((step) => (
                      <button
                        key={step.id}
                        onClick={() => setSelectedStepId(step.id)}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent ${
                          selectedStepId === step.id ? "bg-accent" : ""
                        }`}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleBreakpoint(step.id);
                          }}
                          className={`h-2.5 w-2.5 shrink-0 rounded-full border ${
                            breakpoints.has(step.id)
                              ? "border-red-500 bg-red-500"
                              : "border-muted-foreground/30"
                          }`}
                          title="Toggle breakpoint"
                        />
                        <StatusIcon status={step.status} />
                        <span className="flex-1 truncate">{step.node_name}</span>
                        <ChevronRightIcon className="h-3 w-3 text-muted-foreground/30" />
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* Center: Call chain visualization */}
            <div className="flex-1 overflow-hidden">
              <div className="border-b px-4 py-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Execution Flow
                </h3>
              </div>
              <ScrollArea className="h-[calc(100%-2.5rem)]">
                <div className="p-4">
                  {steps.length === 0 ? (
                    <div className="flex h-48 flex-col items-center justify-center text-center">
                      <BugIcon className="mb-2 h-12 w-12 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">
                        Select a workflow and run to inspect execution steps
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {steps.map((step, idx) => (
                        <div
                          key={step.id}
                          className={`flex items-center gap-3 rounded-lg border p-3 transition-colors cursor-pointer ${
                            selectedStepId === step.id
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-accent"
                          }`}
                          onClick={() => setSelectedStepId(step.id)}
                        >
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium">
                            {idx + 1}
                          </div>
                          <StatusIcon status={step.status} />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{step.node_name}</span>
                              <Badge variant="outline" className="text-xs">{step.status}</Badge>
                              {breakpoints.has(step.id) && (
                                <Badge variant="destructive" className="text-xs">
                                  Breakpoint
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              {step.started_at && (
                                <span className="flex items-center gap-1">
                                  <ClockIcon className="h-3 w-3" />
                                  {new Date(step.started_at).toLocaleTimeString()}
                                </span>
                              )}
                              {step.checkpoint_id && (
                                <span className="truncate font-mono">
                                  ckpt: {step.checkpoint_id.slice(-12)}
                                </span>
                              )}
                            </div>
                          </div>
                          {step.error && (
                            <AlertCircleIcon className="h-4 w-4 text-red-500" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Right: Step detail */}
            <div className="w-96 shrink-0 border-l">
              {selectedStep ? (
                <div className="flex h-full flex-col">
                  <div className="border-b px-4 py-2">
                    <h3 className="text-sm font-semibold">{selectedStep.node_name}</h3>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Step {selectedStep.step_index}</span>
                      <span>•</span>
                      <StatusIcon status={selectedStep.status} />
                      <span>{selectedStep.status}</span>
                    </div>
                  </div>
                  <ScrollArea className="flex-1">
                    <div className="p-4">
                      <Tabs defaultValue="input">
                        <TabsList variant="line" className="w-full">
                          <TabsTrigger value="input" className="text-xs">
                            <FileJsonIcon className="mr-1 h-3 w-3" />
                            Input
                          </TabsTrigger>
                          <TabsTrigger value="output" className="text-xs">
                            <FileJsonIcon className="mr-1 h-3 w-3" />
                            Output
                          </TabsTrigger>
                          <TabsTrigger value="error" className="text-xs">
                            <AlertCircleIcon className="mr-1 h-3 w-3" />
                            Error
                          </TabsTrigger>
                        </TabsList>
                        <TabsContent value="input" className="mt-3">
                          <pre className="overflow-auto rounded-md bg-muted p-3 text-xs">
                            {JSON.stringify(selectedStep.input, null, 2)}
                          </pre>
                        </TabsContent>
                        <TabsContent value="output" className="mt-3">
                          {selectedStep.output ? (
                            <pre className="overflow-auto rounded-md bg-muted p-3 text-xs">
                              {JSON.stringify(selectedStep.output, null, 2)}
                            </pre>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              No output recorded for this step.
                            </p>
                          )}
                        </TabsContent>
                        <TabsContent value="error" className="mt-3">
                          {selectedStep.error ? (
                            <pre className="overflow-auto rounded-md bg-red-500/10 p-3 text-xs text-red-500">
                              {selectedStep.error}
                            </pre>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              No errors for this step.
                            </p>
                          )}
                        </TabsContent>
                      </Tabs>
                      <Separator className="my-4" />
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Node ID</span>
                          <code className="rounded bg-muted px-2 py-0.5">
                            {selectedStep.node_id}
                          </code>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Started</span>
                          <span>
                            {selectedStep.started_at
                              ? new Date(selectedStep.started_at).toLocaleString()
                              : "—"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Finished</span>
                          <span>
                            {selectedStep.finished_at
                              ? new Date(selectedStep.finished_at).toLocaleString()
                              : "—"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Duration</span>
                          <span>
                            {selectedStep.started_at && selectedStep.finished_at
                              ? `${(
                                  new Date(selectedStep.finished_at).getTime() -
                                  new Date(selectedStep.started_at).getTime()
                                ).toFixed(0)}ms`
                              : "—"}
                          </span>
                        </div>
                        {selectedStep.checkpoint_id && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Checkpoint</span>
                            <code className="rounded bg-muted px-2 py-0.5">
                              {selectedStep.checkpoint_id}
                            </code>
                          </div>
                        )}
                      </div>
                    </div>
                  </ScrollArea>
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center p-4 text-center">
                  <FileJsonIcon className="mb-2 h-10 w-10 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">
                    Select a step to inspect its input/output
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
