"use client";

import { ClipboardCheckIcon } from "lucide-react";
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

const FILTERS = ["all", "passed", "failed", "pending"] as const;

export default function EvaluationsPage() {
  const { t } = useI18n();

  useEffect(() => {
    document.title = `${t.sidebar.evaluations} - ${t.pages.appName}`;
  }, [t.sidebar.evaluations, t.pages.appName]);

  return (
    <WorkspaceContainer>
      <WorkspaceHeader />
      <WorkspaceBody>
        <div className="mx-auto flex w-full max-w-(--container-width-md) flex-col gap-6 p-6">
          <div>
            <h1 className="text-2xl font-semibold">
              {t.sidebar.evaluations}
            </h1>
            <p className="text-muted-foreground text-sm">
              Quality evaluation results — scoring dimensions, pass rates,
              and trend analysis across runs
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
                <ClipboardCheckIcon />
              </EmptyMedia>
              <EmptyTitle>No evaluations yet</EmptyTitle>
              <EmptyDescription>
                Evaluations score agent outputs across dimensions like
                accuracy, relevance, safety, and helpfulness. Run
                evaluations against datasets to track quality trends over
                time. The schema (evaluations, evaluation_runs,
                evaluation_cases, evaluation_results) is ready.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <p className="text-muted-foreground text-sm">
                Evaluation management requires a backend router. The
                database tables exist in schema_agentforge_postgres.sql but
                no API endpoint is implemented yet.
              </p>
            </EmptyContent>
          </Empty>
        </div>
      </WorkspaceBody>
    </WorkspaceContainer>
  );
}
