"use client";

import { PlusIcon, Trash2Icon, WorkflowIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  WorkspaceBody,
  WorkspaceContainer,
  WorkspaceHeader,
} from "@/components/workspace/workspace-container";
import { useI18n } from "@/core/i18n/hooks";

interface WorkflowSummary {
  id: string;
  name: string;
  description: string;
  status: string;
  current_version: number;
  team_id: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

interface WorkflowStats {
  total_workflows: number;
  active_workflows: number;
  draft_workflows: number;
  archived_workflows: number;
  total_runs: number;
}

interface WorkflowRunSummary {
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

const STATUS_COLORS: Record<string, string> = {
  active: "default",
  draft: "secondary",
  archived: "outline",
};

export default function WorkflowsPage() {
  const { t } = useI18n();
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [stats, setStats] = useState<WorkflowStats | null>(null);
  const [filter, setFilter] = useState("all");
  const [isOpen, setIsOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [runs, setRuns] = useState<WorkflowRunSummary[]>([]);

  useEffect(() => {
    document.title = `${t.sidebar.workflows} - ${t.pages.appName}`;
  }, [t.sidebar.workflows, t.pages.appName]);

  const fetchWorkflows = () => {
    const params = new URLSearchParams();
    if (filter !== "all") params.set("status", filter);
    fetch(`/api/workflows?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setWorkflows(Array.isArray(data) ? data : []))
      .catch(() => setWorkflows([]));
  };

  const fetchStats = () => {
    fetch("/api/workflows/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setStats(data))
      .catch(() => setStats(null));
  };

  useEffect(() => {
    fetchWorkflows();
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const handleRowClick = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setRuns([]);
      return;
    }
    setExpandedId(id);
    setRuns([]);
    const data = await fetch(`/api/workflows/${id}/runs`).then((r) =>
      r.ok ? r.json() : []
    );
    setRuns(Array.isArray(data) ? data : []);
  };

  const handleCreate = async () => {
    await fetch("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName,
        description: newDesc,
        team_id: null,
        tags: [],
        metadata: {},
      }),
    });
    setIsOpen(false);
    setNewName("");
    setNewDesc("");
    fetchWorkflows();
    fetchStats();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/workflows/${id}`, { method: "DELETE" });
    if (expandedId === id) {
      setExpandedId(null);
      setRuns([]);
    }
    setWorkflows((prev) => prev.filter((w) => w.id !== id));
    fetchStats();
  };

  return (
    <WorkspaceContainer>
      <WorkspaceHeader />
      <WorkspaceBody>
        <div className="flex w-full flex-col gap-6 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">{t.sidebar.workflows}</h1>
              <p className="text-sm text-muted-foreground">
                Visual DAG orchestration for multi-agent workflows
              </p>
            </div>
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
              <DialogTrigger asChild>
                <Button>
                  <PlusIcon className="h-4 w-4" />
                  New Workflow
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Workflow</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Name</label>
                    <Input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Workflow name"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Description</label>
                    <Textarea
                      value={newDesc}
                      onChange={(e) => setNewDesc(e.target.value)}
                      placeholder="Workflow description"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => void handleCreate()}>Create</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {stats && (
            <div className="grid grid-cols-5 gap-4">
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">Total Workflows</p>
                <p className="text-2xl font-bold">{stats.total_workflows}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">Active</p>
                <p className="text-2xl font-bold">{stats.active_workflows}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">Draft</p>
                <p className="text-2xl font-bold">{stats.draft_workflows}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">Archived</p>
                <p className="text-2xl font-bold">{stats.archived_workflows}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">Total Runs</p>
                <p className="text-2xl font-bold">{stats.total_runs}</p>
              </div>
            </div>
          )}

          <Tabs value={filter} onValueChange={setFilter}>
            <TabsList variant="line">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="draft">Draft</TabsTrigger>
              <TabsTrigger value="archived">Archived</TabsTrigger>
            </TabsList>
          </Tabs>

          {workflows.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-center">
              <WorkflowIcon className="mb-2 h-12 w-12 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                No workflows found. Create one to get started.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b last:border-0">
                    <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">
                      Status
                    </th>
                    <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">
                      Name
                    </th>
                    <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">
                      Description
                    </th>
                    <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">
                      Version
                    </th>
                    <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">
                      Tags
                    </th>
                    <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">
                      Created
                    </th>
                    <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">
                      Updated
                    </th>
                    <th className="text-muted-foreground pb-2 pr-4 font-medium text-left w-12" />
                  </tr>
                </thead>
                {workflows.map((wf) => (
                  <tbody key={wf.id}>
                    <tr
                      className="cursor-pointer border-b last:border-0"
                      onClick={() => void handleRowClick(wf.id)}
                    >
                      <td className="py-3 pr-4">
                        <Badge
                          variant={
                            (STATUS_COLORS[wf.status] ?? "outline") as
                              | "default"
                              | "secondary"
                              | "destructive"
                              | "outline"
                          }
                        >
                          {wf.status}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 font-medium">{wf.name}</td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {wf.description}
                      </td>
                      <td className="py-3 pr-4">v{wf.current_version}</td>
                      <td className="py-3 pr-4 text-xs">
                        {wf.tags.length > 0 ? wf.tags.join(", ") : "-"}
                      </td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">
                        {new Date(wf.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">
                        {new Date(wf.updated_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 pr-4">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDelete(wf.id);
                          }}
                        >
                          <Trash2Icon className="h-4 w-4 text-red-500" />
                        </Button>
                      </td>
                    </tr>
                    {expandedId === wf.id && runs.length > 0 && (
                      <tr>
                        <td colSpan={8} className="bg-muted/30 p-4">
                          <div className="mb-2 text-sm font-medium">
                            Run History ({runs.length})
                          </div>
                          <table className="w-full text-sm">
                            <thead>
                              <tr>
                                <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">
                                  Status
                                </th>
                                <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">
                                  Progress
                                </th>
                                <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">
                                  Run ID
                                </th>
                                <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">
                                  Started
                                </th>
                                <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">
                                  Finished
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {runs.map((run) => (
                                <tr
                                  key={run.id}
                                  className="border-b last:border-0"
                                >
                                  <td className="py-2 pr-4">
                                    <Badge
                                      variant={
                                        (run.status === "completed"
                                          ? "default"
                                          : run.status === "failed"
                                            ? "destructive"
                                            : "secondary") as
                                          | "default"
                                          | "secondary"
                                          | "destructive"
                                          | "outline"
                                      }
                                    >
                                      {run.status}
                                    </Badge>
                                  </td>
                                  <td className="py-2 pr-4 text-xs">
                                    {run.current_step}/{run.total_steps}
                                  </td>
                                  <td className="py-2 pr-4 font-mono text-xs">
                                    {run.run_id ?? "-"}
                                  </td>
                                  <td className="py-2 pr-4 text-xs">
                                    {run.started_at
                                      ? new Date(
                                          run.started_at
                                        ).toLocaleString()
                                      : "-"}
                                  </td>
                                  <td className="py-2 pr-4 text-xs">
                                    {run.finished_at
                                      ? new Date(
                                          run.finished_at
                                        ).toLocaleString()
                                      : "-"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </tbody>
                ))}
              </table>
            </div>
          )}
        </div>
      </WorkspaceBody>
    </WorkspaceContainer>
  );
}
