import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { alertasRouter } from "./routes/alertas.routes";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use(alertasRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT ?? 3000;

app.listen(PORT, () => {
  console.log(`API de monitoramento de fadiga rodando na porta ${PORT}`);
});
