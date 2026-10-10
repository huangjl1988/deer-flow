"use client";

import { ClipboardCheckIcon, PlusIcon, Trash2Icon } from "lucide-react";
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

interface EvaluationSummary {
  id: string;
  name: string;
  description: string;
  target_type: string;
  target_id: string;
  dataset_id: string;
  status: string;
  total_runs: number;
  last_run_status: string | null;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

interface EvalStats {
  total_evaluations: number;
  total_runs: number;
  passed_runs: number;
  failed_runs: number;
  pending_runs: number;
}

const STATUS_COLORS: Record<string, string> = {
  active: "default",
  draft: "secondary",
  archived: "outline",
  passed: "default",
  failed: "destructive",
  pending: "secondary",
  completed: "default",
  error: "destructive",
};

export default function EvaluationsPage() {
  const { t } = useI18n();
  const [evals, setEvals] = useState<EvaluationSummary[]>([]);
  const [stats, setStats] = useState<EvalStats | null>(null);
  const [filter, setFilter] = useState("all");
  const [isOpen, setIsOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newTargetType, setNewTargetType] = useState("agent");
  const [newTargetId, setNewTargetId] = useState("");
  const [newDatasetId, setNewDatasetId] = useState("");

  useEffect(() => {
    document.title = `${t.sidebar.evaluations} - ${t.pages.appName}`;
  }, [t.sidebar.evaluations, t.pages.appName]);

  const fetchEvals = () => {
    const qs = filter !== "all" ? `?status=${filter}` : "";
    fetch(`/api/evaluations${qs}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: EvaluationSummary[]) => setEvals(data))
      .catch(() => setEvals([]));
  };

  const fetchStats = () => {
    fetch("/api/evaluations/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: EvalStats | null) => setStats(data))
      .catch(() => setStats(null));
  };

  useEffect(() => {
    fetchEvals();
    fetchStats();
  }, [filter]);

  const handleCreate = async () => {
    await fetch("/api/evaluations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName,
        description: newDesc,
        target_type: newTargetType,
        target_id: newTargetId,
        dataset_id: newDatasetId,
        metrics_json: [],
        config_json: {},
      }),
    });
    setIsOpen(false);
    setNewName("");
    setNewDesc("");
    setNewTargetType("agent");
    setNewTargetId("");
    setNewDatasetId("");
    fetchEvals();
    fetchStats();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/evaluations/${id}`, { method: "DELETE" });
    fetchEvals();
    fetchStats();
  };

  return (
    <WorkspaceContainer>
      <WorkspaceHeader />
      <WorkspaceBody>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t.sidebar.evaluations}</h1>
            <p className="text-sm text-muted-foreground">
              Quality evaluation results — scoring dimensions, pass rates, and trend analysis across runs
            </p>
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button>
                <PlusIcon className="h-4 w-4" />
                New Evaluation
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Evaluation</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Name</label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Evaluation name" />
                </div>
                <div>
                  <label className="text-sm font-medium">Description</label>
                  <Textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Description" />
                </div>
                <div>
                  <label className="text-sm font-medium">Target Type</label>
                  <select
                    value={newTargetType}
                    onChange={(e) => setNewTargetType(e.target.value)}
                    className="w-full rounded-md border p-2 text-sm"
                  >
                    <option value="agent">Agent</option>
                    <option value="workflow">Workflow</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Target ID</label>
                  <Input value={newTargetId} onChange={(e) => setNewTargetId(e.target.value)} placeholder="Agent or workflow ID" />
                </div>
                <div>
                  <label className="text-sm font-medium">Dataset ID</label>
                  <Input value={newDatasetId} onChange={(e) => setNewDatasetId(e.target.value)} placeholder="Dataset ID" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                <Button onClick={() => void handleCreate()}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {stats && (
          <div className="grid grid-cols-5 gap-4">
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Total Evaluations</p>
              <p className="text-2xl font-bold">{stats.total_evaluations}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Total Runs</p>
              <p className="text-2xl font-bold">{stats.total_runs}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Passed</p>
              <p className="text-2xl font-bold">{stats.passed_runs}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Failed</p>
              <p className="text-2xl font-bold">{stats.failed_runs}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Pending</p>
              <p className="text-2xl font-bold">{stats.pending_runs}</p>
            </div>
          </div>
        )}

        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList variant="line">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="passed">Passed</TabsTrigger>
            <TabsTrigger value="failed">Failed</TabsTrigger>
            <TabsTrigger value="pending">Pending</TabsTrigger>
          </TabsList>
        </Tabs>

        {evals.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-center">
            <ClipboardCheckIcon className="mb-2 h-12 w-12 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No evaluations found. Create one to get started.</p>
          </div>
        ) : (
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b last:border-0">
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">Status</th>
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">Name</th>
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">Target Type</th>
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">Target ID</th>
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">Dataset</th>
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">Runs</th>
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">Last Run</th>
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">Created</th>
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left w-12" />
                </tr>
              </thead>
              <tbody>
                {evals.map((ev) => (
                  <tr key={ev.id} className="border-b last:border-0">
                    <td className="py-3 pr-4">
                      <Badge variant={(STATUS_COLORS[ev.status] ?? "outline") as "default" | "secondary" | "destructive" | "outline"}>
                        {ev.status}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4 font-medium">
                      {ev.name}
                      <p className="text-xs text-muted-foreground">{ev.description}</p>
                    </td>
                    <td className="py-3 pr-4">{ev.target_type}</td>
                    <td className="py-3 pr-4 font-mono text-xs">{ev.target_id}</td>
                    <td className="py-3 pr-4 font-mono text-xs">{ev.dataset_id}</td>
                    <td className="py-3 pr-4">{ev.total_runs}</td>
                    <td className="py-3 pr-4">
                      {ev.last_run_status ? (
                        <div className="flex flex-col gap-1">
                          <Badge variant={(STATUS_COLORS[ev.last_run_status] ?? "outline") as "default" | "secondary" | "destructive" | "outline"}>
                            {ev.last_run_status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {ev.last_run_at ? new Date(ev.last_run_at).toLocaleString() : "-"}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">No runs</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-xs text-muted-foreground">
                      {new Date(ev.created_at).toLocaleString()}
                    </td>
                    <td className="py-3 pr-4">
                      <Button size="sm" variant="ghost" onClick={() => void handleDelete(ev.id)}>
                        <Trash2Icon className="h-4 w-4 text-red-500" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </WorkspaceBody>
    </WorkspaceContainer>
  );
}
