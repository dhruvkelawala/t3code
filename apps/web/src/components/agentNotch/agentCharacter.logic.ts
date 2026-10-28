import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { deriveProjectIdentity } from "../../projectIdentity";
import type { ThreadStatusPill } from "../Sidebar.logic";

export type AgentCharacterState =
  | "idle"
  | "working"
  | "needs you"
  | "just finished"
  | "failed"
  | "offline";

export function assignAgentCords(seeds: readonly string[]): ReadonlyMap<string, number> {
  const cords = new Map([...new Set(seeds)].sort().map((seed) => [seed, naturalCord(seed)]));
  // Only a seed whose own cord an earlier seed already holds may move, so a collision never displaces a third agent.
  const used = new Set<number>();
  const displaced: Array<[string, number]> = [];
  for (const [seed, cord] of cords) {
    if (used.has(cord)) displaced.push([seed, cord]);
    else used.add(cord);
  }
  for (const [seed, natural] of displaced) {
    if (used.size === 8) used.clear();
    let cord = natural;
    while (used.has(cord)) cord = (cord + 1) & 7;
    used.add(cord);
    cords.set(seed, cord);
  }
  return cords;
}

export function resolveAgentCharacterState(
  status: Pick<ThreadStatusPill, "label"> | null,
  offline: boolean,
): AgentCharacterState {
  if (offline) return "offline";
  return status === null ? "idle" : STATUS_STATES[status.label];
}

export function resolveAgentCharacterColor(
  project: Pick<EnvironmentProject, "title" | "projectIcon">,
) {
  const icon = project.projectIcon;
  return icon?.kind === "lucide" || icon?.kind === "monogram"
    ? icon.color
    : deriveProjectIdentity(project.title).color;
}

function naturalCord(seed: string) {
  let hash = 2166136261;
  const input = `${seed}·wires:2249`;
  for (let index = 0; index < input.length; index++) {
    hash = Math.imul(hash ^ input.charCodeAt(index), 16777619);
  }
  return (hash ^ (hash >>> 16)) & 7;
}

const STATUS_STATES: Record<ThreadStatusPill["label"], AgentCharacterState> = {
  Working: "working",
  Connecting: "working",
  "Awaiting Input": "needs you",
  "Pending Approval": "needs you",
  "Guest Request": "needs you",
  Completed: "just finished",
  "Plan Ready": "just finished",
  Failed: "failed",
  Waiting: "idle",
};
