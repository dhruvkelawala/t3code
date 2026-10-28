import { useSidebarProjectGroups } from "../../hooks/useSidebarProjectGroups";
import { useQuietThreadShells } from "../../state/entities";
import { useEnvironments } from "../../state/environments";
import { resolveProjectAgent } from "@t3tools/client-runtime/state/projects";
import { resolveThreadStatusPill } from "../Sidebar.logic";
import {
  assignAgentCords,
  resolveAgentCharacterColor,
  resolveAgentCharacterState,
} from "./agentCharacter.logic";
import { agentProjectKey, isTopLevelThread, statusPriority } from "./agentNotch.logic";

export function useAgentNotchProjects() {
  const groups = useSidebarProjectGroups();
  const threads = useQuietThreadShells();
  const { environments, networkStatus } = useEnvironments();
  const connected = environments.filter(
    (environment) => environment.connection.phase === "connected",
  );
  const items = groups.flatMap((group) =>
    group.memberProjects.flatMap((project) => {
      const key = agentProjectKey(project);
      const agent = resolveProjectAgent(project, threads);
      if (!agent) return [];
      const sessions = threads
        .filter(
          (thread) =>
            thread.environmentId === project.environmentId &&
            thread.projectId === project.id &&
            thread.id !== agent.id &&
            isTopLevelThread(thread) &&
            thread.settledOverride !== "settled",
        )
        .map((thread) => ({ thread, status: resolveThreadStatusPill({ thread }) }))
        .toSorted(
          (a, b) =>
            statusPriority(b.status) - statusPriority(a.status) ||
            b.thread.updatedAt.localeCompare(a.thread.updatedAt),
        );
      return [
        {
          key,
          project,
          projectScopeKey: group.projectKey,
          agent,
          status: resolveThreadStatusPill({ thread: agent }),
          sessions,
          offline:
            networkStatus === "offline" ||
            !connected.some((environment) => environment.environmentId === project.environmentId),
          environmentLabel:
            connected.length > 1
              ? environments.find(
                  (environment) => environment.environmentId === project.environmentId,
                )?.label
              : null,
        },
      ];
    }),
  );
  const cords = assignAgentCords(items.map((item) => item.project.title));
  return items.map((item) => ({
    ...item,
    character: {
      cord: cords.get(item.project.title) ?? 0,
      state: resolveAgentCharacterState(item.status, item.offline),
      color: resolveAgentCharacterColor(item.project),
    },
  }));
}

export type AgentNotchProject = ReturnType<typeof useAgentNotchProjects>[number];
