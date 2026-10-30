import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";
import { isProjectAgentThread } from "@t3tools/client-runtime/state/projects";

export type ProjectAgentActionId = "make-project-agent" | "remove-project-agent";

export function projectAgentAction(
  project: Pick<EnvironmentProject, "id" | "environmentId" | "agentThreadId"> | null | undefined,
  thread: Pick<
    EnvironmentThreadShell,
    "environmentId" | "id" | "projectId" | "lineage" | "archivedAt" | "deletedAt"
  >,
  canSet: boolean,
): { id: ProjectAgentActionId; label: string; icon: string } | null {
  if (
    !canSet ||
    !project ||
    project.agentThreadId === undefined ||
    project.environmentId !== thread.environmentId ||
    project.id !== thread.projectId ||
    !isProjectAgentThread(thread)
  )
    return null;
  return project.agentThreadId === thread.id
    ? { id: "remove-project-agent", label: "Remove as project agent", icon: "message-square" }
    : { id: "make-project-agent", label: "Make project agent", icon: "message-square" };
}
