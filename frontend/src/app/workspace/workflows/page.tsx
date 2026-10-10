"use client";

import { WorkflowIcon } from "lucide-react";
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

const FILTERS = ["all", "active", "draft", "archived"] as const;

export default function WorkflowsPage() {
  const { t } = useI18n();

  useEffect(() => {
    document.title = `${t.sidebar.workflows} - ${t.pages.appName}`;
  }, [t.sidebar.workflows, t.pages.appName]);

  return (
    <WorkspaceContainer>
      <WorkspaceHeader />
      <WorkspaceBody>
        <div className="mx-auto flex w-full max-w-(--container-width-md) flex-col gap-6 p-6">
          <div>
            <h1 className="text-2xl font-semibold">
              {t.sidebar.workflows}
            </h1>
            <p className="text-muted-foreground text-sm">
              Visual DAG orchestration for multi-agent workflows
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
                <WorkflowIcon />
              </EmptyMedia>
              <EmptyTitle>No workflows yet</EmptyTitle>
              <EmptyDescription>
                Workflows let you orchestrate multi-agent DAGs with conditional
                routing, parallel execution, and checkpoint-based replay.
                Create your first workflow to get started.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <p className="text-muted-foreground text-sm">
                Workflow editor and execution engine will be available in
                Phase 4.
              </p>
            </EmptyContent>
          </Empty>
        </div>
      </WorkspaceBody>
    </WorkspaceContainer>
  );
}
