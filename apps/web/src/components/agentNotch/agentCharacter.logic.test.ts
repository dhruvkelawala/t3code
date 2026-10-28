import { describe, expect, it } from "vite-plus/test";
import { deriveProjectIdentity } from "../../projectIdentity";
import type { ThreadStatusPill } from "../Sidebar.logic";
import {
  assignAgentCords,
  resolveAgentCharacterColor,
  resolveAgentCharacterState,
  type AgentCharacterState,
} from "./agentCharacter.logic";

describe("agent cords", () => {
  it.each([
    ["t3code", 6],
    ["lore", 7],
    ["skills", 4],
    ["career-ops", 5],
  ] as const)("assigns %s its FNV-1a cord", (seed, cord) => {
    expect(assignAgentCords([seed]).get(seed)).toBe(cord);
  });

  it("moves only the later seed of a collision, past cords others own, independently of sidebar order", () => {
    // alpha and beta both hash to 6; delta hashes to 7 and must keep it.
    for (const seeds of [
      ["alpha", "beta", "delta"],
      ["delta", "beta", "alpha"],
      ["beta", "alpha", "delta"],
    ]) {
      expect([...assignAgentCords(seeds)]).toEqual([
        ["alpha", 6],
        ["beta", 0],
        ["delta", 7],
      ]);
    }
  });

  it("shares a cord for identical names and repeats a cord only once all eight are used", () => {
    const seeds = Array.from({ length: 17 }, (_, index) => `project-${index}`);
    const cords = assignAgentCords([...seeds, seeds[0]!]);
    expect(cords.size).toBe(17);
    const counts = Array.from({ length: 8 }, (_, cord) =>
      [...cords.values()].filter((value) => value === cord),
    ).map((uses) => uses.length);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    expect(cords).toEqual(assignAgentCords(seeds.toReversed()));
  });
});

describe("agent character state", () => {
  const states = {
    Working: "working",
    Connecting: "working",
    "Awaiting Input": "needs you",
    "Pending Approval": "needs you",
    "Guest Request": "needs you",
    Completed: "just finished",
    "Plan Ready": "just finished",
    Failed: "failed",
    Waiting: "idle",
  } satisfies Record<ThreadStatusPill["label"], AgentCharacterState>;

  it.each(Object.entries(states))("maps %s and lets offline override it", (label, state) => {
    const status = { label: label as ThreadStatusPill["label"] };
    expect(resolveAgentCharacterState(status, false)).toBe(state);
    expect(resolveAgentCharacterState(status, true)).toBe("offline");
  });

  it("rests without a status unless its environment is offline", () => {
    expect(resolveAgentCharacterState(null, false)).toBe("idle");
    expect(resolveAgentCharacterState(null, true)).toBe("offline");
  });
});

describe("agent character colour", () => {
  it("uses lucide and monogram overrides, otherwise the favicon's project-name colour", () => {
    const title = "lore";
    expect(
      resolveAgentCharacterColor({
        title,
        projectIcon: { kind: "lucide", name: "Book", color: "red" },
      }),
    ).toBe("red");
    expect(
      resolveAgentCharacterColor({
        title,
        projectIcon: { kind: "monogram", text: "LR", color: "teal" },
      }),
    ).toBe("teal");
    for (const projectIcon of [null, { kind: "emoji", emoji: "📚" }] as const) {
      expect(resolveAgentCharacterColor({ title, projectIcon })).toBe(
        deriveProjectIdentity(title).color,
      );
    }
  });
});
