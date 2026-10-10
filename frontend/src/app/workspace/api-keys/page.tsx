"use client";

import { KeyRoundIcon } from "lucide-react";
import { useEffect } from "react";

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  WorkspaceBody,
  WorkspaceContainer,
  WorkspaceHeader,
} from "@/components/workspace/workspace-container";
import { useI18n } from "@/core/i18n/hooks";

export default function ApiKeysPage() {
  const { t } = useI18n();

  useEffect(() => {
    document.title = `${t.sidebar.apiKeys} - ${t.pages.appName}`;
  }, [t.sidebar.apiKeys, t.pages.appName]);

  return (
    <WorkspaceContainer>
      <WorkspaceHeader />
      <WorkspaceBody>
        <div className="mx-auto flex w-full max-w-(--container-width-md) flex-col gap-6 p-6">
          <div>
            <h1 className="text-2xl font-semibold">
              {t.sidebar.apiKeys}
            </h1>
            <p className="text-muted-foreground text-sm">
              Manage API keys for programmatic access to the Gateway
            </p>
          </div>

          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <KeyRoundIcon />
              </EmptyMedia>
              <EmptyTitle>No API keys</EmptyTitle>
              <EmptyDescription>
                Create API keys to authenticate external applications and
                services against the DeerFlow Gateway. Keys support scoped
                permissions and automatic rotation.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <p className="text-muted-foreground text-sm">
                API key management requires a backend router (api_keys table
                exists in schema, router not yet implemented).
              </p>
            </EmptyContent>
          </Empty>
        </div>
      </WorkspaceBody>
    </WorkspaceContainer>
  );
}
