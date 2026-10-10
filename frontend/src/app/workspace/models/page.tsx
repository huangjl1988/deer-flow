"use client";

import { CpuIcon } from "lucide-react";
import { useEffect } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import {
  WorkspaceBody,
  WorkspaceContainer,
  WorkspaceHeader,
} from "@/components/workspace/workspace-container";
import { useI18n } from "@/core/i18n/hooks";
import { useModels } from "@/core/models";

export default function ModelsPage() {
  const { t } = useI18n();
  const { models, tokenUsageEnabled, isLoading, error } = useModels();

  useEffect(() => {
    document.title = `${t.sidebar.models} - ${t.pages.appName}`;
  }, [t.sidebar.models, t.pages.appName]);

  const providers = new Map<string, number>();
  for (const model of models) {
    const provider = extractProvider(model.model);
    providers.set(provider, (providers.get(provider) ?? 0) + 1);
  }

  return (
    <WorkspaceContainer>
      <WorkspaceHeader />
      <WorkspaceBody>
        <div className="mx-auto flex w-full max-w-(--container-width-md) flex-col gap-6 p-6">
          <div>
            <h1 className="text-2xl font-semibold">{t.sidebar.models}</h1>
            <p className="text-muted-foreground text-sm">
              {t.pages.appName} — Model providers and configuration
            </p>
          </div>

          {isLoading ? (
            <div className="text-muted-foreground text-sm">
              {t.common.loading}
            </div>
          ) : error ? (
            <div className="text-destructive text-sm">
              Error: {error.message}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Card>
                  <CardHeader>
                    <CardDescription>Total Models</CardDescription>
                    <CardTitle className="text-2xl">{models.length}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader>
                    <CardDescription>Providers</CardDescription>
                    <CardTitle className="text-2xl">
                      {providers.size}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader>
                    <CardDescription>Thinking Capable</CardDescription>
                    <CardTitle className="text-2xl">
                      {models.filter((m) => m.supports_thinking).length}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader>
                    <CardDescription>Token Usage</CardDescription>
                    <CardTitle className="text-2xl">
                      {tokenUsageEnabled ? "On" : "Off"}
                    </CardTitle>
                  </CardHeader>
                </Card>
              </div>

              {models.length === 0 ? (
                <div className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
                  No models configured. Add model providers in config.yaml.
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {models.map((model) => {
                    const provider = extractProvider(model.model);
                    return (
                      <Item key={model.name} className="w-full" variant="outline">
                        <ItemContent>
                          <ItemTitle>
                            <div className="flex items-center gap-2">
                              <CpuIcon className="size-4 text-muted-foreground" />
                              {model.display_name ?? model.name}
                            </div>
                          </ItemTitle>
                          {model.description && (
                            <ItemDescription className="line-clamp-2">
                              {model.description}
                            </ItemDescription>
                          )}
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Badge variant="secondary">{provider}</Badge>
                            <code className="text-muted-foreground text-xs">
                              {model.model}
                            </code>
                            {model.supports_thinking && (
                              <Badge variant="outline">Thinking</Badge>
                            )}
                            {model.supports_reasoning_effort && (
                              <Badge variant="outline">Reasoning</Badge>
                            )}
                          </div>
                        </ItemContent>
                      </Item>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </WorkspaceBody>
    </WorkspaceContainer>
  );
}

function extractProvider(modelId: string): string {
  if (modelId.includes("/")) {
    return modelId.split("/")[0];
  }
  if (modelId.startsWith("gpt") || modelId.startsWith("o1") || modelId.startsWith("o3")) {
    return "openai";
  }
  if (modelId.startsWith("claude")) {
    return "anthropic";
  }
  if (modelId.startsWith("gemini")) {
    return "google";
  }
  if (
    modelId.startsWith("deepseek") ||
    modelId.startsWith("qwen") ||
    modelId.startsWith("llama")
  ) {
    return "open-source";
  }
  return "other";
}
