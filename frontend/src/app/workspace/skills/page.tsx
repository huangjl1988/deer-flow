"use client";

import { SparklesIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  WorkspaceBody,
  WorkspaceContainer,
  WorkspaceHeader,
} from "@/components/workspace/workspace-container";
import { useAuth } from "@/core/auth/AuthProvider";
import { useI18n } from "@/core/i18n/hooks";
import { SkillRequestError } from "@/core/skills/api";
import { useEnableSkill, useSkills } from "@/core/skills/hooks";
import type { Skill } from "@/core/skills/type";
import { env } from "@/env";

export default function SkillsPage() {
  const { t } = useI18n();
  const { skills, isLoading, error } = useSkills();
  const adminRequired =
    error instanceof SkillRequestError && error.isAdminRequired;
  const [filter, setFilter] = useState("public");

  useEffect(() => {
    document.title = `${t.sidebar.skills} - ${t.pages.appName}`;
  }, [t.sidebar.skills, t.pages.appName]);

  const filteredSkills = useMemo(
    () => skills.filter((skill) => skill.category === filter),
    [skills, filter],
  );

  const enabledCount = skills.filter((s) => s.enabled).length;

  return (
    <WorkspaceContainer>
      <WorkspaceHeader />
      <WorkspaceBody>
        <div className="mx-auto flex w-full max-w-(--container-width-md) flex-col gap-6 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">
                {t.settings.skills.title}
              </h1>
              <p className="text-muted-foreground text-sm">
                {t.settings.skills.description}
              </p>
            </div>
            <div className="text-muted-foreground text-sm">
              {enabledCount}/{skills.length} enabled
            </div>
          </div>

          {isLoading ? (
            <div className="text-muted-foreground text-sm">
              {t.common.loading}
            </div>
          ) : adminRequired ? (
            <div className="text-muted-foreground text-sm">
              {t.settings.skills.adminRequired}
            </div>
          ) : error ? (
            <div className="text-destructive text-sm">Error: {error.message}</div>
          ) : (
            <>
              <Tabs defaultValue="public" onValueChange={setFilter}>
                <TabsList variant="line">
                  <TabsTrigger value="public">{t.common.public}</TabsTrigger>
                  <TabsTrigger value="custom">{t.common.custom}</TabsTrigger>
                </TabsList>
              </Tabs>

              {filteredSkills.length === 0 ? (
                <EmptySkillsPage />
              ) : (
                <div className="flex flex-col gap-3">
                  {filteredSkills.map((skill) => (
                    <SkillItem key={skill.name} skill={skill} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </WorkspaceBody>
    </WorkspaceContainer>
  );
}

function SkillItem({
  skill,
}: {
  skill: Skill;
}) {
  const { user } = useAuth();
  const isAdmin = user?.system_role === "admin";
  const { mutate: enableSkill } = useEnableSkill();
  const staticOnly = env.NEXT_PUBLIC_STATIC_WEBSITE_ONLY === "true";

  return (
    <Item className="w-full" variant="outline">
      <ItemContent>
        <ItemTitle>
          <div className="flex items-center gap-2">
            <SparklesIcon className="size-4 text-muted-foreground" />
            {skill.name}
          </div>
        </ItemTitle>
        <ItemDescription className="line-clamp-4">
          {skill.description}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Switch
          checked={skill.enabled}
          disabled={staticOnly || !isAdmin}
          onCheckedChange={(checked) =>
            enableSkill({ skillName: skill.name, enabled: checked })
          }
        />
      </ItemActions>
    </Item>
  );
}

function EmptySkillsPage() {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SparklesIcon />
        </EmptyMedia>
        <EmptyTitle>{t.settings.skills.emptyTitle}</EmptyTitle>
        <EmptyDescription>
          {t.settings.skills.emptyDescription}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={() => router.push("/workspace/chats/new?mode=skill")}>
          {t.settings.skills.emptyButton}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
