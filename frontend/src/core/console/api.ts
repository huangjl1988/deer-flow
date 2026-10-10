import { throwGatewayApiError } from "@/core/api/errors";
import { fetch } from "@/core/api/fetcher";
import { getBackendBaseURL } from "@/core/config";
import { isStaticWebsiteOnly } from "@/core/static-mode";

import type { ConsoleRunsResponse, ConsoleStats, ConsoleUsage } from "./types";

export async function loadConsoleStats(): Promise<ConsoleStats> {
  if (isStaticWebsiteOnly()) {
    return {
      total_runs: 0,
      active_runs: 0,
      failed_runs: 0,
      total_threads: 0,
      total_agents: 0,
      total_tokens: 0,
      total_cost: null,
      currency: null,
    };
  }

  const res = await fetch(`${getBackendBaseURL()}/api/console/stats`);
  if (!res.ok) {
    await throwGatewayApiError(
      res,
      `Failed to load console stats: ${res.status} ${res.statusText}`.trim(),
    );
  }
  return (await res.json()) as ConsoleStats;
}

export async function loadConsoleRuns(params?: {
  limit?: number;
  cursor?: string;
  status?: string;
}): Promise<ConsoleRunsResponse> {
  if (isStaticWebsiteOnly()) {
    return { runs: [], has_more: false };
  }

  const searchParams = new URLSearchParams();
  if (params?.limit) {
    searchParams.set("limit", String(params.limit));
  }
  if (params?.cursor) {
    searchParams.set("cursor", params.cursor);
  }
  if (params?.status && params.status !== "all") {
    searchParams.set("status", params.status);
  }
  const qs = searchParams.toString();
  const url = `${getBackendBaseURL()}/api/console/runs${qs ? `?${qs}` : ""}`;

  const res = await fetch(url);
  if (!res.ok) {
    await throwGatewayApiError(
      res,
      `Failed to load runs: ${res.status} ${res.statusText}`.trim(),
    );
  }
  return (await res.json()) as ConsoleRunsResponse;
}

export async function loadConsoleUsage(params?: {
  days?: number;
}): Promise<ConsoleUsage> {
  if (isStaticWebsiteOnly()) {
    return {
      days: [],
      by_model: {},
      total_tokens: 0,
      total_runs: 0,
      total_cost: null,
      currency: null,
    };
  }

  const searchParams = new URLSearchParams();
  if (params?.days) {
    searchParams.set("days", String(params.days));
  }
  const qs = searchParams.toString();
  const url = `${getBackendBaseURL()}/api/console/usage${qs ? `?${qs}` : ""}`;

  const res = await fetch(url);
  if (!res.ok) {
    await throwGatewayApiError(
      res,
      `Failed to load usage: ${res.status} ${res.statusText}`.trim(),
    );
  }
  return (await res.json()) as ConsoleUsage;
}
