# Independent verification: PR #5 (project agent thread)

- PR: https://github.com/dhruvkelawala/t3code/pull/5
- Tested HEAD: `9a08983e06875760b8eb4f226cc54f81b43a8007` (local `git rev-parse HEAD` = PR `headRefOid`). Base: `d46463140776d3d45f0ce705a36e6b411f1d4b5d` (= PR `baseRefOid` = merge base with origin/main).
- Verifier: Claude Opus 5.5 (`claude-opus-5-5`) through the Claude Code harness. The parent confirmed high effort from the delegate result metadata.
- Mode: read-only. No tracked files changed (`git status` shows only the pre-existing untracked `.build/`). No dev server started, no live `~/.t3/userdata` access, no paid provider turns or evals.
- PR state when checked: OPEN, not draft, MERGEABLE, no reviews, 0 unresolved review threads, `statusCheckRollup` empty. The user chose no CI on this fork (2026-10-29).

## Verdict: PASS+NOTES

All three required lanes passed. I found no blocking defect. The notes below are limits on what the runs covered, not bugs.

## Lane 1: Gates. PASS

Discovery, following the verify skill: AGENTS.md names `vp run check:changed` as the pre-push check and forbids repo-wide `vp check`, `vp run -r test`, `vp run -r typecheck` and builds. CI (`ci.yml`) runs `vp check`, knip, generate --check, the full tests and the builds, but AGENTS.md restricts local verification to changed files and CI is off on this fork by user decision. The evals README requires evals for MCP tool description changes.

| Command | Source | Result |
|---|---|---|
| `CI=1 vp run check:changed` (merge base d46463140776) | AGENTS.md | **passed**: format, lint, knip 1/2 and 2/2, graphql generate, typecheck (36 packages), tests (15 files, 146 passed), exit 0 |
| `node mcp-tool-use/run.ts --case project-agent-set,project-agent-clear --dry-run` (in `evals/`) | evals/README | **passed**: both new cases built, 2 request lines, exit 0 |
| paid `evals/mcp-tool-use` run of the new cases | evals/README | **could-not-run**: the runner needs `model_providers.vibeproxy` in `~/.codex/config.toml`, which is absent (`/tmp/t3-issue-2/eval-run.txt`). I did not change the proxy config or pay for a fallback run, as instructed. |
| `vp check`, `vp run -r test/typecheck`, builds | CI | not run under the repository prohibition on repo-wide checks; the user selected local changed-file checks only |

Note: 31 of the 36 typecheck tasks were cache hits. The vp cache keys on input content, so a hit is a valid pass for this tree.

Transcripts: `check-changed.txt`, `eval-dry.jsonl`.

## Lane 2: Live. PASS

The lane used the isolated server the parent launched at `http://127.0.0.1:15147`. Its process (vp PID 86260, port owner node 89320) runs from this worktree with `--no-seed` and started at 00:31:56, after the HEAD commit (23:11:24 UTC on Oct 28). `/tmp/t3-issue-2/upstream-contracts/packages/contracts/src` is byte-identical to `git archive d464631 packages/contracts/src` (`diff -rq` was clean).

Script: `runtime.mjs`. It is a copy of the author's recipe (kept unedited as `runtime-original-copy.mjs`) with output and fixture paths moved here and the supplements below added. I ran it with `cd apps/server && node --input-type=module < runtime.mjs`. Exit 0, transcript in `runtime.txt`, structured log in `runtime.json`.

From the original recipe, re-run here:
- `projects.setAgentThread` set and clear. Both subscribed clients got `project.updated` with the same sequence (48 and 49). Every frame decoded with the **base** `OrchestrationV2ShellStreamItem`. Protocol stayed 2. (Criteria 1, 2, 5)
- A missing thread got `ProjectAgentThreadError` (reason `missing`) over RPC. Over MCP `t3_project_update` it returned `invalid_request` with the same message. (Criteria 3, 7)
- A token with only `orchestration:read` was denied with `EnvironmentAuthorizationError ... orchestration:operate`. (Criterion 6)
- MCP `t3_project_update` set and clear reached both clients. `t3_project_read` returned `agentThreadId`. (Criterion 7)
- `thread.archive` and `thread.delete` on the assigned thread cleared the pointer, and both clients got `project.updated` (sequences 54 and 58). (Criterion 4)

