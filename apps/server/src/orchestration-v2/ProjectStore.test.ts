import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { EventId, ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as SqlClient from "effect/sql/SqlClient";

import { migrationManifest } from "../persistence/Migrations.ts";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import * as ProjectStore from "./ProjectStore.ts";

it.layer(ProjectStore.layer.pipe(Layer.provideMerge(SqlitePersistence.layerMemory)))(
  "ProjectStoreV2",
  (it) => {
    it.effect("stores a model selection without options as JSON without an options key", () =>
      Effect.gen(function* () {
        const projects = yield* ProjectStore.ProjectStoreV2;
        const sql = yield* SqlClient.SqlClient;
        const projectId = ProjectId.make("project-null-options");
        const modelSelection = { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" };
        yield* projects.apply({
          sequence: 1,
          eventId: EventId.make("event-null-options"),
          aggregateKind: "project",
          aggregateId: projectId,
          occurredAt: "2026-03-24T00:00:00.000Z",
          commandId: null,
          causationEventId: null,
          correlationId: null,
          metadata: {},
          type: "project.created",
          payload: {
            projectId,
            title: "Null options project",
            workspaceRoot: "/tmp/project-null-options",
            defaultModelSelection: modelSelection,
            scripts: [],
            createdAt: "2026-03-24T00:00:00.000Z",
            updatedAt: "2026-03-24T00:00:00.000Z",
          },
        });

        assert.isNull(Option.getOrThrow(yield* projects.getShell(projectId)).agentThreadId);

        const rows = yield* sql<{ readonly defaultModelSelection: string | null }>`
          SELECT default_model_selection_json AS "defaultModelSelection"
          FROM projection_projects
          WHERE project_id = ${projectId}
        `;
        assert.strictEqual(rows[0]?.defaultModelSelection, JSON.stringify(modelSelection));
        assert.deepStrictEqual(
          Option.getOrNull(yield* projects.get(projectId))?.defaultModelSelection,
          modelSelection,
        );
      }),
    );
  },
);

it.effect("project store startup records only upstream migrations", () =>
  Effect.gen(function* () {
    yield* ProjectStore.make;
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{ readonly migration_id: number; readonly name: string }>`
      SELECT migration_id, name FROM effect_sql_migrations ORDER BY migration_id
    `;
    const recorded = rows.map(({ migration_id, name }) => [migration_id, name] as const);
    assert.deepStrictEqual(recorded, migrationManifest);
    assert.deepStrictEqual(
      recorded.filter(([id]) => id >= 73),
      [
        [73, "ActiveTurnItemIndexes"],
        [74, "ExcludeAttachmentPlaceholdersFromSearch"],
        [75, "SubagentDeliveryState"],
      ],
    );
  }).pipe(Effect.provide(SqlitePersistence.layerMemory)),
);

it.effect(
  "project store startup adds the agent column and partial index to an upstream database",
  () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const before = yield* sql<{ readonly name: string }>`PRAGMA table_info(projection_projects)`;
      assert.isFalse(before.some(({ name }) => name === "agent_thread_id"));

      yield* ProjectStore.make;

      const columns = yield* sql<{ readonly name: string; readonly type: string }>`
      PRAGMA table_info(projection_projects)
    `;
      assert.strictEqual(columns.find(({ name }) => name === "agent_thread_id")?.type, "TEXT");
      const indexes = yield* sql<{ readonly sql: string }>`
      SELECT sql FROM sqlite_schema WHERE name = 'projection_projects_agent_thread_idx'
    `;
      assert.lengthOf(indexes, 1);
      assert.match(
        indexes[0]!.sql,
        /ON projection_projects\s*\(agent_thread_id\) WHERE agent_thread_id IS NOT NULL/,
      );
    }).pipe(Effect.provide(SqlitePersistence.layerMemory)),
);

it.effect("starting the project store twice leaves the schema and data unchanged", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* ProjectStore.make;
    const before =
      yield* sql`SELECT type, name, tbl_name, rootpage, sql FROM sqlite_schema ORDER BY name`;
    const schemaVersion = yield* sql`PRAGMA schema_version`;
    const changes = yield* sql`SELECT total_changes() AS count`;

    yield* ProjectStore.make;

    assert.deepStrictEqual(
      yield* sql`SELECT type, name, tbl_name, rootpage, sql FROM sqlite_schema ORDER BY name`,
      before,
    );
    assert.deepStrictEqual(yield* sql`PRAGMA schema_version`, schemaVersion);
    assert.deepStrictEqual(yield* sql`SELECT total_changes() AS count`, changes);
  }).pipe(Effect.provide(SqlitePersistence.layerMemory)),
);

it.effect("an existing project agent survives reopening the database", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-project-agent-restart-" });
      const dbPath = path.join(dir, "statev2.sqlite");
      const projectId = ProjectId.make("project-restart");
      const agentThreadId = ThreadId.make("agent-restart");
      const event = {
        sequence: 1,
        eventId: EventId.make("event-restart"),
        aggregateKind: "project",
        aggregateId: projectId,
        occurredAt: "2026-03-24T00:00:00.000Z",
        commandId: null,
        causationEventId: null,
        correlationId: null,
        metadata: {},
      } as const;
      yield* Effect.gen(function* () {
        const projects = yield* ProjectStore.make;
        yield* projects.apply({
          ...event,
          type: "project.created",
          payload: {
            projectId,
            title: "Restart project",
            workspaceRoot: "/tmp/project-restart",
            defaultModelSelection: null,
            scripts: [],
            createdAt: event.occurredAt,
            updatedAt: event.occurredAt,
          },
        });
        yield* projects.apply({
          ...event,
          sequence: 2,
          eventId: EventId.make("event-agent-restart"),
          type: "project.meta-updated",
          payload: { projectId, agentThreadId, updatedAt: event.occurredAt },
        });
      }).pipe(Effect.provide(SqlitePersistence.layerFromPath(dbPath)));

      yield* Effect.gen(function* () {
        const projects = yield* ProjectStore.make;
        assert.strictEqual(
          Option.getOrThrow(yield* projects.get(projectId)).agentThreadId,
          agentThreadId,
        );
      }).pipe(Effect.provide(SqlitePersistence.layerFromPath(dbPath)));
    }),
  ).pipe(Effect.provide(NodeServices.layer)),
);
