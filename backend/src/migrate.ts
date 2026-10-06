import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pool } from "./config/db";
import { Database, transaction } from "./database";
export async function migrate(
  db: Database,
  folder = path.resolve(__dirname, "../..", "database/migrations"),
) {
  await transaction(db, async (cx) => {
    await cx.query("SELECT pg_advisory_xact_lock(241031)");
    await cx.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, aplicada_em TIMESTAMPTZ NOT NULL DEFAULT NOW())",
    );
    for (const file of (await readdir(folder))
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      if (
        (
          await cx.query(
            "SELECT version FROM schema_migrations WHERE version=$1",
            [file],
          )
        ).rows.length
      )
        continue;
      const legacy =
        file.startsWith("001") &&
        (await cx.query("SELECT to_regclass('public.usuarios') AS tabela"))
          .rows[0].tabela;
      if (!legacy)
        await cx.query(await readFile(path.join(folder, file), "utf8"));
      await cx.query("INSERT INTO schema_migrations(version) VALUES($1)", [
        file,
      ]);
      console.log(`Migração aplicada: ${file}`);
    }
  });
}
if (require.main === module)
  migrate(pool)
    .then(() => pool.end())
    .catch((error) => {
      console.error("Falha na migração:", error.message);
      pool.end();
      process.exitCode = 1;
    });
