import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { THREAD_STATUS_PRIORITY, type ThreadStatusPill } from "../Sidebar.logic";

export function agentProjectKey(project: { environmentId: string; id: string }): string {
  return `${project.environmentId}:${project.id}`;
}

export function isTopLevelThread(
  thread: Pick<EnvironmentThreadShell, "lineage" | "delegatedFrom" | "deletedAt" | "archivedAt">,
): boolean {
  return (
    thread.lineage.relationshipToParent !== "subagent" &&
    thread.delegatedFrom === null &&
    thread.deletedAt === null &&
    thread.archivedAt === null
  );
}

export function needsUser(status: ThreadStatusPill | null): boolean {
  return (
    status !== null &&
    ["Pending Approval", "Awaiting Input", "Failed", "Guest Request"].includes(status.label)
  );
}

export function statusPriority(status: ThreadStatusPill | null): number {
  return status === null ? 0 : THREAD_STATUS_PRIORITY[status.label];
}

export function summarizeAgentSessions<T extends { status: ThreadStatusPill | null }>(
  sessions: readonly T[],
) {
  const statuses = sessions.map((session) => session.status);
  return {
    needsYou: statuses.filter(needsUser).length,
    working: statuses.filter(
      (status) => status?.label === "Working" || status?.label === "Connecting",
    ).length,
    active: sessions
      .filter((session) => session.status?.label !== "Completed")
      .toSorted((a, b) => statusPriority(b.status) - statusPriority(a.status)),
  };
}
