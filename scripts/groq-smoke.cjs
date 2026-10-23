// Chamada real sem banco, conta de estudante, webcam ou dados pessoais.
const path = require("node:path");
require("../backend/node_modules/dotenv").config({
  path: path.resolve(__dirname, "../backend/.env"),
});
const { groqProvider } = require("../backend/dist/groq.js");
const { replySchema } = require("../backend/dist/planning-schema.js");
async function main() {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) {
    console.log(
      "PENDENTE: configure GROQ_API_KEY somente no backend/.env ou no ambiente do servidor.",
    );
    process.exitCode = 2;
    return;
  }
  const model = process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-20b";
  const result = await groqProvider(key, model)(
    {
      historico: [],
      texto:
        "Quero organizar meus estudos. Ainda não defini meus horários disponíveis. Pergunte os dados que faltam.",
      contexto: {
        tarefas: [],
        agenda: [],
        preferencias: {
          fuso: "America/Sao_Paulo",
          disponibilidade: [],
          compromissos: [],
        },
      },
    },
    AbortSignal.timeout(30000),
  );
  const parsed = replySchema.parse(result);
  if (parsed.proposta !== null)
    throw new Error("O modelo propôs agenda sem disponibilidade.");
  console.log(
    "PASSOU: Groq respondeu a uma chamada real com JSON válido e pediu informações antes de propor horários.",
  );
  console.log("Modelo: " + model);
  console.log("Resposta: " + parsed.texto);
}
main().catch((error) => {
  console.error(
    "Falha na verificação real: " +
      (error.name === "AbortError" || error.name === "TimeoutError"
        ? "Tempo limite excedido."
        : error.message),
  );
  process.exitCode = 1;
});
