"use client";

import { PlusIcon, Trash2Icon, UsersIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  WorkspaceBody,
  WorkspaceContainer,
  WorkspaceHeader,
} from "@/components/workspace/workspace-container";
import { useI18n } from "@/core/i18n/hooks";

interface TeamSummary {
  id: string;
  name: string;
  description: string;
  status: string;
  owner_user_id: string;
  member_count: number;
  created_at: string;
  updated_at: string;
}

interface TeamStats {
  total_teams: number;
  active_teams: number;
  total_members: number;
}

interface TeamMemberSummary {
  id: string;
  team_id: string;
  user_id: string;
  role: string;
  joined_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: "default",
  pending: "secondary",
  archived: "outline",
};

export default function TeamPage() {
  const { t } = useI18n();
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [stats, setStats] = useState<TeamStats | null>(null);
  const [filter, setFilter] = useState("all");
  const [isOpen, setIsOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [members, setMembers] = useState<TeamMemberSummary[]>([]);

  useEffect(() => {
    document.title = `${t.sidebar.team} - ${t.pages.appName}`;
  }, [t.sidebar.team, t.pages.appName]);

  const fetchTeams = () => {
    const params = new URLSearchParams();
    if (filter !== "all") params.set("status", filter);
    fetch(`/api/teams?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setTeams(Array.isArray(data) ? data : []))
      .catch(() => setTeams([]));
  };

  const fetchStats = () => {
    fetch("/api/teams/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setStats(data))
      .catch(() => setStats(null));
  };

  useEffect(() => {
    fetchTeams();
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const handleRowClick = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setMembers([]);
      return;
    }
    setExpandedId(id);
    setMembers([]);
    const data = await fetch(`/api/teams/${id}/members`).then((r) =>
      r.ok ? r.json() : []
    );
    setMembers(Array.isArray(data) ? data : []);
  };

  const handleCreate = async () => {
    await fetch("/api/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, description: newDesc, metadata: {} }),
    });
    setIsOpen(false);
    setNewName("");
    setNewDesc("");
    fetchTeams();
    fetchStats();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/teams/${id}`, { method: "DELETE" });
    if (expandedId === id) {
      setExpandedId(null);
      setMembers([]);
    }
    setTeams((prev) => prev.filter((tm) => tm.id !== id));
    fetchStats();
  };

  return (
    <WorkspaceContainer>
      <WorkspaceHeader />
      <WorkspaceBody>
        <div className="flex w-full flex-col gap-6 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">{t.sidebar.team}</h1>
              <p className="text-sm text-muted-foreground">
                Team members, roles, and resource permissions
              </p>
            </div>
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
              <DialogTrigger asChild>
                <Button>
                  <PlusIcon className="h-4 w-4" />
                  New Team
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Team</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Name</label>
                    <Input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Team name"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Description</label>
                    <Textarea
                      value={newDesc}
                      onChange={(e) => setNewDesc(e.target.value)}
                      placeholder="Team description"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => void handleCreate()}>Create</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {stats && (
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">Total Teams</p>
                <p className="text-2xl font-bold">{stats.total_teams}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">Active</p>
                <p className="text-2xl font-bold">{stats.active_teams}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">Total Members</p>
                <p className="text-2xl font-bold">{stats.total_members}</p>
              </div>
            </div>
          )}

          <Tabs value={filter} onValueChange={setFilter}>
            <TabsList variant="line">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="pending">Pending</TabsTrigger>
            </TabsList>
          </Tabs>

          {teams.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-center">
              <UsersIcon className="mb-2 h-12 w-12 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                No teams found. Create one to get started.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b last:border-0">
                    <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">
                      Status
                    </th>
                    <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">
                      Name
                    </th>
                    <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">
                      Description
                    </th>
                    <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">
                      Members
                    </th>
                    <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">
                      Owner
                    </th>
                    <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">
                      Created
                    </th>
                    <th className="text-muted-foreground pb-2 pr-4 font-medium text-left w-12" />
                  </tr>
                </thead>
                {teams.map((team) => (
                  <tbody key={team.id}>
                    <tr
                      className="cursor-pointer border-b last:border-0"
                      onClick={() => void handleRowClick(team.id)}
                    >
                      <td className="py-3 pr-4">
                        <Badge
                          variant={
                            (STATUS_COLORS[team.status] ?? "outline") as
                              | "default"
                              | "secondary"
                              | "destructive"
                              | "outline"
                          }
                        >
                          {team.status}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 font-medium">{team.name}</td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {team.description}
                      </td>
                      <td className="py-3 pr-4">{team.member_count}</td>
                      <td className="py-3 pr-4 font-mono text-xs">
                        {team.owner_user_id}
                      </td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">
                        {new Date(team.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 pr-4">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDelete(team.id);
                          }}
                        >
                          <Trash2Icon className="h-4 w-4 text-red-500" />
                        </Button>
                      </td>
                    </tr>
                    {expandedId === team.id && members.length > 0 && (
                      <tr>
                        <td colSpan={7} className="bg-muted/30 p-4">
                          <div className="mb-2 text-sm font-medium">
                            Members ({members.length})
                          </div>
                          <table className="w-full text-sm">
                            <thead>
                              <tr>
                                <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">
                                  User ID
                                </th>
                                <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">
                                  Role
                                </th>
                                <th className="text-muted-foreground pb-2 pr-4 font-medium text-left">
                                  Joined
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {members.map((m) => (
                                <tr
                                  key={m.id}
                                  className="border-b last:border-0"
                                >
                                  <td className="py-2 pr-4 font-mono text-xs">
                                    {m.user_id}
                                  </td>
                                  <td className="py-2 pr-4">
                                    <Badge
                                      variant={
                                        (m.role === "admin"
                                          ? "default"
                                          : "secondary") as
                                          | "default"
                                          | "secondary"
                                          | "destructive"
                                          | "outline"
                                      }
                                    >
                                      {m.role}
                                    </Badge>
                                  </td>
                                  <td className="py-2 pr-4 text-xs">
                                    {new Date(m.joined_at).toLocaleString()}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </tbody>
                ))}
              </table>
            </div>
          )}
        </div>
      </WorkspaceBody>
    </WorkspaceContainer>
  );
}
