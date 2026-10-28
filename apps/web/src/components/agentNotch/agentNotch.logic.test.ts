import { describe, expect, it } from "vite-plus/test";
import type { ThreadStatusPill } from "../Sidebar.logic";
import { summarizeAgentSessions } from "./agentNotch.logic";

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
