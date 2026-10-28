import type { EnvironmentProject, EnvironmentThreadShell } from "./models.ts";

type AgentThread = Pick<
  EnvironmentThreadShell,
  | "environmentId"
  | "id"
  | "projectId"
  | "lineage"
  | "archivedAt"
  | "deletedAt"
  | "pinnedAt"
  | "updatedAt"
> & { readonly source: Pick<EnvironmentThreadShell["source"], "createdBy"> };

export function isProjectAgentThread(
  thread: Pick<AgentThread, "lineage" | "archivedAt" | "deletedAt">,
): boolean {
  return (
    thread.lineage.parentThreadId === null &&
    thread.lineage.relationshipToParent === null &&
    thread.archivedAt === null &&
    thread.deletedAt === null
  );
}

export function resolveProjectAgent<T extends AgentThread>(
  project: Pick<EnvironmentProject, "id" | "environmentId" | "agentThreadId">,
  threads: ReadonlyArray<T>,
): T | null {
  let fallback: T | null = null;
  for (const thread of threads) {
    if (
      thread.environmentId !== project.environmentId ||
      thread.projectId !== project.id ||
      !isProjectAgentThread(thread)
    )
      continue;
    if (thread.id === project.agentThreadId) return thread;
    if (thread.pinnedAt === null || thread.source.createdBy !== "user") continue;
    if (
      fallback === null ||
      thread.updatedAt > fallback.updatedAt ||
      (thread.updatedAt === fallback.updatedAt && thread.id < fallback.id)
    )
      fallback = thread;
  }
  return fallback;
}