My supplements:
- **Typed rejections over the dedicated RPC, checked by `_tag` and `reason` on the error value.** A thread in another project returned `different-project`. An archived thread returned `archived`. A deleted thread returned `missing`. A never-existing thread returned `missing`. (Criterion 3)
- **Rejections emit no event.** After the four rejections, a valid set followed. On both clients, the first `project.updated` frame for the project was that valid set (sequence 64, decoded with the base schema), so no rejection produced a frame. (Criterion 3, "no event")
- **Race: concurrent `thread.archive` and `setAgentThread`.** 8 rounds. After each round, `t3_project_read` showed `agentThreadId === null`, so the pointer never stayed on an archived thread. (Safety assumption)

Limit: in all 8 rounds the archive committed first and the set was rejected with `archived`. The opposite order (set accepted, then archive clears it) did not happen in this race. The sequential set-then-archive live step and Lane 3 cover that order.

Not exercised live: subagent and fork-child targets, because creating those children needs a provider. The author's `ProjectService.test.ts` table covers missing, foreign-environment, different-project, subagent, fork, archived and deleted, with no event written, and it passed in check:changed. Lane 3 below also shows that re-parenting an assigned thread as a subagent clears the pointer. A thread from a different environment does not exist in this environment's projection, so it is rejected as `missing`, the same as the live never-existed case.

## Lane 3: Blast radius. PASS

### Code review

1. **Lock order is thread, then project, then workspace.** See `apps/server/src/project/ProjectService.ts:281-293`. The thread projection is read inside the locks (`:251-258`), so validation and commit happen under one critical section. The only other place ProjectService takes a thread lock is `deleteChildThreads` (`:495`), which runs *before* the project-locked `commit`, not inside it. Nothing takes the project lock and then a thread lock, so the two orders cannot deadlock.
2. **The thread lock is the same one thread commands use.** ProjectService, Orchestrator, ThreadManagementService and ProviderEventIngestor all provide the same `ThreadCommandExecutor.layer` constant, and Effect memoizes layers by reference. `lock-sharing.mjs` (output in `lock-sharing.txt`) builds two independently provided consumers of `ThreadCommandExecutor.layer` and gets back `true`: they share one KeyedLock instance.
3. **Cleanup commits in the same transaction as the thread event.** In `EventSink.ts:389-425` (`applyStoredEvents`), every write path (`:491`, `:550`, `:615`, `:651`, `:717`) calls it inside `commitThenPublish` → `sql.withTransaction`. The cleanup appends `project.meta-updated {agentThreadId:null}` with the deterministic id `${event.id}:project-agent:${projectId}` and `causationEventId`, applies it to ProjectStore, and adds it to `publishCommitted` (`:258`). `projectStore.list` uses `readOnly`, and a read inside a write transaction keeps the writer connection (`nodeSqliteClient.ts:48`), so it sees uncommitted rows.
4. **Omitting the field never clears the pointer.** `ProjectStore.apply` reads the current row inside the apply and spreads `agentThreadId` only when the payload defines it (`ProjectStore.ts:248-262`). Planner (`ProjectCommands.ts:230`), service (`:395`) and mutation (`ProjectMutation.ts:32`) also forward the field only when it is defined. `project.created` sets it to null. Migration 073 adds a nullable column, so existing rows read as NULL.

### Runtime

