"use client";

import { DatabaseIcon, FileTextIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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

interface Dataset {
  id: string;
  name: string;
  description: string;
  dataset_type: string;
  format: string;
  current_version: number;
  item_count: number;
  created_at: string;
  updated_at: string;
}

interface DatasetStats {
  total_datasets: number;
  total_items: number;
  training_datasets: number;
  evaluation_datasets: number;
  knowledge_datasets: number;
}

const TYPE_COLORS: Record<string, string> = {
  training: "default",
  evaluation: "secondary",
  knowledge: "outline",
  general: "outline",
};

export default function DatasetsPage() {
  const { t } = useI18n();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [stats, setStats] = useState<DatasetStats | null>(null);
  const [filter, setFilter] = useState("all");
  const [isOpen, setIsOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newType, setNewType] = useState("general");
  const [newFormat, setNewFormat] = useState("json");

  useEffect(() => {
    document.title = `${t.sidebar.datasets} - ${t.pages.appName}`;
  }, [t.sidebar.datasets, t.pages.appName]);

  const fetchDatasets = () => {
    fetch("/api/datasets")
      .then((r) => r.ok ? r.json() : [])
      .then((data: Dataset[]) => setDatasets(data))
      .catch(() => setDatasets([]));
  };

  const fetchStats = () => {
    fetch("/api/datasets/stats")
      .then((r) => r.ok ? r.json() : null)
      .then((data: DatasetStats | null) => setStats(data))
      .catch(() => setStats(null));
  };

  useEffect(() => {
    fetchDatasets();
    fetchStats();
  }, []);

  const handleCreate = async () => {
    await fetch("/api/datasets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, description: newDesc, dataset_type: newType, format: newFormat }),
    });
    setIsOpen(false);
    setNewName("");
    setNewDesc("");
    fetchDatasets();
    fetchStats();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/datasets/${id}`, { method: "DELETE" });
    fetchDatasets();
    fetchStats();
  };

  const filtered = filter === "all" ? datasets : datasets.filter((d) => d.dataset_type === filter);

  return (
    <WorkspaceContainer>
      <WorkspaceHeader />
      <WorkspaceBody>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t.sidebar.datasets}</h1>
            <p className="text-sm text-muted-foreground">Data assets for training, evaluation, and knowledge</p>
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button>
                <PlusIcon className="h-4 w-4" />
                New Dataset
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Dataset</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Name</label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Dataset name" />
                </div>
                <div>
                  <label className="text-sm font-medium">Description</label>
                  <Textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Description" />
                </div>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="text-sm font-medium">Type</label>
                    <select value={newType} onChange={(e) => setNewType(e.target.value)} className="w-full rounded-md border p-2 text-sm">
                      <option value="general">General</option>
                      <option value="training">Training</option>
                      <option value="evaluation">Evaluation</option>
                      <option value="knowledge">Knowledge</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="text-sm font-medium">Format</label>
                    <select value={newFormat} onChange={(e) => setNewFormat(e.target.value)} className="w-full rounded-md border p-2 text-sm">
                      <option value="json">JSON</option>
                      <option value="jsonl">JSONL</option>
                      <option value="csv">CSV</option>
                      <option value="parquet">Parquet</option>
                    </select>
                  </div>
                </div>
                <Button onClick={handleCreate} className="w-full">Create</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {stats && (
          <div className="grid grid-cols-4 gap-4">
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Total Datasets</p>
              <p className="text-2xl font-bold">{stats.total_datasets}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Total Items</p>
              <p className="text-2xl font-bold">{stats.total_items}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Training</p>
              <p className="text-2xl font-bold">{stats.training_datasets}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Evaluation</p>
              <p className="text-2xl font-bold">{stats.evaluation_datasets}</p>
            </div>
          </div>
        )}

        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList variant="line">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="training">Training</TabsTrigger>
            <TabsTrigger value="evaluation">Evaluation</TabsTrigger>
            <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
          </TabsList>
        </Tabs>

        {filtered.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-center">
            <DatabaseIcon className="mb-2 h-12 w-12 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No datasets found. Create one to get started.</p>
          </div>
        ) : (
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b last:border-0">
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">Name</th>
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">Type</th>
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">Format</th>
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">Entries</th>
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">Version</th>
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">Created</th>
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left w-12" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((ds) => (
                  <tr key={ds.id} className="border-b last:border-0">
                    <td className="py-3 pr-4 font-medium">
                      <div className="flex items-center gap-2">
                        <FileTextIcon className="h-4 w-4 text-muted-foreground" />
                        {ds.name}
                      </div>
                      <p className="text-xs text-muted-foreground">{ds.description}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant={(TYPE_COLORS[ds.dataset_type] ?? "outline") as "default" | "secondary" | "destructive" | "outline"}>{ds.dataset_type}</Badge>
                    </td>
                    <td className="py-3 pr-4">{ds.format}</td>
                    <td className="py-3 pr-4">{ds.item_count}</td>
                    <td className="py-3 pr-4">v{ds.current_version}</td>
                    <td className="py-3 pr-4 text-xs text-muted-foreground">
                      {new Date(ds.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 pr-4">
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(ds.id)}>
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
