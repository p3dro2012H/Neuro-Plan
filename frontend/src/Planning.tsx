import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
import {
  Block,
  Preferences,
  Task,
  emptyTask,
  taskBody,
} from "./planning-types";
import { fromZonedInput, planningDate, zonedInput } from "./planning-time";
const days = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];
export function TaskFields({
  task,
  onChange,
  zone,
}: {
  task: Task;
  onChange: (task: Task) => void;
  zone: string;
}) {
  return (
    <div className="planning-fields">
      <label>
        Título
        <input
          required
          maxLength={150}
          value={task.titulo}
          onChange={(e) => onChange({ ...task, titulo: e.target.value })}
        />
      </label>
      <label>
        Matéria (opcional)
        <input
          maxLength={150}
          value={task.materia}
          onChange={(e) => onChange({ ...task, materia: e.target.value })}
        />
      </label>
      <label>
        Duração estimada (min)
        <input
          type="number"
          min={1}
          max={1440}
          required
          value={task.estimativaMin}
          onChange={(e) =>
            onChange({ ...task, estimativaMin: Number(e.target.value) })
          }
        />
      </label>
      <label>
        Prioridade
        <select
          value={task.prioridade}
          onChange={(e) =>
            onChange({
              ...task,
              prioridade: e.target.value as Task["prioridade"],
            })
          }
        >
          <option value="BAIXA">Baixa</option>
          <option value="MEDIA">Média</option>
          <option value="ALTA">Alta</option>
        </select>
      </label>
      <label>
        Prazo (opcional) · {zone}
        <input
          type="datetime-local"
          value={task.prazo ? zonedInput(task.prazo, zone) : ""}
          onChange={(e) => {
            try {
              onChange({
                ...task,
                prazo: e.target.value
                  ? fromZonedInput(e.target.value, zone)
                  : null,
              });
            } catch (error) {
              e.target.setCustomValidity((error as Error).message);
            }
          }}
          onInput={(e) => e.currentTarget.setCustomValidity("")}
        />
      </label>
    </div>
  );
}
export function BlockFields({
  block,
  onChange,
  zone,
  tasks,
}: {
  block: Block;
  onChange: (b: Block) => void;
  zone: string;
  tasks: Task[];
}) {
  return (
    <div className="planning-fields">
      <label>
        Título do bloco
        <input
          required
          maxLength={150}
          value={block.titulo}
          onChange={(e) => onChange({ ...block, titulo: e.target.value })}
        />
      </label>
      <label>
        Matéria
        <input
          maxLength={150}
          value={block.materia}
          onChange={(e) => onChange({ ...block, materia: e.target.value })}
        />
      </label>
      <label>
        Tipo
        <select
          value={block.tipo}
          onChange={(e) =>
            onChange({ ...block, tipo: e.target.value as Block["tipo"] })
          }
        >
          <option value="ESTUDO">Estudo</option>
          <option value="PAUSA">Pausa</option>
          <option value="PESSOAL">Pessoal</option>
        </select>
      </label>
      <label>
        Tarefa vinculada
        <select
          value={block.tarefaRef ?? ""}
          onChange={(e) =>
            onChange({ ...block, tarefaRef: e.target.value || null })
          }
        >
          <option value="">Sem tarefa</option>
          {tasks
            .filter((t) => !t.concluida)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.titulo}
              </option>
            ))}
        </select>
      </label>
      {(["inicio", "fim"] as const).map((field) => (
        <label key={field}>
          {field === "inicio" ? "Início" : "Fim"} · {zone}
          <input
            required
            type="datetime-local"
            value={block[field] ? zonedInput(block[field], zone) : ""}
            onChange={(e) => {
              try {
                onChange({
                  ...block,
                  [field]: fromZonedInput(e.target.value, zone),
                });
              } catch (error) {
                e.target.setCustomValidity((error as Error).message);
              }
            }}
            onInput={(e) => e.currentTarget.setCustomValidity("")}
          />
        </label>
      ))}
    </div>
  );
}
export function Planning({ onStudy }: { onStudy: (subject: string) => void }) {
  const [prefs, setPrefs] = useState<Preferences>({
    fuso: Intl.DateTimeFormat().resolvedOptions().timeZone,
    disponibilidade: [],
    compromissos: [],
  });
  const [tasks, setTasks] = useState<Task[]>([]),
    [blocks, setBlocks] = useState<Block[]>([]),
    [task, setTask] = useState(emptyTask),
    [block, setBlock] = useState<Block>({
      titulo: "",
      materia: "",
      tipo: "ESTUDO",
      inicio: "",
      fim: "",
      tarefaRef: null,
    });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [unavailable, setUnavailable] = useState(false),
    [loaded, setLoaded] = useState(false),
    [zoneDraft, setZoneDraft] = useState("");
  const locked = useRef(false),
    pending = useRef<{ signature: string; id: string } | null>(null);
  async function load() {
    const [p, t, b] = await Promise.all([
      api<Preferences & { configurada: boolean }>("/planejamento/preferencias"),
      api<Task[]>("/tarefas"),
      api<{ blocos: Block[] }>("/planejamentos"),
    ]);
    const { configurada, ...data } = p;
    const pref = {
      ...data,
      fuso: configurada
        ? p.fuso
        : Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    setPrefs(pref);
    setZoneDraft(pref.fuso);
    setTasks(t);
    setBlocks(b.blocos);
    setLoaded(true);
    setUnavailable(false);
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
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
      if (e instanceof ApiError && (e.status === 0 || e.status >= 500))
        setUnavailable(true);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    void run(load);
  }, []);
  const disabled = busy || unavailable || !loaded;
  return (
    <div className="planning-page">
      {error && (
        <p className="feedback error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {unavailable && (
        <div className="feedback offline">
          Registros suspensos. Consulte o servidor para confirmar ações
          interrompidas.
          <button onClick={() => void run(load)} disabled={busy}>
            Reconectar
          </button>
        </div>
      )}
      <section className="surface planning-section">
        <h2>Horários disponíveis e compromissos</h2>
        <p>
          Defina seus horários antes de acrescentar blocos à agenda. Todos os
          horários abaixo usam o fuso escolhido.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const result = await api<Preferences>(
                "/planejamento/preferencias",
                { ...prefs, fuso: zoneDraft },
                "PUT",
              );
              setPrefs(result);
              await load();
              setNotice("Preferências salvas.");
            });
          }}
        >
          <label>
            Fuso horário
            <input
              required
              value={zoneDraft}
              list="planning-zones"
              onChange={(e) => setZoneDraft(e.target.value)}
            />
            <datalist id="planning-zones">
              {[
                "America/Sao_Paulo",
                "America/Cayenne",
                "America/Manaus",
                "America/Recife",
                "Europe/Lisbon",
                "UTC",
              ].map((z) => (
                <option key={z}>{z}</option>
              ))}
            </datalist>
          </label>
          <p className="small">
            Para mudar o fuso, digite o identificador e salve. Os compromissos
            mantêm o mesmo instante.
          </p>
          {prefs.disponibilidade.map((v, i) => (
            <div className="planning-row" key={i}>
              <label>
                Dia
                <select
                  value={v.dia}
                  onChange={(e) =>
                    setPrefs({
                      ...prefs,
                      disponibilidade: prefs.disponibilidade.map((x, j) =>
                        i === j ? { ...x, dia: Number(e.target.value) } : x,
                      ),
                    })
                  }
                >
                  {days.map((d, j) => (
                    <option key={d} value={j}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              {(["inicio", "fim"] as const).map((k) => (
                <label key={k}>
                  {k === "inicio" ? "Disponível a partir de" : "Até"}
                  <input
                    required
                    type="time"
                    value={v[k]}
                    onChange={(e) =>
                      setPrefs({
                        ...prefs,
                        disponibilidade: prefs.disponibilidade.map((x, j) =>
                          i === j ? { ...x, [k]: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </label>
              ))}
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setPrefs({
                    ...prefs,
                    disponibilidade: prefs.disponibilidade.filter(
                      (_, j) => i !== j,
                    ),
                  })
                }
              >
                Remover horário
              </button>
            </div>
          ))}
          <button
            type="button"
            className="secondary"
            disabled={disabled || prefs.disponibilidade.length >= 28}
            onClick={() =>
              setPrefs({
                ...prefs,
                disponibilidade: [
                  ...prefs.disponibilidade,
                  { dia: new Date().getDay(), inicio: "18:00", fim: "20:00" },
                ],
              })
            }
          >
            Adicionar disponibilidade
          </button>
          <h3>Compromissos fixos</h3>
          {prefs.compromissos.map((v, i) => (
            <div className="planning-row" key={i}>
              <label>
                Compromisso
                <input
                  required
                  maxLength={150}
                  value={v.titulo}
                  onChange={(e) =>
                    setPrefs({
                      ...prefs,
                      compromissos: prefs.compromissos.map((x, j) =>
                        i === j ? { ...x, titulo: e.target.value } : x,
                      ),
                    })
                  }
                />
              </label>
              {(["inicio", "fim"] as const).map((k) => (
                <label key={k}>
                  {k === "inicio" ? "Início" : "Fim"}
                  <input
                    required
                    type="datetime-local"
                    value={v[k] ? zonedInput(v[k], prefs.fuso) : ""}
                    onChange={(e) => {
                      try {
                        setPrefs({
                          ...prefs,
                          compromissos: prefs.compromissos.map((x, j) =>
                            i === j
                              ? {
                                  ...x,
                                  [k]: fromZonedInput(
                                    e.target.value,
                                    prefs.fuso,
                                  ),
                                }
                              : x,
                          ),
                        });
                      } catch (err) {
                        e.target.setCustomValidity((err as Error).message);
                      }
                    }}
                    onInput={(e) => e.currentTarget.setCustomValidity("")}
                  />
                </label>
              ))}
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setPrefs({
                    ...prefs,
                    compromissos: prefs.compromissos.filter((_, j) => j !== i),
                  })
                }
              >
                Remover compromisso
              </button>
            </div>
          ))}
          <div className="button-row">
            <button
              type="button"
              className="secondary"
              disabled={disabled || prefs.compromissos.length >= 30}
              onClick={() =>
                setPrefs({
                  ...prefs,
                  compromissos: [
                    ...prefs.compromissos,
                    { titulo: "", inicio: "", fim: "" },
                  ],
                })
              }
            >
              Adicionar compromisso
            </button>
            <button className="primary" disabled={disabled}>
              Salvar preferências
            </button>
          </div>
        </form>
      </section>
      <div className="planning-columns">
        <section className="surface planning-section">
          <h2>Minhas tarefas</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await api(
                  task.id ? `/tarefas/${task.id}` : "/tarefas",
                  taskBody(task),
                  task.id ? "PUT" : "POST",
                );
                setTask(emptyTask());
                await load();
                setNotice("Tarefa salva.");
              });
            }}
          >
            <TaskFields task={task} zone={prefs.fuso} onChange={setTask} />
            <div className="button-row">
              <button className="primary" disabled={disabled}>
                {task.id ? "Salvar tarefa" : "Criar tarefa"}
              </button>
              {task.id && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setTask(emptyTask())}
                >
                  Cancelar edição
                </button>
              )}
            </div>
          </form>
          <div className="planning-list">
            {!tasks.length && <p>Nenhuma tarefa cadastrada.</p>}
            {tasks.map((t) => (
              <article key={t.id} className="planning-card">
                <h3>
                  {t.concluida ? "✓ " : ""}
                  {t.titulo}
                </h3>
                <p>
                  {t.materia || "Sem matéria"} · {t.estimativaMin} min ·{" "}
                  {t.prioridade}
                </p>
                {t.prazo && <p>Prazo: {planningDate(t.prazo, prefs.fuso)}</p>}
                <div className="button-row">
                  <button
                    className="secondary"
                    disabled={disabled}
                    onClick={() => setTask(t)}
                  >
                    Editar
                  </button>
                  <button
                    className="secondary"
                    disabled={disabled}
                    onClick={() =>
                      void run(async () => {
                        await api(
                          `/tarefas/${t.id}`,
                          { ...taskBody(t), concluida: !t.concluida },
                          "PUT",
                        );
                        await load();
                        setNotice(
                          t.concluida
                            ? "Tarefa reaberta."
                            : "Tarefa concluída.",
                        );
                      })
                    }
                  >
                    {t.concluida ? "Reabrir" : "Concluir"}
                  </button>
                  <button
                    className="text-button"
                    disabled={disabled}
                    onClick={() =>
                      void run(async () => {
                        await api(`/tarefas/${t.id}`, {}, "DELETE");
                        await load();
                        setNotice("Tarefa excluída.");
                      })
                    }
                  >
                    Excluir
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="surface planning-section">
          <h2>Agenda · próximos sete dias</h2>
          <p className="small">
            Fuso: {prefs.fuso}. Salvar acrescenta um bloco, sem substituir os
            demais.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const { id, ...body } = block;
                if (id) await api(`/planejamentos/${id}`, body, "PUT");
                else {
                  const signature = JSON.stringify(body);
                  if (pending.current?.signature !== signature)
                    pending.current = { signature, id: crypto.randomUUID() };
                  await api("/planejamentos", {
                    pedidoId: pending.current.id,
                    tarefas: [],
                    blocos: [body],
                  });
                }
                pending.current = null;
                setBlock({
                  titulo: "",
                  materia: "",
                  tipo: "ESTUDO",
                  inicio: "",
                  fim: "",
                  tarefaRef: null,
                });
                await load();
                setNotice("Bloco salvo na agenda.");
              });
            }}
          >
            <BlockFields
              block={block}
              onChange={setBlock}
              zone={prefs.fuso}
              tasks={tasks}
            />
            <div className="button-row">
              <button className="primary" disabled={disabled}>
                {block.id ? "Salvar bloco" : "Adicionar bloco"}
              </button>
              {block.id && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    setBlock({
                      titulo: "",
                      materia: "",
                      tipo: "ESTUDO",
                      inicio: "",
                      fim: "",
                      tarefaRef: null,
                    })
                  }
                >
                  Cancelar edição
                </button>
              )}
            </div>
          </form>
          <div className="planning-list">
            {!blocks.length && <p>Nenhum bloco planejado.</p>}
            {blocks.map((b) => (
              <article className="planning-card" key={b.id}>
                <h3>{b.titulo}</h3>
                <p>
                  {planningDate(b.inicio, prefs.fuso)} —{" "}
                  {planningDate(b.fim, prefs.fuso)}
                </p>
                <p>
                  {b.tipo} · {b.materia || "Sem matéria"}
                </p>
                <div className="button-row">
                  {b.tipo === "ESTUDO" && (
                    <button
                      className="primary"
                      disabled={disabled}
                      onClick={() => onStudy(b.materia || b.titulo)}
                    >
                      Preparar estudo
                    </button>
                  )}
                  <button
                    className="secondary"
                    disabled={disabled}
                    onClick={() => setBlock(b)}
                  >
                    Editar bloco
                  </button>
                  <button
                    className="text-button"
                    disabled={disabled}
                    onClick={() =>
                      void run(async () => {
                        await api(`/planejamentos/${b.id}`, {}, "DELETE");
                        await load();
                        setNotice("Bloco excluído.");
                      })
                    }
                  >
                    Excluir bloco
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
