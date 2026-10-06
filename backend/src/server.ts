import { pool } from "./config/db";
import { createApp } from "./app";
import { migrate } from "./migrate";
async function main() {
  const production = process.env.NODE_ENV === "production";
  if (production && !process.env.APP_ORIGIN)
    throw new Error("APP_ORIGIN é obrigatório em produção.");
  if (process.env.AUTO_MIGRATE === "true") await migrate(pool);
  const server = createApp(pool, {
    production,
    origin: process.env.APP_ORIGIN,
  }).listen(Number(process.env.PORT ?? 3000), () => console.log("API pronta."));
  const stop = () =>
    server.close(() => {
      pool.end().then(() => process.exit(0));
    });
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
main().catch((error) => {
  console.error(error.message);
  pool.end();
  process.exitCode = 1;
});
