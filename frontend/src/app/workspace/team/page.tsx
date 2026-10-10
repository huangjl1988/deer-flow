"use client";

import { UsersIcon } from "lucide-react";
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

const FILTERS = ["all", "active", "pending"] as const;

export default function TeamPage() {
  const { t } = useI18n();

  useEffect(() => {
    document.title = `${t.sidebar.team} - ${t.pages.appName}`;
  }, [t.sidebar.team, t.pages.appName]);

  return (
    <WorkspaceContainer>
      <WorkspaceHeader />
      <WorkspaceBody>
        <div className="mx-auto flex w-full max-w-(--container-width-md) flex-col gap-6 p-6">
          <div>
            <h1 className="text-2xl font-semibold">
              {t.sidebar.team}
            </h1>
            <p className="text-muted-foreground text-sm">
              Team members, roles, and resource permissions
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
                <UsersIcon />
              </EmptyMedia>
              <EmptyTitle>No team members</EmptyTitle>
              <EmptyDescription>
                Invite team members to collaborate on agents, workflows, and
                datasets. Assign roles (Admin, Developer, Viewer) to control
                access to resources.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <p className="text-muted-foreground text-sm">
                Team management requires a backend router (teams and
                team_members tables exist in schema, router not yet
                implemented).
              </p>
            </EmptyContent>
          </Empty>
        </div>
      </WorkspaceBody>
    </WorkspaceContainer>
  );
}
