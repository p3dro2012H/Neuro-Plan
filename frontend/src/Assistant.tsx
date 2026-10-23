import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
import { TaskFields, BlockFields } from "./Planning";
import { Message, Preferences, Proposal, Task } from "./planning-types";
function ProposalEditor({
  initial,
  tasks,
  zone,
  busy,
  onSave,
  onDiscard,
}: {
  initial: Proposal;
  tasks: Task[];
  zone: string;
  busy: boolean;
  onSave: (value: Proposal) => void;
  onDiscard: () => void;
}) {
  const [value, setValue] = useState(initial);
  const references = [
    ...tasks,
    ...value.tarefas.map((t) => ({ ...t, id: t.ref, concluida: false })),
  ];
  return (
    <form
      className="proposal-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(value);
      }}
    >
      <h3>Proposta para revisar</h3>
      <p>
        Confira títulos, duração e horários. Salvar acrescenta estes itens à sua
        agenda.
      </p>
      {value.tarefas.map((t, i) => (
        <article className="planning-card" key={t.ref}>
          <TaskFields
            task={{ ...t, concluida: false }}
            zone={zone}
            onChange={(updated) => {
              const { concluida, id, ...data } = updated;
              void concluida;
              void id;
              setValue({
                ...value,
                tarefas: value.tarefas.map((x, j) =>
                  j === i ? { ...data, ref: t.ref } : x,
                ),
              });
            }}
          />
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() =>
              setValue({
                ...value,
                tarefas: value.tarefas.filter((_, j) => j !== i),
                blocos: value.blocos.map((b) =>
                  b.tarefaRef === t.ref ? { ...b, tarefaRef: null } : b,
                ),
              })
            }
          >
            Retirar tarefa da proposta
          </button>
        </article>
      ))}
      {value.blocos.map((b, i) => (
        <article className="planning-card" key={i}>
          <BlockFields
            block={b}
            zone={zone}
            tasks={references}
            onChange={(updated) =>
              setValue({
                ...value,
                blocos: value.blocos.map((x, j) => (j === i ? updated : x)),
              })
            }
          />
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() =>
              setValue({
                ...value,
                blocos: value.blocos.filter((_, j) => j !== i),
              })
            }
          >
            Retirar bloco
          </button>
        </article>
      ))}
      <div className="button-row">
        <button
          className="primary"
          disabled={busy || (!value.blocos.length && !value.tarefas.length)}
        >
          Salvar planejamento
        </button>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={onDiscard}
        >
          Descartar
        </button>
      </div>
    </form>
  );
}
export function Assistant() {
  const [status, setStatus] = useState<{
      configurado: boolean;
    } | null>(null),
    [messages, setMessages] = useState<Message[]>([]),
    [tasks, setTasks] = useState<Task[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [zone, setZone] = useState("UTC"),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [disconnected, setDisconnected] = useState(false);
  const locked = useRef(false),
    pending = useRef<{
      pedidoId: string;
      texto: string;
      tarefaIds: string[];
    } | null>(null);
  async function load() {
    const state = await api<{ configurado: boolean }>("/assistente/status");
    setStatus(state);
    const [h, t, p] = await Promise.all([
      api<Message[]>("/assistente/mensagens"),
      api<Task[]>("/tarefas"),
      api<Preferences>("/planejamento/preferencias"),
    ]);
    setMessages(h);
    setTasks(t);
    setZone(p.fuso);
    setDisconnected(false);
  }
  async function run(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "A operação falhou.");
      if (e instanceof ApiError && e.status === 0) setDisconnected(true);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    void run(load);
  }, []);
  async function send() {
    const signature = JSON.stringify({
      texto: text.trim(),
      tarefaIds: selected,
    });
    if (
      !pending.current ||
      JSON.stringify({
        texto: pending.current.texto,
        tarefaIds: pending.current.tarefaIds,
      }) !== signature
    )
      pending.current = {
        pedidoId: crypto.randomUUID(),
        texto: text.trim(),
        tarefaIds: selected,
      };
    await api("/assistente/mensagens", pending.current);
    pending.current = null;
    setText("");
    await load();
  }
  return (
    <section className="surface planning-section assistant-page">
      {error && (
        <div className="feedback error" role="alert">
          <span>{error}</span>
          {!disconnected && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (pending.current && status?.configurado) {
                    await api("/assistente/mensagens", pending.current);
                    pending.current = null;
                    setText("");
                  }
                  await load();
                })
              }
            >
              {pending.current && status?.configurado
                ? "Tentar novamente"
                : "Atualizar conversa"}
            </button>
          )}
        </div>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {disconnected && (
        <div className="feedback offline">
          Conexão interrompida. Consulte o servidor antes de tentar novamente.
          <button disabled={busy} onClick={() => void run(load)}>
            Reconectar
          </button>
        </div>
      )}
      {!status ? (
        <p>Carregando sua conversa…</p>
      ) : (
        <>
          <h2>Assistente NeuroPlan</h2>
          <p>
            Converse em português sobre sua rotina, prioridades e divisão de
            tarefas.
          </p>
          {!status.configurado && (
            <p className="feedback offline">
              O assistente está temporariamente indisponível. Você pode
              continuar organizando suas tarefas em Planejamento e tentar
              novamente mais tarde.
            </p>
          )}
          <div className="assistant-disclosure">
            <p>
              Suas mensagens e o planejamento selecionado são processados pela
              Groq. Evite informações pessoais. Você revisa as sugestões antes
              de salvar.
            </p>
            <details>
              <summary>Como seus dados são usados</summary>
              <p>
                Enviamos seu pedido, até doze mensagens anteriores, as tarefas
                selecionadas, a disponibilidade, os compromissos e a agenda.
                Dados da conta, imagens, sinais faciais e cansaço não são
                incluídos automaticamente. O serviço externo pode reter dados
                para investigar erros ou abuso, conforme sua política.{" "}
                <a
                  href="https://console.groq.com/docs/your-data"
                  target="_blank"
                  rel="noreferrer"
                >
                  Privacidade na Groq
                </a>
                .
              </p>
              <p className="small">
                Até cinco pedidos/minuto e vinte/dia (UTC) por estudante. As
                cotas do serviço são compartilhadas. Este assistente ajuda a
                organizar estudos; não resolve exercícios nem oferece orientação
                de saúde.
              </p>
            </details>
          </div>
          <div className="button-row">
            {[
              "Organizar minha semana",
              "Dividir uma tarefa",
              "Priorizar atividades",
            ].map((shortcut) => (
              <button
                className="secondary"
                key={shortcut}
                disabled={busy}
                onClick={() => setText(shortcut)}
              >
                {shortcut}
              </button>
            ))}
          </div>
          <div className="conversation" aria-live="polite">
            {!messages.length && (
              <p>
                Informe seus objetivos e selecione as tarefas que deseja
                considerar.
              </p>
            )}
            {messages.map((m) => (
              <article className="chat-message" key={m.id}>
                <p>
                  <strong>Você</strong>
                </p>
                <p className="chat-text">{m.texto}</p>
                {m.estado === "CONCLUIDA" ? (
                  <>
                    <p>
                      <strong>NeuroPlan</strong>
                    </p>
                    <p className="chat-text">{m.resposta}</p>
                    {m.proposta &&
                      m.proposta_id &&
                      (m.proposta_estado === "RASCUNHO" ? (
                        <ProposalEditor
                          key={m.proposta_id + JSON.stringify(m.proposta)}
                          initial={m.proposta}
                          tasks={tasks}
                          zone={zone}
                          busy={busy || disconnected}
                          onSave={(value) =>
                            void run(async () => {
                              const current = await api<{ estado: string }>(
                                `/assistente/propostas/${m.proposta_id}`,
                              );
                              if (current.estado === "RASCUNHO")
                                await api(
                                  `/assistente/propostas/${m.proposta_id}`,
                                  value,
                                  "PUT",
                                );
                              await api(
                                `/assistente/propostas/${m.proposta_id}/confirmar`,
                                {},
                              );
                              await load();
                              setNotice("Planejamento confirmado e salvo.");
                            })
                          }
                          onDiscard={() =>
                            void run(async () => {
                              await api(
                                `/assistente/propostas/${m.proposta_id}`,
                                {},
                                "DELETE",
                              );
                              await load();
                              setNotice("Proposta descartada.");
                            })
                          }
                        />
                      ) : (
                        <p className="small">
                          {m.proposta_estado === "CONFIRMADA"
                            ? "Planejamento confirmado. Consulte a agenda."
                            : "Proposta descartada."}
                        </p>
                      ))}
                  </>
                ) : (
                  <p className="small">
                    {m.estado === "FALHA"
                      ? "Pedido sem resposta confirmada. Nada foi acrescentado à agenda."
                      : "Pedido em processamento. Clique em atualizar para consultar a resposta."}
                  </p>
                )}
                {m.estado === "FALHA" && (
                  <button
                    className="secondary"
                    disabled={busy || disconnected || !status.configurado}
                    onClick={() =>
                      void run(async () => {
                        await api("/assistente/mensagens", {
                          pedidoId: m.id,
                          texto: m.texto,
                          tarefaIds: m.tarefa_ids,
                        });
                        await load();
                      })
                    }
                  >
                    Tentar novamente este pedido
                  </button>
                )}
              </article>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(send);
            }}
          >
            <fieldset disabled={busy || disconnected}>
              <legend>Tarefas que a IA pode considerar</legend>
              {tasks
                .filter((t) => !t.concluida)
                .map((t) => (
                  <label className="task-checkbox" key={t.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(t.id!)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, t.id!]
                            : selected.filter((id) => id !== t.id),
                        )
                      }
                    />
                    {t.titulo}
                  </label>
                ))}
              {!tasks.some((t) => !t.concluida) && (
                <p className="small">
                  Nenhuma tarefa pendente. Você pode informar seu objetivo na
                  conversa.
                </p>
              )}
            </fieldset>
            <label>
              Seu pedido
              <textarea
                required
                maxLength={2000}
                rows={4}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Quero organizar minhas atividades nos próximos sete dias…"
              />
            </label>
            <div className="button-row">
              <button
                className="primary"
                disabled={busy || disconnected || !status.configurado}
              >
                {busy ? "Aguardando…" : "Enviar à IA"}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void run(load)}
              >
                Atualizar conversa
              </button>
              <button
                type="button"
                className="text-button"
                disabled={busy || disconnected}
                onClick={() => {
                  if (
                    window.confirm(
                      "Apagar a conversa e as propostas? As tarefas já confirmadas continuarão na agenda.",
                    )
                  )
                    void run(async () => {
                      await api("/assistente/mensagens", {}, "DELETE");
                      pending.current = null;
                      await load();
                      setNotice("Histórico da conversa apagado.");
                    });
                }}
              >
                Apagar histórico
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}
