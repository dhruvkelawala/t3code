import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { makeThreadFixture } from "../test-fixtures";

import { projectAgentAction } from "./projectAgentAction";

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
    expect(projectAgentAction(project, thread, false)).toBeNull();
    expect(
      projectAgentAction({ ...project, id: ProjectId.make("other") }, thread, true),
    ).toBeNull();
    expect(projectAgentAction(null, thread, true)).toBeNull();
    expect(
      projectAgentAction({ ...project, environmentId: EnvironmentId.make("other") }, thread, true),
    ).toBeNull();
  });
});
