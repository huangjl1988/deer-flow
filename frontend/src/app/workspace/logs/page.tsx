"use client";

import { ScrollTextIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  WorkspaceBody,
  WorkspaceContainer,
  WorkspaceHeader,
} from "@/components/workspace/workspace-container";
import { useI18n } from "@/core/i18n/hooks";

interface LogEntry {
  id: number;
  timestamp: string;
  level: string;
  service: string;
  message: string;
  thread_id: string | null;
  run_id: string | null;
  trace_id: string | null;
  metadata: Record<string, unknown>;
}

interface LogStats {
  total: number;
  error: number;
  warn: number;
  info: number;
  debug: number;
}

const LEVEL_COLORS: Record<string, string> = {
  error: "destructive",
  warn: "default",
  info: "secondary",
  debug: "outline",
};

const SERVICES = ["all", "gateway", "frontend", "scheduler", "sandbox"] as const;

export default function LogsPage() {
  const { t } = useI18n();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [filter, setFilter] = useState("all");
  const [service, setService] = useState("all");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    document.title = `${t.sidebar.logs} - ${t.pages.appName}`;
  }, [t.sidebar.logs, t.pages.appName]);

  useEffect(() => {
    setIsLoading(true);
    const params = new URLSearchParams({ limit: "100", offset: "0" });
    if (filter !== "all") params.set("level", filter);
    if (service !== "all") params.set("service", service);
    if (search) params.set("search", search);
    fetch(`/api/logs?${params}`)
      .then((r) => r.ok ? r.json() : { logs: [] })
      .then((data) => setLogs(data.logs ?? []))
      .catch(() => setLogs([]))
      .finally(() => setIsLoading(false));
    fetch("/api/logs/stats")
      .then((r) => r.ok ? r.json() : null)
      .then((data: LogStats | null) => setStats(data))
      .catch(() => setStats(null));
  }, [filter, service, search]);

  return (
    <WorkspaceContainer>
      <WorkspaceHeader />
      <WorkspaceBody>
        <div>
          <h1 className="text-2xl font-bold">{t.sidebar.logs}</h1>
          <p className="text-sm text-muted-foreground">
            Real-time application logs across all services
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Card>
            <CardHeader>
              <CardDescription>Total</CardDescription>
              <CardTitle className="text-2xl">{stats?.total ?? 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Error</CardDescription>
              <CardTitle className="text-2xl">{stats?.error ?? 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Warn</CardDescription>
              <CardTitle className="text-2xl">{stats?.warn ?? 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Info</CardDescription>
              <CardTitle className="text-2xl">{stats?.info ?? 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Debug</CardDescription>
              <CardTitle className="text-2xl">{stats?.debug ?? 0}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList variant="line">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="error">Error ({stats?.error ?? 0})</TabsTrigger>
            <TabsTrigger value="warn">Warn ({stats?.warn ?? 0})</TabsTrigger>
            <TabsTrigger value="info">Info ({stats?.info ?? 0})</TabsTrigger>
            <TabsTrigger value="debug">Debug ({stats?.debug ?? 0})</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={service} onValueChange={setService}>
            <TabsList variant="line">
              {SERVICES.map((s) => (
                <TabsTrigger key={s} value={s} className="capitalize">
                  {s}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search messages..."
            className="max-w-xs"
          />
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : logs.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-center">
            <ScrollTextIcon className="mb-2 h-12 w-12 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              No logs found. Adjust filters to see entries.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b last:border-0">
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">
                    Timestamp
                  </th>
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">
                    Level
                  </th>
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">
                    Service
                  </th>
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">
                    Message
                  </th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b last:border-0">
                    <td className="py-3 pr-4 font-mono text-xs">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge
                        variant={(LEVEL_COLORS[log.level] ?? "outline") as "default" | "secondary" | "destructive" | "outline"}
                        className="uppercase"
                      >
                        {log.level}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4">{log.service}</td>
                    <td className="py-3 pr-4 font-mono text-xs">
                      {log.message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Button
          variant="outline"
          onClick={() => {
            setFilter("all");
            setService("all");
            setSearch("");
          }}
        >
          Reset Filters
        </Button>
      </WorkspaceBody>
    </WorkspaceContainer>
  );
}
