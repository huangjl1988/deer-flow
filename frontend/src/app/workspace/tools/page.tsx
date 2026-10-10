"use client";

import { WrenchIcon } from "lucide-react";
import { useEffect } from "react";

import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { Switch } from "@/components/ui/switch";
import {
  WorkspaceBody,
  WorkspaceContainer,
  WorkspaceHeader,
} from "@/components/workspace/workspace-container";
import { useI18n } from "@/core/i18n/hooks";
import { MCPConfigRequestError } from "@/core/mcp/api";
import { useEnableMCPServer, useMCPConfig } from "@/core/mcp/hooks";
import type { MCPServerConfig } from "@/core/mcp/types";
import { env } from "@/env";

export default function ToolsPage() {
  const { t } = useI18n();
  const { config, isLoading, error } = useMCPConfig();
  const adminRequired =
    error instanceof MCPConfigRequestError && error.isAdminRequired;

  useEffect(() => {
    document.title = `${t.sidebar.tools} - ${t.pages.appName}`;
  }, [t.sidebar.tools, t.pages.appName]);

  const servers = Object.entries(config?.mcp_servers ?? {});
  const enabledCount = servers.filter(([, c]) => c.enabled).length;

  return (
    <WorkspaceContainer>
      <WorkspaceHeader />
      <WorkspaceBody>
        <div className="mx-auto flex w-full max-w-(--container-width-md) flex-col gap-6 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">
                {t.settings.tools.title}
              </h1>
              <p className="text-muted-foreground text-sm">
                {t.settings.tools.description}
              </p>
            </div>
            <div className="text-muted-foreground text-sm">
              {enabledCount}/{servers.length} enabled
            </div>
          </div>

          {isLoading ? (
            <div className="text-muted-foreground text-sm">
              {t.common.loading}
            </div>
          ) : adminRequired ? (
            <div className="text-muted-foreground text-sm">
              {t.settings.tools.adminRequired}
            </div>
          ) : error ? (
            <div className="text-destructive text-sm">
              Error: {error.message}
            </div>
          ) : servers.length === 0 ? (
            <div className="text-muted-foreground text-sm">
              {t.settings.tools.empty}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {servers.map(([name, serverConfig]) => (
                <MCPServerItem
                  key={name}
                  name={name}
                  config={serverConfig}
                />
              ))}
            </div>
          )}
        </div>
      </WorkspaceBody>
    </WorkspaceContainer>
  );
}

function MCPServerItem({
  name,
  config,
}: {
  name: string;
  config: MCPServerConfig;
}) {
  const { isPending, mutate: enableMCPServer } = useEnableMCPServer();
  const staticOnly = env.NEXT_PUBLIC_STATIC_WEBSITE_ONLY === "true";

  return (
    <Item className="w-full" variant="outline">
      <ItemContent>
        <ItemTitle>
          <div className="flex items-center gap-2">
            <WrenchIcon className="size-4 text-muted-foreground" />
            {name}
          </div>
        </ItemTitle>
        {config.description && (
          <ItemDescription className="line-clamp-4">
            {config.description}
          </ItemDescription>
        )}
      </ItemContent>
      <ItemActions>
        <Switch
          checked={config.enabled}
          disabled={staticOnly || isPending}
          onCheckedChange={(checked) =>
            enableMCPServer({ serverName: name, enabled: checked })
          }
        />
      </ItemActions>
    </Item>
  );
}
