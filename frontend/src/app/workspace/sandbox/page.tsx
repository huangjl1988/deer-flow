"use client";

import {
  BoxesIcon,
  FolderIcon,
  PlusIcon,
  ServerIcon,
  TerminalIcon,
  Trash2Icon,
} from "lucide-react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
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

interface SandboxPool {
  id: string;
  name: string;
  provider: string;
  pool_size: number;
  min_idle: number;
  status: string;
  created_at: string;
}

interface SandboxInstance {
  id: string;
  pool_id: string;
  instance_ref: string;
  status: string;
  health: string;
  created_at: string;
}

interface SandboxStats {
  total_pools: number;
  active_pools: number;
  total_instances: number;
  idle_instances: number;
  busy_instances: number;
  active_leases: number;
}

const STATUS_COLORS: Record<string, string> = {
  idle: "default",
  busy: "secondary",
  starting: "outline",
  stopping: "outline",
  terminated: "outline",
};

const HEALTH_COLORS: Record<string, string> = {
  healthy: "default",
  degraded: "secondary",
  unhealthy: "destructive",
};

export default function SandboxPage() {
  const { t } = useI18n();
  const [pools, setPools] = useState<SandboxPool[]>([]);
  const [instances, setInstances] = useState<SandboxInstance[]>([]);
  const [stats, setStats] = useState<SandboxStats | null>(null);
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newProvider, setNewProvider] = useState("local");
  const [newSize, setNewSize] = useState(1);
  const [terminalOutput, setTerminalOutput] = useState<string[]>([
    "Python 3.11.6 (default, Oct 2025)",
    ">>> ",
  ]);
  const [terminalInput, setTerminalInput] = useState("");
  const [fileContent, setFileContent] = useState("# Select a file from the explorer");
  const [output, setOutput] = useState("");

  useEffect(() => {
    document.title = `${t.sidebar.sandbox} - ${t.pages.appName}`;
  }, [t.sidebar.sandbox, t.pages.appName]);

  const fetchPools = () => {
    fetch("/api/sandbox/pools")
      .then((r) => r.ok ? r.json() : [])
      .then((data: SandboxPool[]) => setPools(data))
      .catch(() => setPools([]));
  };

  const fetchStats = () => {
    fetch("/api/sandbox/stats")
      .then((r) => r.ok ? r.json() : null)
      .then((data: SandboxStats | null) => setStats(data))
      .catch(() => setStats(null));
  };

  useEffect(() => {
    fetchPools();
    fetchStats();
  }, []);

  const fetchInstances = (poolId: string) => {
    setSelectedPoolId(poolId);
    fetch(`/api/sandbox/pools/${poolId}/instances`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: SandboxInstance[]) => setInstances(data))
      .catch(() => setInstances([]));
  };

  const handleCreate = async () => {
    await fetch("/api/sandbox/pools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, provider: newProvider, pool_size: newSize }),
    });
    setIsOpen(false);
    setNewName("");
    fetchPools();
    fetchStats();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/sandbox/pools/${id}`, { method: "DELETE" });
    fetchPools();
    fetchStats();
  };

  const handleTerminalSubmit = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && terminalInput.trim()) {
      setTerminalOutput((prev) => [...prev, `>>> ${terminalInput}`, "[sandbox not connected — output disabled]"]);
      setTerminalInput("");
    }
  };

  const handleRun = () => {
    setOutput("[sandbox not connected — execution disabled]");
  };

  return (
    <WorkspaceContainer>
      <WorkspaceHeader />
      <WorkspaceBody>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t.sidebar.sandbox}</h1>
            <p className="text-sm text-muted-foreground">Isolated code execution environment</p>
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button>
                <PlusIcon className="h-4 w-4" />
                New Pool
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Sandbox Pool</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Name</label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Pool name" />
                </div>
                <div>
                  <label className="text-sm font-medium">Provider</label>
                  <select value={newProvider} onChange={(e) => setNewProvider(e.target.value)} className="w-full rounded-md border p-2 text-sm">
                    <option value="local">Local</option>
                    <option value="aio">AIO</option>
                    <option value="opensandbox">OpenSandbox</option>
                    <option value="e2b">E2B</option>
                    <option value="boxlite">BoxLite</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Pool Size</label>
                  <Input type="number" value={newSize} onChange={(e) => setNewSize(Number(e.target.value))} min={1} />
                </div>
                <Button onClick={handleCreate} className="w-full">Create</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {stats && (
          <div className="grid grid-cols-5 gap-4">
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Total Pools</p>
              <p className="text-2xl font-bold">{stats.total_pools}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Active</p>
              <p className="text-2xl font-bold">{stats.active_pools}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Instances</p>
              <p className="text-2xl font-bold">{stats.total_instances}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Idle</p>
              <p className="text-2xl font-bold">{stats.idle_instances}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Active Leases</p>
              <p className="text-2xl font-bold">{stats.active_leases}</p>
            </div>
          </div>
        )}

        <Tabs defaultValue="pools">
          <TabsList variant="line">
            <TabsTrigger value="pools">Pools</TabsTrigger>
            <TabsTrigger value="ide">IDE</TabsTrigger>
          </TabsList>
          <TabsContent value="pools" className="mt-4">
            {pools.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center text-center">
                <BoxesIcon className="mb-2 h-12 w-12 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No sandbox pools found.</p>
              </div>
            ) : (
              <div className="rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b last:border-0">
                      <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">Name</th>
                      <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">Provider</th>
                      <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">Pool Size</th>
                      <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">Status</th>
                      <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">Created</th>
                      <th className="text-muted-foreground pb-2 pr-4 font-medium text-left w-24" />
                    </tr>
                  </thead>
                  <tbody>
                    {pools.map((pool) => (
                      <tr key={pool.id} onClick={() => fetchInstances(pool.id)} className="border-b last:border-0 cursor-pointer">
                        <td className="py-3 pr-4 font-medium">
                          <div className="flex items-center gap-2">
                            <ServerIcon className="h-4 w-4 text-muted-foreground" />
                            {pool.name}
                          </div>
                        </td>
                        <td className="py-3 pr-4"><Badge variant="outline">{pool.provider}</Badge></td>
                        <td className="py-3 pr-4">{pool.pool_size}</td>
                        <td className="py-3 pr-4">
                          <Badge variant={(pool.status === "active" ? "default" : "outline") as "default" | "secondary" | "destructive" | "outline"}>{pool.status}</Badge>
                        </td>
                        <td className="py-3 pr-4 text-xs text-muted-foreground">
                          {new Date(pool.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-3 pr-4">
                          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); void handleDelete(pool.id); }}>
                            <Trash2Icon className="h-4 w-4 text-red-500" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {selectedPoolId && instances.length > 0 && (
              <div className="mt-4">
                <h3 className="mb-2 text-sm font-semibold">Instances for selected pool</h3>
                <div className="rounded-lg border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b last:border-0">
                        <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">Instance Ref</th>
                        <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">Status</th>
                        <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">Health</th>
                        <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {instances.map((inst) => (
                        <tr key={inst.id} className="border-b last:border-0">
                          <td className="py-3 pr-4 font-mono text-xs">{inst.instance_ref}</td>
                          <td className="py-3 pr-4">
                            <Badge variant={(STATUS_COLORS[inst.status] ?? "outline") as "default" | "secondary" | "destructive" | "outline"}>{inst.status}</Badge>
                          </td>
                          <td className="py-3 pr-4">
                            <Badge variant={(HEALTH_COLORS[inst.health] ?? "outline") as "default" | "secondary" | "destructive" | "outline"}>{inst.health}</Badge>
                          </td>
                          <td className="py-3 pr-4 text-xs text-muted-foreground">
                            {new Date(inst.created_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="ide" className="mt-4">
            <div className="flex h-[500px] flex-col">
              {/* Top bar */}
              <div className="flex items-center gap-2 border-b px-4 py-2">
                <Badge variant="outline">Not Connected</Badge>
                <span className="text-xs text-muted-foreground">Sandbox ID: —</span>
                <Separator orientation="vertical" className="mx-2 h-4" />
                <Badge variant="outline">Python 3.11.6</Badge>
              </div>

              {/* Four-quadrant layout */}
              <div className="grid flex-1 grid-cols-2 grid-rows-2 gap-2 p-2">
                {/* File Explorer */}
                <div className="flex flex-col rounded-md border">
                  <div className="border-b px-3 py-1.5 text-xs font-semibold uppercase text-muted-foreground">
                    File Explorer
                  </div>
                  <ScrollArea className="flex-1 p-2">
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center gap-1 hover:bg-accent rounded px-1 py-0.5">
                        <FolderIcon className="h-3 w-3" />
                        <span>main.py</span>
                      </div>
                      <div className="flex items-center gap-1 hover:bg-accent rounded px-1 py-0.5">
                        <FolderIcon className="h-3 w-3" />
                        <span>requirements.txt</span>
                      </div>
                      <div className="flex items-center gap-1 hover:bg-accent rounded px-1 py-0.5">
                        <FolderIcon className="h-3 w-3" />
                        <span>output/</span>
                      </div>
                    </div>
                  </ScrollArea>
                </div>

                {/* Terminal */}
                <div className="flex flex-col rounded-md border">
                  <div className="border-b px-3 py-1.5 text-xs font-semibold uppercase text-muted-foreground">
                    Terminal
                  </div>
                  <div className="flex-1 bg-black/90 p-2 font-mono text-xs text-green-400">
                    <ScrollArea className="h-full">
                      {terminalOutput.map((line, i) => (
                        <div key={i} className="whitespace-pre-wrap">{line}</div>
                      ))}
                      <div className="flex items-center gap-1">
                        <span>{">>> "}</span>
                        <input
                          value={terminalInput}
                          onChange={(e) => setTerminalInput(e.target.value)}
                          onKeyDown={handleTerminalSubmit}
                          className="flex-1 bg-transparent outline-none"
                        />
                      </div>
                    </ScrollArea>
                  </div>
                </div>

                {/* Code Editor */}
                <div className="flex flex-col rounded-md border">
                  <div className="flex items-center justify-between border-b px-3 py-1.5">
                    <span className="text-xs font-semibold uppercase text-muted-foreground">Code Editor</span>
                    <Button size="sm" variant="ghost" onClick={handleRun}>
                      <TerminalIcon className="h-3 w-3" />
                      Run
                    </Button>
                  </div>
                  <textarea
                    value={fileContent}
                    onChange={(e) => setFileContent(e.target.value)}
                    className="flex-1 resize-none bg-muted/30 p-2 font-mono text-xs outline-none"
                    placeholder="# Write code here..."
                  />
                </div>

                {/* Output */}
                <div className="flex flex-col rounded-md border">
                  <div className="border-b px-3 py-1.5 text-xs font-semibold uppercase text-muted-foreground">
                    Output
                  </div>
                  <ScrollArea className="flex-1 p-2">
                    <pre className="text-xs">{output || "No output yet. Click Run to execute."}</pre>
                  </ScrollArea>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </WorkspaceBody>
    </WorkspaceContainer>
  );
}
