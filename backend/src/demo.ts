import path from "node:path";
import { LocalDatabase } from "./local-database";
import { createApp } from "./app";
import { migrate } from "./migrate";
async function main() {
  const db = new LocalDatabase(path.resolve(__dirname, "../../.local-db"));
  await migrate(db);
  const server = createApp(db, { origin: "http://localhost:3000" }).listen(
    3000,
    "127.0.0.1",
    () =>
      console.log(
        "Demonstração local: http://localhost:3000 (dados persistem em .local-db)",
      ),
  );
  const stop = () =>
    server.close(() => {
      db.pg.close().then(() => process.exit(0));
    });
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
