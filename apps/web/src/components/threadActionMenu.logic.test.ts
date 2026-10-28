import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { makeThreadFixture } from "../test-fixtures";
import { projectAgentAction } from "../lib/projectAgentAction";
import { describe, expect, it } from "vite-plus/test";

import { buildThreadActionMenuItems, type ThreadActionMenuState } from "./threadActionMenu.logic";

const baseState: ThreadActionMenuState = {
  canOperate: true,
  branch: null,
  projectFilter: null,
  isPinned: false,
  isSettled: false,
  autoSettleEnabled: true,
  isSnoozed: false,
  canSnoozeNow: true,
  isRegeneratingTitle: false,
  isRunning: false,
  supports: {
    settlement: true,
    autoSettleOptOut: true,
    snooze: true,
    pinning: true,
    titleRegeneration: true,
  },
  snoozePresets: [
    { id: "hour", label: "In 1 hour", whenLabel: "3:00 PM", snoozedUntil: "2026-08-07T15:00:00Z" },
  ],
};

describe("buildThreadActionMenuItems", () => {
  it.each([false, true])(
    "disables both lifecycle directions without permission (reversed: %s)",
    (reversed) => {
      const items = buildThreadActionMenuItems({
        ...baseState,
        canOperate: false,
        projectAgentAction: {
          id: reversed ? "remove-project-agent" : "make-project-agent",
          label: "Project agent",
        },
        isPinned: reversed,
        isSettled: reversed,
        isSnoozed: reversed,
      });
      const expected = reversed
        ? [
            "unpin",
            "unsettle",
            "unsnooze",
            "rename",
            "regenerate-title",
            "auto-settle",
            "archive",
            "delete",
          ]
        : [
            "pin",
            "settle",
            "snooze",
            "rename",
            "regenerate-title",
            "auto-settle",
            "archive",
            "delete",
          ];
      expect(items.filter((item) => item.disabled).map((item) => item.id)).toEqual(expected);
      expect(
        items.find((item) => item.id === "snooze")?.children?.every((child) => child.disabled) ??
          true,
      ).toBe(true);
    },
  );

  it("disables archive and turning into a project while the thread is running", () => {
    const items = buildThreadActionMenuItems({
      ...baseState,
      isRunning: true,
      canTurnIntoProject: true,
    });
    expect(items.find((item) => item.id === "archive")?.disabled).toBe(true);
    expect(items.find((item) => item.id === "turn-into-project")?.disabled).toBe(true);
  });
});

describe("project agent action", () => {
  it("offers set for a fallback and clear only for an explicit assignment", () => {
    const environmentId = EnvironmentId.make("local");
    const project = { id: ProjectId.make("project-test"), environmentId };
    const thread = {
      ...makeThreadFixture({ environmentId }),
      pinnedAt: "2026-10-01T00:00:00Z",
    };
    expect(projectAgentAction(project, thread, true)?.id).toBe("make-project-agent");
    expect(projectAgentAction({ ...project, agentThreadId: thread.id }, thread, true)?.id).toBe(
      "remove-project-agent",
    );
    expect(
      projectAgentAction({ ...project, agentThreadId: ThreadId.make("other") }, thread, true)?.id,
    ).toBe("make-project-agent");
    for (const candidate of [
      thread,
      { ...thread, archivedAt: "2026-10-01T00:00:00Z" },
      { ...thread, deletedAt: "2026-10-01T00:00:00Z" },
      {
        ...thread,
        lineage: {
          ...thread.lineage,
          parentThreadId: ThreadId.make("parent"),
          relationshipToParent: "fork" as const,
        },
      },
      {
        ...thread,
        lineage: {
          ...thread.lineage,
          parentThreadId: ThreadId.make("parent"),
          relationshipToParent: "subagent" as const,
        },
      },
    ]) {
      expect(projectAgentAction(project, candidate, false)).toBeNull();
      if (candidate !== thread) expect(projectAgentAction(project, candidate, true)).toBeNull();
    }
    expect(projectAgentAction(null, thread, true)).toBeNull();
    expect(
      projectAgentAction({ ...project, environmentId: EnvironmentId.make("other") }, thread, true),
    ).toBeNull();
  });
});
