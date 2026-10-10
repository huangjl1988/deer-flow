"use client";

import { CopyIcon, KeyRoundIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
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
import {
  WorkspaceBody,
  WorkspaceContainer,
  WorkspaceHeader,
} from "@/components/workspace/workspace-container";
import { useI18n } from "@/core/i18n/hooks";

interface ApiKeySummary {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  status: string;
  expires_at: string | null;
  last_used_at: string | null;
  use_count: number;
  created_at: string;
}

interface ApiKeyStats {
  total_keys: number;
  active_keys: number;
  revoked_keys: number;
  expired_keys: number;
}

interface ApiKeyDetail {
  id: string;
  name: string;
  full_key: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: "default",
  revoked: "destructive",
  expired: "secondary",
  expiring: "outline",
};

export default function ApiKeysPage() {
  const { t } = useI18n();
  const [keys, setKeys] = useState<ApiKeySummary[]>([]);
  const [stats, setStats] = useState<ApiKeyStats | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newScopes, setNewScopes] = useState("");
  const [revealKey, setRevealKey] = useState<string | null>(null);
  const [revealTitle, setRevealTitle] = useState("API Key Created");
  const [rotatingId, setRotatingId] = useState<string | null>(null);

  useEffect(() => {
    document.title = `${t.sidebar.apiKeys} - ${t.pages.appName}`;
  }, [t.sidebar.apiKeys, t.pages.appName]);

  const fetchKeys = () => {
    fetch("/api/api-keys")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ApiKeySummary[]) => setKeys(data))
      .catch(() => setKeys([]));
  };

  const fetchStats = () => {
    fetch("/api/api-keys/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ApiKeyStats | null) => setStats(data))
      .catch(() => setStats(null));
  };

  useEffect(() => {
    fetchKeys();
    fetchStats();
  }, []);

  const handleCreate = async () => {
    const scopes = newScopes
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const res = await fetch("/api/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, scopes, expires_at: null }),
    });
    setIsOpen(false);
    setNewName("");
    setNewScopes("");
    if (res.ok) {
      const data: ApiKeyDetail = await res.json();
      setRevealTitle("API Key Created");
      setRevealKey(data.full_key);
    }
    fetchKeys();
    fetchStats();
  };

  const handleRevoke = async (id: string) => {
    await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
    fetchKeys();
    fetchStats();
  };

  const handleRotate = async (id: string) => {
    setRotatingId(id);
    try {
      const res = await fetch(`/api/api-keys/${id}/rotate`, { method: "POST" });
      if (res.ok) {
        const data: ApiKeyDetail = await res.json();
        setRevealTitle("API Key Rotated");
        setRevealKey(data.full_key);
      }
    } finally {
      setRotatingId(null);
    }
    fetchKeys();
    fetchStats();
  };

  const handleCopy = (key: string) => {
    void navigator.clipboard.writeText(key);
  };

  return (
    <WorkspaceContainer>
      <WorkspaceHeader />
      <WorkspaceBody>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t.sidebar.apiKeys}</h1>
            <p className="text-sm text-muted-foreground">Manage API keys for programmatic access to the Gateway</p>
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button>
                <PlusIcon className="h-4 w-4" />
                New API Key
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create API Key</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Name</label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Key name" />
                </div>
                <div>
                  <label className="text-sm font-medium">Scopes</label>
                  <Input value={newScopes} onChange={(e) => setNewScopes(e.target.value)} placeholder="read, write, admin" />
                  <p className="text-xs text-muted-foreground">Comma-separated list of scopes</p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                <Button onClick={() => void handleCreate()}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Dialog
          open={revealKey !== null}
          onOpenChange={(o) => {
            if (!o) setRevealKey(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{revealTitle}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Copy this key now. For security, the full key will not be shown again.
              </p>
              <div className="flex items-center gap-2 rounded-md border bg-muted p-2">
                <code className="flex-1 break-all font-mono text-xs">{revealKey}</code>
                <Button size="icon-sm" variant="ghost" onClick={() => handleCopy(revealKey ?? "")}>
                  <CopyIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => setRevealKey(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {stats && (
          <div className="grid grid-cols-4 gap-4">
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Total Keys</p>
              <p className="text-2xl font-bold">{stats.total_keys}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Active</p>
              <p className="text-2xl font-bold">{stats.active_keys}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Revoked</p>
              <p className="text-2xl font-bold">{stats.revoked_keys}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Expired</p>
              <p className="text-2xl font-bold">{stats.expired_keys}</p>
            </div>
          </div>
        )}

        {keys.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-center">
            <KeyRoundIcon className="mb-2 h-12 w-12 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No API keys found. Create one to get started.</p>
          </div>
        ) : (
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b last:border-0">
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">Name</th>
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">Key Prefix</th>
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">Scopes</th>
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">Status</th>
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">Last Used</th>
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">Use Count</th>
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">Created</th>
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left w-32" />
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className="border-b last:border-0">
                    <td className="py-3 pr-4 font-medium">
                      <div className="flex items-center gap-2">
                        <KeyRoundIcon className="h-4 w-4 text-muted-foreground" />
                        {k.name}
                      </div>
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs">{k.key_prefix}…</td>
                    <td className="py-3 pr-4">
                      {k.scopes.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {k.scopes.map((s) => (
                            <Badge key={s} variant="outline">{s}</Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant={(STATUS_COLORS[k.status] ?? "outline") as "default" | "secondary" | "destructive" | "outline"}>
                        {k.status}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4 text-xs text-muted-foreground">
                      {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "Never"}
                    </td>
                    <td className="py-3 pr-4">{k.use_count}</td>
                    <td className="py-3 pr-4 text-xs text-muted-foreground">
                      {new Date(k.created_at).toLocaleString()}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={rotatingId === k.id}
                          onClick={() => void handleRotate(k.id)}
                        >
                          <RefreshCwIcon className={`h-4 w-4 ${rotatingId === k.id ? "animate-spin" : ""}`} />
                          Rotate
                        </Button>
                        <Button size="icon-sm" variant="ghost" onClick={() => void handleRevoke(k.id)}>
                          <Trash2Icon className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
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