Script: `replay.mjs`, a copy of the author's recipe (kept as `replay-original-copy.mjs`) plus supplements. Two changes to the copy: SqlClient is exposed to the script through `provideMerge`, and output goes here. It runs the production EventSink, ProjectStore and OrchestrationEventStore on in-memory SQLite with all 73 migrations applied. Exit 0, transcript in `replay.txt`, log in `replay.json`.

From the original recipe:
- Historical project events replay with `agentThreadId: null`. A metadata update without the field, issued after an assignment, keeps the pointer. A full replay of persisted events through ProjectStore keeps it too. Moving the thread to another project clears the pointer in the same write (`causationEventId: move:out`), and the clear survives replay. (Criteria 4, 5)

My supplements:
- A metadata update on an assigned thread that stays eligible (a rename) keeps the pointer and writes **0** project events. This is the false-positive guard: legacy or ordinary thread metadata never clears the pointer by accident.
- Archive, delete and re-parent-as-subagent each clear the pointer. Each produces exactly one `project.meta-updated` in the same write, with the correct `causationEventId`.
- I deleted the `projection_projects` rows, rebuilt them from the persisted event log, and got the same pointer state as before (null).
- `projection_projects.agent_thread_id` exists after migration.

A runtime before/after comparison against base does not apply because base lacks the feature. Base decoder compatibility is proven in Lane 2.

## Findings

No blocking findings. These deferred, non-blocking points from the author's review still hold, and I did not re-raise them as defects:
- Generic `projects.mutate` also accepts `agentThreadId`, but it wraps `ProjectAgentThreadError` in `ProjectMutationError`. The dedicated `projects.setAgentThread` RPC, which the issue requested, keeps the typed error. Both go through the same validation in `ProjectService.commit`.

## Artifacts (all in /tmp/t3-issue-2/independent-verifier/)

`report.md`, `verdict-notes.md`, `check-changed.txt`, `eval-dry.jsonl`, `runtime.mjs`, `runtime-original-copy.mjs`, `runtime.txt`, `runtime.json`, `replay.mjs`, `replay-original-copy.mjs`, `replay.txt`, `replay.json`, `lock-sharing.mjs`, `lock-sharing.txt`, `base-contracts-check/` (base contracts export used for the diff), `fixture-*` (empty workspace roots for the live projects).

## runtime.json

