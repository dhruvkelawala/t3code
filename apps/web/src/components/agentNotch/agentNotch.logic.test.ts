import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { makeThreadFixture } from "../../test-fixtures";
import type { ThreadStatusPill } from "../Sidebar.logic";
import { summarizeAgentSessions, resolveProjectAgent } from "./agentNotch.logic";

const environmentId = EnvironmentId.make("local");
const projectId = ProjectId.make("project-test");
const project = { environmentId, id: projectId };

function candidate(
  id: string,
  updatedAt: string,
  overrides: Partial<ReturnType<typeof makeThreadFixture>> = {},
) {
  const thread = makeThreadFixture({
    id: ThreadId.make(id),
    projectId,
    updatedAt,
    pinnedAt: updatedAt,
    ...overrides,
  });
  return { ...thread, environmentId, source: { createdBy: "user" as const } };
}

const earlier = "2026-10-27T00:00:00.000Z";
const later = "2026-10-28T00:00:00.000Z";

describe("project agent", () => {
  it("prefers a valid explicit thread, otherwise the most recently updated user-pinned top-level thread", () => {
    const older = candidate("older", earlier);
    const newer = candidate("newer", later);
    const unpinned = candidate("explicit", earlier, { pinnedAt: null });
    const child = candidate("child", later, {
      lineage: {
        rootThreadId: older.id,
        parentThreadId: older.id,
        relationshipToParent: "subagent",
      },
    });
    const fork = candidate("fork", later, {
      lineage: { rootThreadId: older.id, parentThreadId: older.id, relationshipToParent: "fork" },
    });
    expect(resolveProjectAgent(project, [older, fork], undefined)?.id).toBe(fork.id);
    const generated = { ...candidate("generated", later), source: { createdBy: "agent" as const } };
    const threads = [older, newer, unpinned, child, generated];
    expect(resolveProjectAgent(project, threads, unpinned.id)?.id).toBe(unpinned.id);
    expect(resolveProjectAgent(project, threads, undefined)?.id).toBe(newer.id);
    expect(resolveProjectAgent(project, [older, child, generated], undefined)?.id).toBe(older.id);
    expect(resolveProjectAgent(project, [unpinned, child, generated], undefined)).toBeNull();
  });

  it("ignores missing, archived, deleted, foreign-project, foreign-environment and child pointers", () => {
    const fallback = candidate("fallback", earlier);
    const invalid = [
      candidate("archived", later, { archivedAt: later }),
      candidate("deleted", later, { deletedAt: later }),
      candidate("foreign", later, { projectId: ProjectId.make("other") }),
      { ...candidate("remote", later), environmentId: EnvironmentId.make("remote") },
      candidate("child", later, {
        lineage: {
          rootThreadId: fallback.id,
          parentThreadId: fallback.id,
          relationshipToParent: "subagent",
        },
      }),
    ];
    for (const pointer of ["missing", ...invalid.map((thread) => thread.id)]) {
      expect(resolveProjectAgent(project, [fallback, ...invalid], pointer)?.id).toBe(fallback.id);
    }
  });
});

describe("agent session ring", () => {
  it("omits Completed and sorts the active sessions by urgency", () => {
    const status = (label: ThreadStatusPill["label"]): ThreadStatusPill => ({
      label,
      colorClass: "",
      dotClass: "",
      pulse: false,
    });
    const sessions = [
      null,
      status("Completed"),
      status("Working"),
      status("Failed"),
      status("Pending Approval"),
      status("Awaiting Input"),
      status("Connecting"),
      status("Plan Ready"),
      status("Guest Request"),
    ].map((status) => ({ status }));
    const summary = summarizeAgentSessions(sessions);
    expect(summary.active.map((session) => session.status?.label ?? null)).toEqual([
      "Pending Approval",
      "Awaiting Input",
      "Guest Request",
      "Failed",
      "Working",
      "Connecting",
      "Plan Ready",
      null,
    ]);
    expect(summary).toMatchObject({ needsYou: 4, working: 2 });
    expect(summarizeAgentSessions([{ status: status("Completed") }])).toEqual({
      active: [],
      needsYou: 0,
      working: 0,
    });
  });
});
