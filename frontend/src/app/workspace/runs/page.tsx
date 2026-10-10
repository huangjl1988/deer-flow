"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  WorkspaceBody,
  WorkspaceContainer,
  WorkspaceHeader,
} from "@/components/workspace/workspace-container";
import { useConsoleRuns, useConsoleStats } from "@/core/console";
import { useI18n } from "@/core/i18n/hooks";
import { formatTimeAgo } from "@/core/utils/datetime";

const STATUS_FILTERS = ["all", "success", "error", "running"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

export default function RunsPage() {
  const { t } = useI18n();
  const { stats, isLoading: statsLoading } = useConsoleStats();
  const [filter, setFilter] = useState<StatusFilter>("all");
  const { runs, isLoading: runsLoading, error } = useConsoleRuns({
    status: filter,
    limit: 50,
  });

  useEffect(() => {
    document.title = `${t.sidebar.runs} - ${t.pages.appName}`;
  }, [t.sidebar.runs, t.pages.appName]);

  return (
    <WorkspaceContainer>
      <WorkspaceHeader />
      <WorkspaceBody>
        <div className="mx-auto flex w-full max-w-(--container-width-md) flex-col gap-6 p-6">
          <div>
            <h1 className="text-2xl font-semibold">{t.sidebar.runs}</h1>
            <p className="text-muted-foreground text-sm">
              Cross-thread run history and execution statistics
            </p>
          </div>

          {statsLoading ? (
            <div className="text-muted-foreground text-sm">
              {t.common.loading}
            </div>
          ) : stats ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              <Card>
                <CardHeader>
                  <CardDescription>Total Runs</CardDescription>
                  <CardTitle className="text-2xl">
                    {stats.total_runs}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardDescription>Active</CardDescription>
                  <CardTitle className="text-2xl">
                    {stats.active_runs}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardDescription>Failed</CardDescription>
                  <CardTitle className="text-2xl">
                    {stats.failed_runs}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardDescription>Threads</CardDescription>
                  <CardTitle className="text-2xl">
                    {stats.total_threads}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardDescription>Total Tokens</CardDescription>
                  <CardTitle className="text-2xl">
                    {formatTokenCount(stats.total_tokens)}
                  </CardTitle>
                </CardHeader>
              </Card>
            </div>
          ) : null}

          <Tabs
            defaultValue="all"
            value={filter}
            onValueChange={(v) => setFilter(v as StatusFilter)}
          >
            <TabsList variant="line">
              {STATUS_FILTERS.map((f) => (
                <TabsTrigger key={f} value={f} className="capitalize">
                  {f}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {runsLoading ? (
            <div className="text-muted-foreground text-sm">
              {t.common.loading}
            </div>
          ) : error ? (
            <div className="text-destructive text-sm">
              {error.message}
            </div>
          ) : runs.length === 0 ? (
            <div className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
              No runs found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left">
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 font-medium">Run ID</th>
                    <th className="pb-2 pr-4 font-medium">Thread</th>
                    <th className="pb-2 pr-4 font-medium">Model</th>
                    <th className="pb-2 pr-4 font-medium">Tokens</th>
                    <th className="pb-2 pr-4 font-medium">Duration</th>
                    <th className="pb-2 pr-4 font-medium">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.run_id} className="border-b last:border-0">
                      <td className="py-3 pr-4">
                        <StatusBadge status={run.status} />
                      </td>
                      <td className="py-3 pr-4">
                        <Link
                          href={`/workspace/chats/${run.thread_id}`}
                          className="text-primary font-mono text-xs underline-offset-4 hover:underline"
                        >
                          {run.run_id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="max-w-[200px] truncate py-3 pr-4">
                        {run.thread_title ?? run.thread_id.slice(0, 8)}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {run.model_name ?? "—"}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {formatTokenCount(run.total_tokens)}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {run.duration_seconds
                          ? formatDuration(run.duration_seconds)
                          : "—"}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {run.created_at
                          ? formatTimeAgo(run.created_at)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </WorkspaceBody>
    </WorkspaceContainer>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "success"
      ? "default"
      : status === "error" || status === "timeout"
        ? "destructive"
        : status === "running" || status === "pending"
          ? "secondary"
          : "outline";
  return <Badge variant={variant} className="capitalize">{status}</Badge>;
}

function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}k`;
  }
  return String(tokens);
}

function formatDuration(seconds: number): string {
  if (seconds < 1) {
    return `${(seconds * 1000).toFixed(0)}ms`;
  }
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}