```json
[
  {
    "action": "project created",
    "agentThreadId": null,
    "protocol": 2
  },
  {
    "action": "RPC set; both clients received project.updated",
    "clients": 2,
    "agentThreadId": "proof-thread-9b816420-193e-4709-9cb4-0c97c8607350",
    "sequence": 48
  },
  {
    "action": "RPC clear; both clients received project.updated",
    "clients": 2,
    "agentThreadId": null,
    "sequence": 49
  },
  {
    "action": "RPC rejects missing thread",
    "error": "Cause([Fail(ProjectAgentThreadError: Thread 'proof-missing' cannot be the agent for project 'proof-project-32f48e2d-257e-4619-9a43-75dc51ccf4db': missing.)])"
  },
  {
    "action": "MCP rejects missing thread",
    "response": {
      "content": [
        {
          "type": "text",
          "text": "{\"_tag\":\"OrchestratorMcpFailure\",\"code\":\"invalid_request\",\"message\":\"Thread 'proof-missing' cannot be the agent for project 'proof-project-32f48e2d-257e-4619-9a43-75dc51ccf4db': missing.\"}"
        }
      ],
      "isError": true
    }
  },
  {
    "action": "Read-only RPC grant is denied",
    "error": "Cause([Fail(EnvironmentAuthorizationError: The authenticated token is missing required scope: orchestration:operate.)])"
  },
  {
    "action": "MCP set; both clients updated",
    "clients": 2,
    "agentThreadId": "proof-thread-9b816420-193e-4709-9cb4-0c97c8607350",
    "sequence": 50
  },
  {
    "action": "MCP read",
    "response": {
      "content": [
        {
          "type": "text",
          "text": "{\"id\":\"proof-project-32f48e2d-257e-4619-9a43-75dc51ccf4db\",\"agentThreadId\":\"proof-thread-9b816420-193e-4709-9cb4-0c97c8607350\",\"title\":\"Project agent proof\",\"workspaceRoot\":\"/tmp/t3-issue-2/independent-verifier/fixture-0c895b67-7f10-4e3c-be53-7897ac187491\",\"repositoryIdentity\":null,\"faviconPath\":null,\"projectIcon\":null,\"defaultModelSelection\":null,\"defaultThreadEnvMode\":null,\"autoPull\":false,\"scripts\":[],\"createdAt\":\"2026-10-29T00:35:13.608Z\",\"updatedAt\":\"2026-10-29T00:35:13.816Z\",\"deletedAt\":null}"
        }
      ],
      "structuredContent": {
        "id": "proof-project-32f48e2d-257e-4619-9a43-75dc51ccf4db",
        "agentThreadId": "proof-thread-9b816420-193e-4709-9cb4-0c97c8607350",
        "title": "Project agent proof",
        "workspaceRoot": "/tmp/t3-issue-2/independent-verifier/fixture-0c895b67-7f10-4e3c-be53-7897ac187491",
        "repositoryIdentity": null,
        "faviconPath": null,
        "projectIcon": null,
        "defaultModelSelection": null,
        "defaultThreadEnvMode": null,
        "autoPull": false,
        "scripts": [],
        "createdAt": "2026-10-29T00:35:13.608Z",
        "updatedAt": "2026-10-29T00:35:13.816Z",
        "deletedAt": null
      },
      "isError": false
    }
  },
  {
    "action": "MCP clear; both clients updated",
    "clients": 2,
    "agentThreadId": null,
    "sequence": 51
  },
  {
    "action": "thread.archive clears pointer; both clients updated",
    "clients": 2,
    "agentThreadId": null,
    "sequence": 54
  },
  {
    "action": "thread.delete clears pointer; both clients updated",
    "clients": 2,
    "agentThreadId": null,
    "sequence": 58
  },
  {
    "action": "Typed rejections over dedicated RPC",
    "rejections": [
      {
        "threadId": "verifier-foreign",
        "tag": "ProjectAgentThreadError",
        "reason": "different-project"
      },
      {
        "threadId": "verifier-archived",
        "tag": "ProjectAgentThreadError",
        "reason": "archived"
      },
      {
        "threadId": "proof-thread",
        "tag": "ProjectAgentThreadError",
        "reason": "missing"
      },
      {
        "threadId": "verifier-never-existed",
        "tag": "ProjectAgentThreadError",
        "reason": "missing"
      }
    ]
  },
  {
    "action": "No project.updated frame emitted by rejections (next frame on both clients is the valid set)",
    "sequence": 64,
    "agentThreadId": "verifier-good"
  },
  {
    "action": "Concurrent archive vs set never leaves a pointer on an archived thread",
    "rounds": [
      {
        "round": 0,
        "setOutcome": "rejected:archived",
        "pointerAfter": null
      },
      {
        "round": 1,
        "setOutcome": "rejected:archived",
        "pointerAfter": null
      },
      {
        "round": 2,
        "setOutcome": "rejected:archived",
        "pointerAfter": null
      },
      {
        "round": 3,
        "setOutcome": "rejected:archived",
        "pointerAfter": null
      },
      {
        "round": 4,
        "setOutcome": "rejected:archived",
        "pointerAfter": null
      },
      {
        "round": 5,
        "setOutcome": "rejected:archived",
        "pointerAfter": null
      },
      {
        "round": 6,
        "setOutcome": "rejected:archived",
        "pointerAfter": null
      },
      {
        "round": 7,
        "setOutcome": "rejected:archived",
        "pointerAfter": null
      }
    ]
  },
  {
    "action": "upstream decoder compatibility",
    "base": "d46463140776d3d45f0ce705a36e6b411f1d4b5d",
    "schema": "OrchestrationV2ShellStreamItem",
    "allProjectUpdatesDecoded": true,
    "protocol": 2
  },
  {
    "action": "complete",
    "status": "passed",
    "providerTurns": 0
  }
]
```

