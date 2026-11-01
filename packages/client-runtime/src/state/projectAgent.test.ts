import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { scopeThreadShell } from "./models.ts";
import { v2Project, v2ThreadShell } from "./orchestrationV2TestFixtures.ts";
import { resolveProjectAgent } from "./projectAgent.ts";

const environmentId = EnvironmentId.make("local");
const project = { ...v2Project, environmentId };
const fallback = {
  ...scopeThreadShell(environmentId, v2ThreadShell),
  id: ThreadId.make("fallback"),
  pinnedAt: "2026-10-01T00:00:00.000Z",
};
const explicit = { ...fallback, id: ThreadId.make("explicit"), pinnedAt: null };

describe("resolveProjectAgent", () => {
  it("honors a usable explicit pointer even when unpinned or agent-created", () => {
    const agent = { ...explicit, source: { ...explicit.source, createdBy: "agent" as const } };
    expect(resolveProjectAgent({ ...project, agentThreadId: agent.id }, [fallback, agent])).toBe(
      agent,
    );
  });

  it.each([
    ["missing", null],
    ["archived", { ...explicit, archivedAt: "2026-10-02T00:00:00.000Z" }],
    ["deleted", { ...explicit, deletedAt: "2026-10-02T00:00:00.000Z" }],
    ["other project", { ...explicit, projectId: ProjectId.make("other") }],
    ["other environment", { ...explicit, environmentId: EnvironmentId.make("remote") }],
    [
      "fork",
      {
        ...explicit,
        lineage: {
          ...explicit.lineage,
          parentThreadId: fallback.id,
          relationshipToParent: "fork" as const,
        },
      },
    ],
    [
      "subagent",
      {
        ...explicit,
        lineage: {
          ...explicit.lineage,
          parentThreadId: fallback.id,
          relationshipToParent: "subagent" as const,
        },
      },
    ],
  ])("falls back when the pointer is %s", (_name, unusable) => {
    expect(
      resolveProjectAgent({ ...project, agentThreadId: explicit.id }, [
        fallback,
        ...(unusable ? [unusable] : []),
      ]),
    ).toBe(fallback);
  });

  it("selects the newest pinned user-created top-level thread with a stable tie break", () => {
    const newer = { ...fallback, id: ThreadId.make("a"), updatedAt: "2026-10-03T00:00:00.000Z" };
    const tied = { ...newer, id: ThreadId.make("b") };
    const ineligible = [
      { ...explicit, updatedAt: "2026-10-04T00:00:00.000Z" },
      { ...newer, source: { ...newer.source, createdBy: "agent" as const } },
      { ...newer, archivedAt: "2026-10-04T00:00:00.000Z" },
      { ...newer, deletedAt: "2026-10-04T00:00:00.000Z" },
      { ...newer, environmentId: EnvironmentId.make("remote") },
      { ...newer, projectId: ProjectId.make("other") },
      {
        ...newer,
        lineage: {
          ...newer.lineage,
          parentThreadId: explicit.id,
          relationshipToParent: "fork" as const,
        },
      },
    ];
    expect(resolveProjectAgent(project, [...ineligible, tied, fallback, newer])).toBe(newer);
    expect(resolveProjectAgent({ ...project, agentThreadId: null }, [newer, tied])).toBe(newer);
    expect(resolveProjectAgent(project, ineligible)).toBeNull();
    expect(resolveProjectAgent(project, [])).toBeNull();
  });
});
