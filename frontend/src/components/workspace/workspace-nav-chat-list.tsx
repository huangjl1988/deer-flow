"use client";

import {
  ActivityIcon,
  BotIcon,
  BrainIcon,
  CalendarClock,
  ClipboardCheckIcon,
  CodeIcon,
  CpuIcon,
  FlaskConicalIcon,
  BugIcon,
  KeyRoundIcon,
  MessagesSquare,
  ScrollTextIcon,
  SparklesIcon,
  UsersIcon,
  WorkflowIcon,
  WrenchIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAgentsApiEnabled } from "@/core/agents";
import { useI18n } from "@/core/i18n/hooks";

export function WorkspaceNavChatList() {
  const { t } = useI18n();
  const pathname = usePathname();
  const { enabled: agentsEnabled } = useAgentsApiEnabled();
  return (
    <SidebarGroup className="pt-1">
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton isActive={pathname === "/workspace/chats"} asChild>
            <Link className="text-muted-foreground" href="/workspace/chats">
              <MessagesSquare />
              <span>{t.sidebar.chats}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          {agentsEnabled ? (
            <SidebarMenuButton
              isActive={pathname.startsWith("/workspace/agents")}
              asChild
            >
              <Link className="text-muted-foreground" href="/workspace/agents">
                <BotIcon />
                <span>{t.sidebar.agents}</span>
              </Link>
            </SidebarMenuButton>
          ) : (
            // Disabled: aria-disabled drives the sidebar CVA to suppress
            // pointer events on the button, so wrap it in a hoverable span
            // that still surfaces the "feature not enabled" tooltip for mouse
            // users. The button stays in the tab order (no tabIndex={-1}) and
            // is wired via aria-describedby to a visually-hidden reason, so
            // keyboard and screen-reader users also learn why it is disabled.
            <Tooltip>
              <TooltipTrigger asChild>
                {/* cursor-not-allowed lives on the span (the element that
                    still receives pointer events), not the inert button. */}
                <span className="block w-full cursor-not-allowed">
                  <SidebarMenuButton
                    className="text-muted-foreground/50"
                    aria-disabled
                    aria-describedby="agents-disabled-reason"
                  >
                    <BotIcon />
                    <span>{t.sidebar.agents}</span>
                  </SidebarMenuButton>
                  <span id="agents-disabled-reason" className="sr-only">
                    {t.sidebar.agentsDisabledTooltip}
                  </span>
                </span>
              </TooltipTrigger>
              <TooltipContent side="right">
                {t.sidebar.agentsDisabledTooltip}
              </TooltipContent>
            </Tooltip>
          )}
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            isActive={pathname.startsWith("/workspace/scheduled-tasks")}
            asChild
          >
            <Link
              className="text-muted-foreground"
              href="/workspace/scheduled-tasks"
            >
              <CalendarClock />
              <span>{t.sidebar.scheduledTasks}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            isActive={pathname.startsWith("/workspace/skills")}
            asChild
          >
            <Link className="text-muted-foreground" href="/workspace/skills">
              <SparklesIcon />
              <span>{t.sidebar.skills}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            isActive={pathname.startsWith("/workspace/tools")}
            asChild
          >
            <Link className="text-muted-foreground" href="/workspace/tools">
              <WrenchIcon />
              <span>{t.sidebar.tools}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            isActive={pathname.startsWith("/workspace/memory")}
            asChild
          >
            <Link className="text-muted-foreground" href="/workspace/memory">
              <BrainIcon />
              <span>{t.sidebar.memory}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            isActive={pathname.startsWith("/workspace/models")}
            asChild
          >
            <Link className="text-muted-foreground" href="/workspace/models">
              <CpuIcon />
              <span>{t.sidebar.models}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            isActive={pathname.startsWith("/workspace/workflows")}
            asChild
          >
            <Link className="text-muted-foreground" href="/workspace/workflows">
              <WorkflowIcon />
              <span>{t.sidebar.workflows}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            isActive={pathname.startsWith("/workspace/editor")}
            asChild
          >
            <Link className="text-muted-foreground" href="/workspace/editor">
              <CodeIcon />
              <span>{t.sidebar.editor}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            isActive={pathname.startsWith("/workspace/debugger")}
            asChild
          >
            <Link className="text-muted-foreground" href="/workspace/debugger">
              <BugIcon />
              <span>{t.sidebar.debugger}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            isActive={pathname.startsWith("/workspace/runs")}
            asChild
          >
            <Link className="text-muted-foreground" href="/workspace/runs">
              <FlaskConicalIcon />
              <span>{t.sidebar.runs}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            isActive={pathname.startsWith("/workspace/api-keys")}
            asChild
          >
            <Link className="text-muted-foreground" href="/workspace/api-keys">
              <KeyRoundIcon />
              <span>{t.sidebar.apiKeys}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            isActive={pathname.startsWith("/workspace/team")}
            asChild
          >
            <Link className="text-muted-foreground" href="/workspace/team">
              <UsersIcon />
              <span>{t.sidebar.team}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            isActive={pathname.startsWith("/workspace/traces")}
            asChild
          >
            <Link className="text-muted-foreground" href="/workspace/traces">
              <ActivityIcon />
              <span>{t.sidebar.traces}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            isActive={pathname.startsWith("/workspace/evaluations")}
            asChild
          >
            <Link
              className="text-muted-foreground"
              href="/workspace/evaluations"
            >
              <ClipboardCheckIcon />
              <span>{t.sidebar.evaluations}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            isActive={pathname.startsWith("/workspace/logs")}
            asChild
          >
            <Link className="text-muted-foreground" href="/workspace/logs">
              <ScrollTextIcon />
              <span>{t.sidebar.logs}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}