## replay.json

```json
[
  {
    "action": "Historical project/events replay",
    "agentThreadId": null,
    "title": "Historical rename"
  },
  {
    "action": "Old update after assignment preserves pointer",
    "agentThreadId": "proof:moved-thread"
  },
  {
    "action": "Persisted events replay through ProjectStore",
    "eventCount": 4,
    "agentThreadId": "proof:moved-thread"
  },
  {
    "action": "Move out clears pointer atomically",
    "agentThreadId": null,
    "committed": [
      {
        "sequence": 6
      },
      {
        "sequence": 7,
        "type": "project.meta-updated",
        "causationEventId": "move:out",
        "payload": {
          "projectId": "proof:legacy-project",
          "agentThreadId": null,
          "updatedAt": "2026-10-28T00:00:00.000Z"
        }
      }
    ]
  },
  {
    "action": "Lifecycle cleanup survives event replay",
    "agentThreadId": null
  },
  {
    "action": "Eligible thread metadata update keeps pointer and writes no project event",
    "agentThreadId": "proof:keep",
    "projectEventsWritten": 0
  },
  {
    "action": "Lifecycle archive clears pointer in same write",
    "agentThreadId": null,
    "projectEvent": {
      "type": "project.meta-updated",
      "payload": {
        "projectId": "proof:legacy-project",
        "agentThreadId": null,
        "updatedAt": "2026-10-28T00:00:00.000Z"
      },
      "causationEventId": "archive:event"
    }
  },
  {
    "action": "Lifecycle delete clears pointer in same write",
    "agentThreadId": null,
    "projectEvent": {
      "type": "project.meta-updated",
      "payload": {
        "projectId": "proof:legacy-project",
        "agentThreadId": null,
        "updatedAt": "2026-10-28T00:00:00.000Z"
      },
      "causationEventId": "delete:event"
    }
  },
  {
    "action": "Lifecycle reparent-subagent clears pointer in same write",
    "agentThreadId": null,
    "projectEvent": {
      "type": "project.meta-updated",
      "payload": {
        "projectId": "proof:legacy-project",
        "agentThreadId": null,
        "updatedAt": "2026-10-28T00:00:00.000Z"
      },
      "causationEventId": "reparent-subagent:event"
    }
  },
  {
    "action": "Projection wiped and rebuilt from persisted events matches live state",
    "agentThreadId": null,
    "projectEvents": 12
  },
  {
    "action": "Migration 073 column present",
    "column": "agent_thread_id"
  }
]
```

## lock-sharing.txt

```json
{"sharedThreadLockAcrossIndependentlyProvidedLayers":true}
```

## Prescribed checks transcript

