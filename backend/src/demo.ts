import path from "node:path";
import { createServer } from "node:http";
import { LocalDatabase } from "./local-database";
import { createApp } from "./app";
import { migrate } from "./migrate";
async function main() {
  // Reserva a porta antes de abrir o banco: uma segunda instância não deve
  // tocar na base que já está sendo usada pela primeira.
  const server = createServer((_req, res) => {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        erro: "O NeuroPlan está iniciando. Aguarde e reconecte.",
      }),
    );
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(3000, "127.0.0.1", resolve);
  }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE")
      throw new Error(
        "Já existe um servidor usando a porta 3000. Encerre a instância anterior antes de executar npm run demo novamente. O banco local não foi aberto.",
      );
    throw error;
  });
  const db = new LocalDatabase(path.resolve(__dirname, "../../.local-db"));
  try {
    await migrate(db);
    server.removeAllListeners("request");
    server.on("request", createApp(db, { origin: "http://localhost:3000" }));
  } catch (error) {
    server.close();
    if (db.pg.ready) await db.pg.close();
    throw error;
  }
  console.log(
    "Demonstração local: http://localhost:3000 (dados persistem em .local-db)",
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
