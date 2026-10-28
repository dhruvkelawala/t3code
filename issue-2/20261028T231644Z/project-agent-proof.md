# Project agent runtime proof

Captured from commit 9a08983e06875760b8eb4f226cc54f81b43a8007 on an isolated worktree server. All data below is authored fixture data. No provider turns ran.

## RPC and MCP

Two independent WebSocket connections subscribed to project updates. Bearer credentials were held in memory and omitted. The read-only attempt used a distinct token with only orchestration:read.

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
    "agentThreadId": "proof-thread-77a456f7-ae83-4ff8-8111-0ddff9e4e16a",
    "sequence": 35
  },
  {
    "action": "RPC clear; both clients received project.updated",
    "clients": 2,
    "agentThreadId": null,
    "sequence": 36
  },
  {
    "action": "RPC rejects missing thread",
    "error": "Cause([Fail(ProjectAgentThreadError: Thread 'proof-missing' cannot be the agent for project 'proof-project-0353b8dd-ec83-482f-8f26-28d892729c90': missing.)])"
  },
  {
    "action": "MCP rejects missing thread",
    "response": {
      "content": [
        {
          "type": "text",
          "text": "{\"_tag\":\"OrchestratorMcpFailure\",\"code\":\"invalid_request\",\"message\":\"Thread 'proof-missing' cannot be the agent for project 'proof-project-0353b8dd-ec83-482f-8f26-28d892729c90': missing.\"}"
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
    "agentThreadId": "proof-thread-77a456f7-ae83-4ff8-8111-0ddff9e4e16a",
    "sequence": 37
  },
  {
    "action": "MCP read",
    "response": {
      "content": [
        {
          "type": "text",
          "text": "{\"id\":\"proof-project-0353b8dd-ec83-482f-8f26-28d892729c90\",\"agentThreadId\":\"proof-thread-77a456f7-ae83-4ff8-8111-0ddff9e4e16a\",\"title\":\"Project agent proof\",\"workspaceRoot\":\"/tmp/t3-issue-2/fixture-8988e1fe-e9cd-45bf-ae3b-a1f7a039135a\",\"repositoryIdentity\":null,\"faviconPath\":null,\"projectIcon\":null,\"defaultModelSelection\":null,\"defaultThreadEnvMode\":null,\"autoPull\":false,\"scripts\":[],\"createdAt\":\"2026-10-28T23:11:47.106Z\",\"updatedAt\":\"2026-10-28T23:11:47.324Z\",\"deletedAt\":null}"
        }
      ],
      "structuredContent": {
        "id": "proof-project-0353b8dd-ec83-482f-8f26-28d892729c90",
        "agentThreadId": "proof-thread-77a456f7-ae83-4ff8-8111-0ddff9e4e16a",
        "title": "Project agent proof",
        "workspaceRoot": "/tmp/t3-issue-2/fixture-8988e1fe-e9cd-45bf-ae3b-a1f7a039135a",
        "repositoryIdentity": null,
        "faviconPath": null,
        "projectIcon": null,
        "defaultModelSelection": null,
        "defaultThreadEnvMode": null,
        "autoPull": false,
        "scripts": [],
        "createdAt": "2026-10-28T23:11:47.106Z",
        "updatedAt": "2026-10-28T23:11:47.324Z",
        "deletedAt": null
      },
      "isError": false
    }
  },
  {
    "action": "MCP clear; both clients updated",
    "clients": 2,
    "agentThreadId": null,
    "sequence": 38
  },
  {
    "action": "thread.archive clears pointer; both clients updated",
    "clients": 2,
    "agentThreadId": null,
    "sequence": 41
  },
  {
    "action": "thread.delete clears pointer; both clients updated",
    "clients": 2,
    "agentThreadId": null,
    "sequence": 45
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

## Persistence and replay

The production EventSink, event store and ProjectStore ran against migrated in-memory SQLite. Historical project events omitted agentThreadId. The move is a thread.metadata-updated event, the persisted lifecycle event used when project ownership changes. The same project events were replayed through ProjectStore before and after the move.

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
  }
]
```

## Verification

vp run check:changed passed format, lint, both knip checks, GraphQL, affected-package typechecks and 146 tests across 15 files. The project upgrade test includes a historical V1 database, migration 073 and the resulting null pointer.

Two new MCP eval cases passed the dry run. The paid run could not start because evals/shared/proxy.ts expects model_providers.vibeproxy in ~/.codex/config.toml and that entry is missing. No paid sample ran.
