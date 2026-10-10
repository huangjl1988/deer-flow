"use client";

import { ActivityIcon, ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  WorkspaceBody,
  WorkspaceContainer,
  WorkspaceHeader,
} from "@/components/workspace/workspace-container";
import { useI18n } from "@/core/i18n/hooks";

interface TraceSummary {
  run_id: string;
  thread_id: string;
  assistant_id: string | null;
  status: string;
  span_count: number;
  model_name: string | null;
  total_tokens: number;
  duration_seconds: number | null;
  created_at: string | null;
  updated_at: string | null;
  first_message: string | null;
  error: string | null;
}

interface TraceStats {
  total_traces: number;
  success_rate: number;
  avg_duration_seconds: number;
  total_spans: number;
}

interface TraceSpan {
  span_id: string;
  parent_span_id: string | null;
  name: string;
  service: string;
  status: string;
  duration_seconds: number | null;
  start_time: string | null;
  end_time: string | null;
  attributes: Record<string, unknown>;
}

interface TraceDetail {
  run_id: string;
  thread_id: string;
  status: string;
  spans: TraceSpan[];
}

const STATUS_COLORS: Record<string, string> = {
  success: "default",
  error: "destructive",
  timeout: "destructive",
  running: "secondary",
  pending: "outline",
};

