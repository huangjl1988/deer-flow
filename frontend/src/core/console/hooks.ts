import { useQuery } from "@tanstack/react-query";

import { loadConsoleRuns, loadConsoleStats, loadConsoleUsage } from "./api";

export const CONSOLE_STATS_KEY = ["console", "stats"] as const;
export const CONSOLE_RUNS_KEY = ["console", "runs"] as const;
export const CONSOLE_USAGE_KEY = ["console", "usage"] as const;

export function useConsoleStats() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: CONSOLE_STATS_KEY,
    queryFn: () => loadConsoleStats(),
    refetchOnWindowFocus: false,
  });
  return { stats: data, isLoading, error, refetch };
}

export function useConsoleRuns(params?: {
  limit?: number;
  status?: string;
}) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [...CONSOLE_RUNS_KEY, params?.status ?? "all", params?.limit ?? 50],
    queryFn: () => loadConsoleRuns(params),
    refetchOnWindowFocus: false,
  });
  return {
    runs: data?.runs ?? [],
    hasMore: data?.has_more ?? false,
    isLoading,
    error,
    refetch,
  };
}

export function useConsoleUsage(days = 30) {
  const { data, isLoading, error } = useQuery({
    queryKey: [...CONSOLE_USAGE_KEY, days],
    queryFn: () => loadConsoleUsage({ days }),
    refetchOnWindowFocus: false,
  });
  return { usage: data, isLoading, error };
}