```text
$ node scripts/check-changed.ts ⊘ cache disabled
check:changed: 28 files since d46463140776
Runs everything: .build/.buildSystem_debug
Runs everything: .build/CACHEDIR.TAG

> vp format  pass  0.3s
Checking formatting...

All matched files use the correct format.
Finished in 136ms on 25 files using 12 threads.

> vp graphql (apps/server)  pass  0.8s
~/apps/server$ graphqlgen --check ⊘ cache disabled


> vp lint  pass  1.1s

> vp typecheck (36 packages)  pass  5.9s
~/apps/desktop$ tsc --noEmit ◉ cache hit, replaying

~/packages/provider-fx$ tsc --noEmit ◉ cache hit, replaying

~/packages/source-control-bitbucket$ tsc --noEmit ◉ cache hit, replaying

~/packages/shared$ tsc --noEmit ◉ cache hit, replaying

~/packages/client-runtime$ tsc --noEmit ◉ cache hit, replaying

~/infra/task-cache$ tsc --noEmit
~/packages/tailscale$ tsc --noEmit ◉ cache hit, replaying

~/packages/source-control-testing$ tsc --noEmit ◉ cache hit, replaying

~/packages/provider-pi$ tsc --noEmit ◉ cache hit, replaying

~/packages/provider-cursor$ tsc --noEmit ◉ cache hit, replaying

~/evals$ tsc --noEmit ◉ cache hit, replaying

~/oxlint-plugin-t3code$ tsc --noEmit
~/packages/provider-acp-registry$ tsc --noEmit ◉ cache hit, replaying

~/apps/server$ tsc --noEmit ◉ cache hit, replaying

~/apps/marketing$ astro check ○ cache miss: '.build' added in workspace root, executing
~/packages/source-control-forgejo$ tsc --noEmit ◉ cache hit, replaying

~/packages/source-control-core$ tsc --noEmit ◉ cache hit, replaying

~/packages/effect-codex-app-server$ tsc --noEmit


~/packages/contracts$ tsc --noEmit ◉ cache hit, replaying

~/packages/provider-grok$ tsc --noEmit ◉ cache hit, replaying

~/scripts$ tsc --noEmit ◉ cache hit, replaying

~/packages/source-control-azure-devops$ tsc --noEmit ◉ cache hit, replaying

~/packages/source-control-github$ tsc --noEmit ◉ cache hit, replaying

~/packages/effect-acp$ tsc --noEmit
~/packages/provider-testing$ tsc --noEmit ◉ cache hit, replaying

~/packages/provider-opencode$ tsc --noEmit ◉ cache hit, replaying

~/infra/relay$ tsc --noEmit ◉ cache hit, replaying

~/apps/web$ tsc --noEmit ◉ cache hit, replaying

~/packages/source-control-gitlab$ tsc --noEmit ◉ cache hit, replaying

~/packages/source-control-gitcafe$ tsc --noEmit ◉ cache hit, replaying

~/packages/provider-core$ tsc --noEmit ◉ cache hit, replaying

~/packages/provider-acp$ tsc --noEmit ◉ cache hit, replaying

~/apps/mobile$ tsc --noEmit ◉ cache hit, replaying

~/packages/provider-muse$ tsc --noEmit ◉ cache hit, replaying

~/packages/source-control-definitions$ tsc --noEmit ◉ cache hit, replaying

~/packages/ssh$ tsc --noEmit ◉ cache hit, replaying



00:33:14 [types] Generated 30ms
00:33:14 [check] Getting diagnostics for Astro files in /Users/sumodeus/.t3/worktrees/t3code/feat-2-project-agent-thread/apps/marketing...
Result (22 files): 
- 0 errors
- 0 warnings
- 0 hints


---
vp run: 31/36 cache hit (86%), 36/36 successful, 66.50s saved. @t3tools/oxlint-plugin-t3code#typecheck not cached because it modified its inputs. (Run `vp run --last-details` for full details)

> vp knip 1/2  pass  7.7s

> vp knip 2/2  pass  12.3s

> vp test (15 files)  pass  30.0s

 RUN  v5.0.5 /Users/sumodeus/.t3/worktrees/t3code/feat-2-project-agent-thread


 Test Files  15 passed (15)
      Tests  146 passed (146)
   Start at  00:33:14
   Duration  27.43s (tests 35%, transform 29%, import 26%, setup 10%)


check:changed summary
  pass  format  0.3s
  pass  lint  1.1s
  pass  knip 1/2  7.7s
  pass  knip 2/2  12.3s
  pass  graphql (apps/server)  0.8s
  pass  typecheck (36 packages)  5.9s
  pass  test (15 files)  30.0s
  CI also runs: full test suites, build, rust, release smoke
  unused patch check skipped: no dependency files changed

EXIT=0
```
