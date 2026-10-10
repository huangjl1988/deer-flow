"use client";

import { ActivityIcon } from "lucide-react";
import { useEffect } from "react";

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  WorkspaceBody,
  WorkspaceContainer,
  WorkspaceHeader,
} from "@/components/workspace/workspace-container";
import { useI18n } from "@/core/i18n/hooks";

const FILTERS = ["all", "success", "error", "slow"] as const;

export default function TracesPage() {
  const { t } = useI18n();

  useEffect(() => {
    document.title = `${t.sidebar.traces} - ${t.pages.appName}`;
  }, [t.sidebar.traces, t.pages.appName]);

  return (
    <WorkspaceContainer>
      <WorkspaceHeader />
      <WorkspaceBody>
        <div className="mx-auto flex w-full max-w-(--container-width-md) flex-col gap-6 p-6">
          <div>
            <h1 className="text-2xl font-semibold">
              {t.sidebar.traces}
            </h1>
            <p className="text-muted-foreground text-sm">
              Distributed tracing for agent runs — span waterfalls, call
              trees, and attribute inspection
            </p>
          </div>

          <Tabs defaultValue="all">
            <TabsList variant="line">
              {FILTERS.map((f) => (
                <TabsTrigger key={f} value={f} className="capitalize">
                  {f}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ActivityIcon />
              </EmptyMedia>
              <EmptyTitle>No traces collected</EmptyTitle>
              <EmptyDescription>
                Traces capture the full execution path of each agent run —
                LLM calls, tool invocations, sub-agent dispatches, and
                checkpoint writes — as a span tree. Enable tracing in
                config.yaml to start collecting OpenTelemetry spans from the
                Gateway and harness.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <p className="text-muted-foreground text-sm">
                Tracing requires a backend router and OpenTelemetry
                collector. Neither is configured yet.
              </p>
            </EmptyContent>
          </Empty>
        </div>
      </WorkspaceBody>
    </WorkspaceContainer>
  );
}
