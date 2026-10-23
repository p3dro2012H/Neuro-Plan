// Executar após npm run build. Usa banco em memória e IA simulada, nunca a chave real.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);
const { LocalDatabase } = require("../backend/dist/local-database.js");
const { createApp } = require("../backend/dist/app.js");
const { migrate } = require("../backend/dist/migrate.js");
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE_PATH
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href
    : "playwright"
);
const db = new LocalDatabase();
await migrate(db);
const origin = "http://localhost:3013";
const app = createApp(db, {
  origin,
  clock: () => Date.parse("2026-10-06T12:00:00Z"),
  assistantProvider: async () => ({
    texto:
      "Você pode separar a pesquisa em um bloco de 25 minutos. Revise antes de salvar.",
    proposta: {
      tarefas: [
        {
          ref: "pesquisa",
          titulo: "Pesquisar fontes",
          materia: "História",
          prazo: null,
          estimativaMin: 25,
          prioridade: "ALTA",
        },
      ],
      blocos: [
        {
          titulo: "Pesquisa do seminário",
          materia: "História",
          tipo: "ESTUDO",
          inicio: "2026-10-06T14:00:00Z",
          fim: "2026-10-06T14:25:00Z",
          tarefaRef: "pesquisa",
        },
      ],
    },
  }),
});
const server = app.listen(3013, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const browser = await chromium.launch({ channel: "chrome", headless: true });
await fs.mkdir(".build", { recursive: true });
const errors = [];
try {
  for (const [index, name] of [
    "Estudante demonstrativo",
    "Segunda conta",
  ].entries()) {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 1000 },
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    const signup = await context.request.post(origin + "/auth/cadastro", {
      headers: { Origin: origin },
      data: {
        nome: name,
        email: `planejamento-${index}@example.com`,
        senha: "segredo123",
      },
    });
    assert.equal(signup.status(), 201);
    await page.goto(origin);
    await page.getByRole("button", { name: "Agora não", exact: true }).click();
    if (index === 0) {
      // Reproduz servidor antigo: rotas novas devolvem HTML com HTTP 200.
      const html = (route) =>
        route.fulfill({
          status: 200,
          contentType: "text/html",
          body: "<!doctype html><div id='root'></div>",
        });
      await page.route("**/planejamento/preferencias", html);
      await page
        .getByRole("button", { name: "Planejamento", exact: true })
        .click();
      await page
        .getByRole("alert")
        .filter({ hasText: "Reinicie o servidor" })
        .waitFor();
      await page
        .getByRole("heading", { name: "Horários disponíveis e compromissos" })
        .waitFor();
      await page.unroute("**/planejamento/preferencias", html);
      await page
        .getByRole("button", { name: "Reconectar", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Adicionar disponibilidade", exact: true })
        .waitFor({ state: "visible" });
      await page.route("**/assistente/status", html);
      await page
        .getByRole("button", { name: "Assistente", exact: true })
        .click();
      await page
        .getByRole("alert")
        .filter({ hasText: "Reinicie o servidor" })
        .waitFor();
      await page.unroute("**/assistente/status", html);
      await page
        .getByRole("button", { name: "Atualizar conversa", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Assistente NeuroPlan" })
        .waitFor();
      console.log(
        "PASSOU: servidor antigo mostra aviso e permite reconectar, sem tela branca.",
      );
    }
    await page
      .getByRole("button", { name: "Planejamento", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Adicionar disponibilidade", exact: true })
      .waitFor();
    await page.getByLabel("Fuso horário").fill("UTC");
    await page
      .getByRole("button", { name: "Adicionar disponibilidade", exact: true })
      .click();
    await page.locator(".planning-row select").first().selectOption("2");
    await page.getByLabel("Disponível a partir de").fill("08:00");
    await page.getByLabel("Até", { exact: true }).fill("22:00");
    await page
      .getByRole("button", { name: "Salvar preferências", exact: true })
      .click();
    await page.getByText("Preferências salvas.", { exact: true }).waitFor();
    await page.getByLabel("Título", { exact: true }).fill("Preparar seminário");
    await page
      .getByLabel("Matéria (opcional)", { exact: true })
      .fill("História");
    await page
      .getByRole("button", { name: "Criar tarefa", exact: true })
      .click();
    await page.getByText("Tarefa salva.", { exact: true }).waitFor();
    assert.equal(
      (await context.request.get(origin + "/tarefas")).status(),
      200,
    );
    if (index === 0) {
      await page.getByLabel("Título do bloco").fill("Revisão manual");
      await page
        .getByLabel("Início · UTC", { exact: true })
        .fill("2026-10-06T13:00");
      await page
        .getByLabel("Fim · UTC", { exact: true })
        .fill("2026-10-06T13:25");
      await page
        .getByRole("button", { name: "Adicionar bloco", exact: true })
        .click();
      await page.getByText("Bloco salvo na agenda.", { exact: true }).waitFor();
      await page.reload();
      await page
        .getByRole("button", { name: "Planejamento", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Revisão manual", exact: true })
        .waitFor();
      await page.screenshot({
        path: ".build/planning-manual.png",
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Assistente", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Assistente NeuroPlan" })
        .waitFor();
      const reply = await context.request.post(
        origin + "/assistente/mensagens",
        {
          headers: { Origin: origin },
          data: {
            pedidoId: crypto.randomUUID(),
            texto: "Organizar minha semana",
            tarefaIds: [],
          },
        },
      );
      assert.equal(reply.status(), 200);
      assert.equal(
        await page.getByText(/piloto restrito|adultos convidados/i).count(),
        0,
      );
      await page
        .getByRole("button", { name: "Atualizar conversa", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Proposta para revisar", exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Descartar", exact: true })
        .click();
      await page
        .getByText("Proposta descartada.", { exact: true })
        .first()
        .waitFor();
      await page.screenshot({
        path: ".build/assistant-direto.png",
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Planejamento", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Preparar estudo", exact: true })
        .click();
      await page.getByLabel("O que você vai estudar?").waitFor();
      assert.equal(
        await page.getByLabel("O que você vai estudar?").inputValue(),
        "Revisão manual",
      );
      assert.equal(
        await (await context.request.get(origin + "/sessoes/ativa")).json(),
        null,
      );
    } else {
      await page
        .getByRole("button", { name: "Assistente", exact: true })
        .click();
      await page.getByLabel("Preparar seminário", { exact: true }).check();
      await page
        .getByRole("button", { name: "Dividir uma tarefa", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Enviar à IA", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Proposta para revisar" })
        .waitFor();
      assert.equal(
        (await (await context.request.get(origin + "/planejamentos")).json())
          .blocos.length,
        0,
      );
      await page
        .getByLabel("Título", { exact: true })
        .fill("Pesquisar e resumir fontes");
      await page
        .getByLabel("Início · UTC", { exact: true })
        .fill("2026-10-06T15:00");
      await page
        .getByLabel("Fim · UTC", { exact: true })
        .fill("2026-10-06T15:25");
      await page.screenshot({
        path: ".build/planning-assistant.png",
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Salvar planejamento", exact: true })
        .click();
      await page
        .getByText("Planejamento confirmado e salvo.", { exact: true })
        .waitFor();
      await page.reload();
      await page
        .getByRole("button", { name: "Planejamento", exact: true })
        .click();
      await page
        .getByRole("heading", {
          name: "Pesquisar e resumir fontes",
          exact: true,
        })
        .waitFor();
      await page
        .getByRole("heading", { name: "Pesquisa do seminário", exact: true })
        .waitFor();
      const saved = await (
        await context.request.get(origin + "/planejamentos")
      ).json();
      assert.equal(saved.blocos.length, 1);
      assert.equal(saved.blocos[0].inicio, "2026-10-06T15:00:00.000Z");
      await page.screenshot({
        path: ".build/planning-saved.png",
        fullPage: true,
      });
      await page
        .locator(".planning-columns")
        .screenshot({ path: ".build/planning-agenda.png" });
    }
    await context.close();
    console.log("PASSOU: " + name);
  }
  assert.deepEqual(errors, []);
  console.log(
    "Fluxos concluídos: duas contas acessam sem convites, proposta editável, persistência após recarga e preparação manual da sessão. IA simulada.",
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await db.pg.close();
}
