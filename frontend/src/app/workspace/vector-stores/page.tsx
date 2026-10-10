"use client";

import { BoxesIcon, DatabaseIcon, PlusIcon, Trash2Icon } from "lucide-react";
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
import {
  WorkspaceBody,
  WorkspaceContainer,
  WorkspaceHeader,
} from "@/components/workspace/workspace-container";
import { useI18n } from "@/core/i18n/hooks";

interface VectorStore {
  id: string;
  name: string;
  description: string;
  provider: string;
  embedding_model: string;
  dimension: number;
  status: string;
  created_at: string;
  updated_at: string;
}

interface VSStats {
  total_stores: number;
  active_stores: number;
  total_collections: number;
  total_documents: number;
}

const PROVIDER_COLORS: Record<string, string> = {
  pgvector: "default",
  chroma: "secondary",
  qdrant: "outline",
  pinecone: "secondary",
  weaviate: "outline",
  memory: "outline",
};

export default function VectorStoresPage() {
  const { t } = useI18n();
  const [stores, setStores] = useState<VectorStore[]>([]);
  const [stats, setStats] = useState<VSStats | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newProvider, setNewProvider] = useState("pgvector");
  const [newModel, setNewModel] = useState("text-embedding-3-small");
  const [newDim, setNewDim] = useState(1536);

  useEffect(() => {
    document.title = `${t.sidebar.vectorStores} - ${t.pages.appName}`;
  }, [t.sidebar.vectorStores, t.pages.appName]);

  const fetchStores = () => {
    fetch("/api/vector-stores")
      .then((r) => r.ok ? r.json() : [])
      .then((data: VectorStore[]) => setStores(data))
      .catch(() => setStores([]));
  };

  const fetchStats = () => {
    fetch("/api/vector-stores/stats")
      .then((r) => r.ok ? r.json() : null)
      .then((data: VSStats | null) => setStats(data))
      .catch(() => setStats(null));
  };

  useEffect(() => {
    fetchStores();
    fetchStats();
  }, []);

  const handleCreate = async () => {
    await fetch("/api/vector-stores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, provider: newProvider, embedding_model: newModel, dimension: newDim }),
    });
    setIsOpen(false);
    setNewName("");
    fetchStores();
    fetchStats();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/vector-stores/${id}`, { method: "DELETE" });
    fetchStores();
    fetchStats();
  };

  return (
    <WorkspaceContainer>
      <WorkspaceHeader />
      <WorkspaceBody>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t.sidebar.vectorStores}</h1>
            <p className="text-sm text-muted-foreground">Vector storage for embeddings and retrieval</p>
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button>
                <PlusIcon className="h-4 w-4" />
                New Vector Store
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Vector Store</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Name</label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Store name" />
                </div>
                <div>
                  <label className="text-sm font-medium">Provider</label>
                  <select value={newProvider} onChange={(e) => setNewProvider(e.target.value)} className="w-full rounded-md border p-2 text-sm">
                    <option value="pgvector">pgvector</option>
                    <option value="chroma">Chroma</option>
                    <option value="qdrant">Qdrant</option>
                    <option value="pinecone">Pinecone</option>
                    <option value="weaviate">Weaviate</option>
                    <option value="memory">Memory (in-memory)</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Embedding Model</label>
                  <Input value={newModel} onChange={(e) => setNewModel(e.target.value)} placeholder="text-embedding-3-small" />
                </div>
                <div>
                  <label className="text-sm font-medium">Dimension</label>
                  <Input type="number" value={newDim} onChange={(e) => setNewDim(Number(e.target.value))} />
                </div>
                <Button onClick={handleCreate} className="w-full">Create</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {stats && (
          <div className="grid grid-cols-4 gap-4">
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Total Stores</p>
              <p className="text-2xl font-bold">{stats.total_stores}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Active</p>
              <p className="text-2xl font-bold">{stats.active_stores}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Collections</p>
              <p className="text-2xl font-bold">{stats.total_collections}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Documents</p>
              <p className="text-2xl font-bold">{stats.total_documents}</p>
            </div>
          </div>
        )}

        {stores.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-center">
            <BoxesIcon className="mb-2 h-12 w-12 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No vector stores found. Create one to get started.</p>
          </div>
        ) : (
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b last:border-0">
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">Name</th>
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">Provider</th>
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">Embedding Model</th>
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">Dimension</th>
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">Status</th>
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">Created</th>
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left w-12" />
                </tr>
              </thead>
              <tbody>
                {stores.map((vs) => (
                  <tr key={vs.id} className="border-b last:border-0">
                    <td className="py-3 pr-4 font-medium">
                      <div className="flex items-center gap-2">
                        <DatabaseIcon className="h-4 w-4 text-muted-foreground" />
                        {vs.name}
                      </div>
                      <p className="text-xs text-muted-foreground">{vs.description}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant={(PROVIDER_COLORS[vs.provider] ?? "outline") as "default" | "secondary" | "destructive" | "outline"}>{vs.provider}</Badge>
                    </td>
                    <td className="py-3 pr-4 text-xs font-mono">{vs.embedding_model}</td>
                    <td className="py-3 pr-4">{vs.dimension}</td>
                    <td className="py-3 pr-4">
                      <Badge variant={(vs.status === "active" ? "default" : "outline") as "default" | "secondary" | "destructive" | "outline"}>{vs.status}</Badge>
                    </td>
                    <td className="py-3 pr-4 text-xs text-muted-foreground">
                      {new Date(vs.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 pr-4">
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(vs.id)}>
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
