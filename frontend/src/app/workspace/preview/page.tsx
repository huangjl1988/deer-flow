"use client";

import { EyeIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  WorkspaceBody,
  WorkspaceContainer,
  WorkspaceHeader,
} from "@/components/workspace/workspace-container";
import { useI18n } from "@/core/i18n/hooks";

interface WorkflowSummary {
  id: string;
  name: string;
  status: string;
}

interface WorkflowRun {
  id: string;
  workflow_id: string;
  status: string;
  current_step: number;
  total_steps: number;
  created_at: string;
}

export default function PreviewPage() {
  const { t } = useI18n();
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>("");
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [previewContent, setPreviewContent] = useState("");
  const [previewType, setPreviewType] = useState<"text" | "json" | "markdown">("text");

  useEffect(() => {
    document.title = `${t.sidebar.preview} - ${t.pages.appName}`;
  }, [t.sidebar.preview, t.pages.appName]);

  useEffect(() => {
    fetch("/api/workflows?limit=100")
      .then((r) => r.ok ? r.json() : [])
      .then((data: WorkflowSummary[]) => {
        setWorkflows(data);
        if (data.length > 0) {
          const first = data[0];
          if (first) setSelectedWorkflowId(first.id);
        }
      })
      .catch(() => setWorkflows([]));
  }, []);

  useEffect(() => {
    if (!selectedWorkflowId) return;
    fetch(`/api/workflows/${selectedWorkflowId}/runs?limit=20`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: WorkflowRun[]) => {
        setRuns(data);
        if (data.length > 0) {
          const first = data[0];
          if (first) setSelectedRunId(first.id);
        }
      })
      .catch(() => setRuns([]));
  }, [selectedWorkflowId]);

  useEffect(() => {
    if (!selectedRunId || !selectedWorkflowId) {
      setPreviewContent("");
      return;
    }
    fetch(`/api/workflows/${selectedWorkflowId}/runs/${selectedRunId}/steps`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: Array<{ node_name: string; output: Record<string, unknown> | null; status: string }>) => {
        if (data.length > 0) {
          const last = data[data.length - 1];
          if (last?.output) {
            setPreviewContent(JSON.stringify(last.output, null, 2));
            setPreviewType("json");
          } else {
            setPreviewContent("No output data in the last step.");
            setPreviewType("text");
          }
        } else {
          setPreviewContent("No steps available for this run.");
          setPreviewType("text");
        }
      })
      .catch(() => setPreviewContent("Failed to load preview."));
  }, [selectedWorkflowId, selectedRunId]);

  const handleRefresh = () => {
    if (selectedRunId && selectedWorkflowId) {
      // Re-trigger the effect by toggling run id
      const current = selectedRunId;
      setSelectedRunId("");
      setTimeout(() => setSelectedRunId(current), 100);
    }
  };

  return (
    <WorkspaceContainer>
      <WorkspaceHeader />
      <WorkspaceBody>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t.sidebar.preview}</h1>
            <p className="text-sm text-muted-foreground">Preview workflow and agent output results</p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={selectedWorkflowId} onValueChange={setSelectedWorkflowId}>
              <SelectTrigger className="h-9 w-56">
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
              <SelectTrigger className="h-9 w-64">
                <SelectValue placeholder="Select run" />
              </SelectTrigger>
              <SelectContent>
                {runs.map((run) => (
                  <SelectItem key={run.id} value={run.id}>
                    Run {run.id.slice(-8)} ({run.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={handleRefresh}>
              <RefreshCwIcon className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant={previewType === "json" ? "default" : "outline"}>JSON</Badge>
          <Badge variant={previewType === "text" ? "default" : "outline"}>Text</Badge>
          {selectedRunId && (
            <>
              <Separator orientation="vertical" className="mx-2 h-4" />
              <span className="text-xs text-muted-foreground">
                Previewing run output
              </span>
            </>
          )}
        </div>

        <div className="flex h-[calc(100%-180px)] overflow-hidden rounded-lg border">
          {previewContent ? (
            <div className="flex-1 overflow-auto p-4">
              <pre className="whitespace-pre-wrap font-mono text-sm">{previewContent}</pre>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <EyeIcon className="mb-2 h-12 w-12 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                Select a workflow and run to preview output results
              </p>
            </div>
          )}
        </div>
      </WorkspaceBody>
    </WorkspaceContainer>
  );
}
