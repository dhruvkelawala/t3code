import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`ALTER TABLE projection_projects ADD COLUMN agent_thread_id TEXT`;
  yield* sql`CREATE INDEX projection_projects_agent_thread_idx ON projection_projects(agent_thread_id) WHERE agent_thread_id IS NOT NULL`;
});
