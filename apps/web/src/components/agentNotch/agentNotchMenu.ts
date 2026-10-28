import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import type { ContextMenuItem } from "@t3tools/contracts";
import { readThreadShells } from "../../state/entities";
import { useUiStateStore } from "../../uiStateStore";
import { agentProjectKey, isTopLevelThread, resolveProjectAgent } from "./agentNotch.logic";

export function projectAgentMenuItem(
  thread: EnvironmentThreadShell,
): ContextMenuItem<"project-agent"> | undefined {
  if (!isTopLevelThread(thread)) return undefined;
  return {
    id: "project-agent",
    label:
      findProjectAgent(thread).agent?.id === thread.id
        ? "Remove as project agent"
        : "Make project agent",
  };
}

export function toggleProjectAgent(thread: EnvironmentThreadShell) {
  const { key, agent } = findProjectAgent(thread);
  useUiStateStore.getState().setProjectAgent(key, agent?.id === thread.id ? null : thread.id);
}

function findProjectAgent(thread: EnvironmentThreadShell) {
  const project = { environmentId: thread.environmentId, id: thread.projectId };
  const key = agentProjectKey(project);
  const pointer = useUiStateStore.getState().projectAgentThreadIds[key];
  return { key, agent: resolveProjectAgent(project, readThreadShells(), pointer) };
}