const STATUSES = ["all", "success", "error", "timeout"] as const;
const SERVICES = ["all", "gateway", "frontend", "scheduler", "sandbox"] as const;

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "-";
  if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`;
  return `${seconds.toFixed(2)}s`;
}

export default function TracesPage() {
  const { t } = useI18n();
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [stats, setStats] = useState<TraceStats | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TraceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    document.title = `${t.sidebar.traces} - ${t.pages.appName}`;
  }, [t.sidebar.traces, t.pages.appName]);

  useEffect(() => {
    setIsLoading(true);
    const params = new URLSearchParams({ limit: "50", offset: "0" });
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (serviceFilter !== "all") params.set("service", serviceFilter);
    fetch(`/api/traces?${params}`)
      .then((r) => r.ok ? r.json() : { traces: [] })
      .then((data) => setTraces(data.traces ?? []))
      .catch(() => setTraces([]))
      .finally(() => setIsLoading(false));
    fetch("/api/traces/stats")
      .then((r) => r.ok ? r.json() : null)
      .then((data: TraceStats | null) => setStats(data))
      .catch(() => setStats(null));
  }, [statusFilter, serviceFilter]);

  const toggleExpand = (runId: string) => {
    if (expandedRunId === runId) {
      setExpandedRunId(null);
      setDetail(null);
      return;
    }
    setExpandedRunId(runId);
    setDetail(null);
    setDetailLoading(true);
    fetch(`/api/traces/${runId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data: TraceDetail | null) => setDetail(data))
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  };

  return (
    <WorkspaceContainer>
      <WorkspaceHeader />
      <WorkspaceBody>
        <div>
          <h1 className="text-2xl font-bold">{t.sidebar.traces}</h1>
          <p className="text-sm text-muted-foreground">
            Distributed tracing for agent runs — span trees, call paths, and
            token attribution
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card>
            <CardHeader>
              <CardDescription>Total Traces</CardDescription>
              <CardTitle className="text-2xl">
                {stats?.total_traces ?? 0}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Success Rate</CardDescription>
              <CardTitle className="text-2xl">
                {stats ? `${(stats.success_rate * 100).toFixed(1)}%` : "0%"}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Avg Duration</CardDescription>
              <CardTitle className="text-2xl">
                {stats ? formatDuration(stats.avg_duration_seconds) : "-"}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Total Spans</CardDescription>
              <CardTitle className="text-2xl">
                {stats?.total_spans ?? 0}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList variant="line">
              {STATUSES.map((s) => (
                <TabsTrigger key={s} value={s} className="capitalize">
                  {s}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Tabs value={serviceFilter} onValueChange={setServiceFilter}>
            <TabsList variant="line">
              {SERVICES.map((s) => (
                <TabsTrigger key={s} value={s} className="capitalize">
                  {s}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : traces.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-center">
            <ActivityIcon className="mb-2 h-12 w-12 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              No traces found. Adjust filters to see entries.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b last:border-0">
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left w-8" />
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">
                    Status
                  </th>
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">
                    Run ID
                  </th>
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">
                    Assistant
                  </th>
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">
                    Spans
                  </th>
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">
                    Tokens
                  </th>
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">
                    Duration
                  </th>
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">
                    Created
                  </th>
                  <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">
                    First Message
                  </th>
                </tr>
              </thead>
              <tbody>
                {traces.map((trace) => {
                  const isExpanded = expandedRunId === trace.run_id;
                  return (
                    <FragmentRow
                      key={trace.run_id}
                      trace={trace}
                      isExpanded={isExpanded}
                      detail={isExpanded ? detail : null}
                      detailLoading={isExpanded && detailLoading}
                      onToggle={() => toggleExpand(trace.run_id)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </WorkspaceBody>
    </WorkspaceContainer>
  );
}

interface FragmentRowProps {
  trace: TraceSummary;
  isExpanded: boolean;
  detail: TraceDetail | null;
  detailLoading: boolean;
  onToggle: () => void;
}

function FragmentRow({
  trace,
  isExpanded,
  detail,
  detailLoading,
  onToggle,
}: FragmentRowProps) {
  return (
    <>
      <tr
        className="border-b last:border-0 cursor-pointer hover:bg-muted/50"
        onClick={onToggle}
      >
        <td className="py-3 pr-4">
          {isExpanded ? (
            <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
          )}
        </td>
        <td className="py-3 pr-4">
          <Badge
            variant={(STATUS_COLORS[trace.status] ?? "outline") as "default" | "secondary" | "destructive" | "outline"}
            className="capitalize"
          >
            {trace.status}
          </Badge>
        </td>
        <td className="py-3 pr-4 font-mono text-xs">{trace.run_id}</td>
        <td className="py-3 pr-4">
          {trace.assistant_id ?? "-"}
        </td>
        <td className="py-3 pr-4">{trace.span_count}</td>
        <td className="py-3 pr-4">{trace.total_tokens}</td>
        <td className="py-3 pr-4">
          {formatDuration(trace.duration_seconds)}
        </td>
        <td className="py-3 pr-4 text-xs text-muted-foreground">
          {trace.created_at
            ? new Date(trace.created_at).toLocaleString()
            : "-"}
        </td>
        <td className="py-3 pr-4 text-xs text-muted-foreground max-w-md truncate">
          {trace.first_message ?? "-"}
        </td>
      </tr>
      {isExpanded && (
        <tr className="border-b last:border-0">
          <td colSpan={9} className="bg-muted/30 p-4">
            {detailLoading ? (
              <p className="text-sm text-muted-foreground">Loading spans...</p>
            ) : detail && detail.spans.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">
                        Span ID
                      </th>
                      <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">
                        Name
                      </th>
                      <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">
                        Service
                      </th>
                      <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">
                        Status
                      </th>
                      <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">
                        Duration
                      </th>
                      <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">
                        Start
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.spans.map((span) => (
                      <tr key={span.span_id} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-mono text-xs">
                          {span.span_id}
                        </td>
                        <td className="py-2 pr-4">{span.name}</td>
                        <td className="py-2 pr-4">{span.service}</td>
                        <td className="py-2 pr-4">
                          <Badge
                            variant={(STATUS_COLORS[span.status] ?? "outline") as "default" | "secondary" | "destructive" | "outline"}
                            className="capitalize"
                          >
                            {span.status}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4">
                          {formatDuration(span.duration_seconds)}
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">
                          {span.start_time
                            ? new Date(span.start_time).toLocaleString()
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No span data available for this trace.
              </p>
            )}
            {trace.error && (
              <p className="mt-2 text-xs text-red-500">Error: {trace.error}</p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
