import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
import { Camera } from "./Camera";
import { Notifications } from "./Notifications";
import { NotificationPermissionPrompt } from "./NotificationPermissionPrompt";
import { FinishModal } from "./FinishModal";
import type { User, StudySession, HistoryItem, Signal } from "./types";
const duration = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
const date = (value: string) =>
  new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
const signalLabel = (type: string) =>
  type === "BOCEJO" ? "Possível bocejo" : "Olhos fechados por tempo sustentado";
function FatigueInput({
  value,
  onChange,
  id,
}: {
  value: number;
  onChange: (n: number) => void;
  id: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>Como está seu cansaço?</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {[
          "1 · Muito baixo",
          "2 · Baixo",
          "3 · Moderado",
          "4 · Alto",
          "5 · Muito alto",
        ].map((text, i) => (
          <option key={i} value={i + 1}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}
function AppContent() {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [offline, setOffline] = useState(false),
    [error, setError] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "cadastro">("login"),
    [page, setPage] = useState<"estudo" | "historico">("estudo");
  const [session, setSession] = useState<StudySession | null>(null),
    [detail, setDetail] = useState<StudySession | null>(null),
    [history, setHistory] = useState<HistoryItem[]>([]),
    [offset, setOffset] = useState(0);
  const [materia, setMateria] = useState(""),
    [fatigue, setFatigue] = useState(2),
    [finish, setFinish] = useState(false),
    [notice, setNotice] = useState(""),
    [tick, setTick] = useState(Date.now());
  const [signalVersion, setSignalVersion] = useState(0);
  const pendingSignal = useRef<
    (Signal & { sessionId: string; eventoId: string; timestamp: string }) | null
  >(null);
  const lock = useRef(false),
    current = useRef<StudySession | null>(null),
    offlineRef = useRef(false),
    userRef = useRef<User | null>(null),
    sync = useRef({ time: performance.now(), server: Date.now() });
  current.current = session;
  offlineRef.current = offline;
  userRef.current = user;
  const accept = useCallback((s: StudySession | null) => {
    current.current = s;
    setSession(s);
    if (s)
      sync.current = {
        time: performance.now(),
        server: new Date(s.agora).getTime(),
      };
  }, []);
  const failed = useCallback(
    (e: unknown) => {
      setError(
        e instanceof Error ? e.message : "Não foi possível concluir a ação.",
      );
      if (e instanceof ApiError) {
        if (e.status === 0 || e.status >= 500) {
          offlineRef.current = true;
          setOffline(true);
        }
        if (e.status === 401) {
          setUser(null);
          userRef.current = null;
          accept(null);
        }
      }
    },
    [accept],
  );
  const run = useCallback(
    async (task: () => Promise<void>) => {
      if (lock.current) return;
      lock.current = true;
      setBusy(true);
      setError("");
      try {
        await task();
      } catch (e) {
        failed(e);
      } finally {
        lock.current = false;
        setBusy(false);
      }
    },
    [failed],
  );
  const reconnect = useCallback(async () => {
    await run(async () => {
      const u = await api<User>("/auth/me");
      setUser(u);
      userRef.current = u;
      accept(await api<StudySession | null>("/sessoes/ativa"));
      setOffline(false);
      offlineRef.current = false;
      setFinish(false);
      setDetail(null);
      setNotice("Dados consultados no servidor.");
    });
  }, [run, accept]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const u = await api<User>("/auth/me");
        if (cancelled) return;
        setUser(u);
        userRef.current = u;
        const s = await api<StudySession | null>("/sessoes/ativa");
        if (!cancelled) accept(s);
      } catch (e) {
        if (!cancelled && !(e instanceof ApiError && e.status === 401))
          failed(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accept, failed]);
  useEffect(() => {
    const interval = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    if (!user || !session || offline || session.finalizada_em) return;
    const poll = () => {
      if (lock.current || offlineRef.current) return;
      void run(async () => {
        const s = current.current;
        if (s) accept(await api<StudySession>(`/sessoes/${s.id}/avaliar`, {}));
      });
    };
    const interval = setInterval(poll, 15000);
    const visible = () => {
      if (!document.hidden) poll();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [user?.id, session?.id, session?.finalizada_em, offline, run, accept]);
  const onSignal = useCallback((signal: Signal) => {
    const s = current.current;
    if (
      !s ||
      offlineRef.current ||
      s.finalizada_em ||
      s.recomendacao?.estado === "EM_ANDAMENTO"
    )
      return;
    const timestamp = new Date(
      sync.current.server + performance.now() - sync.current.time,
    ).toISOString();
    pendingSignal.current = {
      sessionId: s.id,
      eventoId: crypto.randomUUID(),
      ...signal,
      timestamp,
    };
    setSignalVersion((n) => n + 1);
  }, []);
  // Um pedido de avaliação pode estar em andamento quando o worker devolve um sinal.
  // Aguarda sua conclusão, sem criar fila offline nem reenviar eventos de outro ciclo.
  useEffect(() => {
    if (busy || lock.current || !pendingSignal.current) return;
    const signal = pendingSignal.current;
    pendingSignal.current = null;
    const s = current.current;
    if (
      offline ||
      !s ||
      s.id !== signal.sessionId ||
      s.finalizada_em ||
      s.recomendacao?.estado === "EM_ANDAMENTO" ||
      new Date(signal.timestamp) < new Date(s.ciclo_iniciado_em)
    )
      return;
    void run(async () => {
      const result = await api<StudySession>("/alertas", signal);
      accept(result);
      setNotice(
        signalLabel(signal.tipo) +
          " registrado. Um sinal isolado não confirma fadiga.",
      );
    });
  }, [signalVersion, busy, offline, session?.id, run, accept]);
  const loadHistory = (next = 0) =>
    run(async () => {
      const result = await api<HistoryItem[]>(`/sessoes?offset=${next}`);
      setHistory(result);
      setOffset(next);
      setDetail(null);
      setPage("historico");
    });
  const pause = (acao: "manual" | "aceitar" | "adiar" | "concluir") =>
    run(async () => {
      if (!session) return;
      accept(
        await api<StudySession>(`/sessoes/${session.id}/pausas`, {
          acao,
          pausaId: session.recomendacao?.id,
        }),
      );
      setNotice(
        acao === "adiar"
          ? "Recomendação adiada por 5 minutos."
          : acao === "concluir"
            ? "Pausa concluída. Um novo ciclo de estudo começou."
            : "Pausa iniciada. A análise da câmera está suspensa.",
      );
    });
  if (loading)
    return (
      <main className="loading">
        <span className="brand">◎ NeuroPlan</span>
        <p>Carregando seu espaço de estudo…</p>
      </main>
    );
  const feedback = (
    <>
      {error && (
        <div className="feedback error" role="alert">
          {error}
        </div>
      )}
      {offline && (
        <div className="feedback offline">
          <span>
            Registros suspensos até reconectar. Uma ação interrompida pode ter
            sido salva; consulte o servidor antes de repeti-la.
          </span>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void reconnect()}
          >
            Reconectar
          </button>
        </div>
      )}
    </>
  );
  if (!user)
    return (
      <main className="auth-layout">
        <section className="auth-story">
          <a className="brand" href="/">
            ◎ NeuroPlan
          </a>
          <p className="eyebrow">ESTUDO COM ESPAÇO PARA PAUSAS</p>
          <h1>
            Concentre-se.
            <br />
            Respire.
            <br />
            <em>Recomece.</em>
          </h1>
          <p>
            Organize uma sessão, acompanhe sinais de possível fadiga e escolha
            quando descansar.
          </p>
          <span className="privacy-note">
            Sua câmera fica no navegador.
            <br />
            Você continua no controle.
          </span>
        </section>
        <section className="auth-card">
          <p className="eyebrow">SEU ESPAÇO DE ESTUDO</p>
          <h2>
            {authMode === "login" ? "Bem-vindo de volta" : "Vamos começar"}
          </h2>
          <p>
            {authMode === "login"
              ? "Entre para continuar seus estudos."
              : "Crie uma conta para guardar suas sessões."}
          </p>
          {feedback}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              void run(async () => {
                const body = {
                  email: String(form.get("email")).trim(),
                  senha: String(form.get("senha")),
                  ...(authMode === "cadastro"
                    ? { nome: String(form.get("nome")).trim() }
                    : {}),
                };
                const u = await api<User>(`/auth/${authMode}`, body);
                setUser(u);
                userRef.current = u;
                accept(await api<StudySession | null>("/sessoes/ativa"));
                setOffline(false);
                setNotice("");
              });
            }}
          >
            {authMode === "cadastro" && (
              <div className="field">
                <label htmlFor="nome">Seu nome</label>
                <input
                  id="nome"
                  name="nome"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={150}
                />
              </div>
            )}
            <div className="field">
              <label htmlFor="email">E-mail</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={150}
              />
            </div>
            <div className="field">
              <label htmlFor="senha">
                Senha
                {authMode === "cadastro" ? " · mínimo de 8 caracteres" : ""}
              </label>
              <input
                id="senha"
                name="senha"
                type="password"
                autoComplete={
                  authMode === "cadastro" ? "new-password" : "current-password"
                }
                required
                minLength={authMode === "cadastro" ? 8 : 1}
                maxLength={72}
              />
            </div>
            <button className="primary full" disabled={busy}>
              {busy
                ? "Conectando…"
                : authMode === "login"
                  ? "Entrar"
                  : "Criar conta"}
            </button>
          </form>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              setAuthMode(authMode === "login" ? "cadastro" : "login");
              setError("");
            }}
          >
            {authMode === "login"
              ? "Ainda não tem conta? Cadastre-se"
              : "Já tem conta? Entre"}
          </button>
          <p className="small">
            Protótipo acadêmico de apoio a pausas. Não realiza diagnóstico de
            burnout.
          </p>
        </section>
      </main>
    );
  const shown = page === "historico" ? detail : session;
  // O relógio é extrapolado apenas enquanto a API está disponível; o resumo definitivo sempre vem do servidor.
  const elapsed =
    shown === session && !shown?.finalizada_em && !offline
      ? Math.max(0, Math.floor((performance.now() - sync.current.time) / 1000))
      : 0;
  void tick;
  const paused = shown?.recomendacao?.estado === "EM_ANDAMENTO";
  const studyTime =
      (shown?.resumo.estudoSegundos ?? 0) + (paused ? 0 : elapsed),
    pauseTime = (shown?.resumo.pausaSegundos ?? 0) + (paused ? elapsed : 0);
  const pauseElapsed =
    paused && shown?.recomendacao?.iniciada_em
      ? Math.max(
          0,
          Math.floor(
            (new Date(shown.agora).getTime() -
              new Date(shown.recomendacao.iniciada_em).getTime()) /
              1000,
          ) + elapsed,
        )
      : 0;
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/">
          ◎ NeuroPlan
        </a>
        <nav aria-label="Principal">
          <button
            className={page === "estudo" ? "selected" : ""}
            onClick={() => {
              setPage("estudo");
              setDetail(null);
            }}
          >
            Estudar
          </button>
          <button
            className={page === "historico" ? "selected" : ""}
            onClick={() => void loadHistory()}
            disabled={busy || offline}
          >
            Histórico
          </button>
        </nav>
        <div className="user-nav">
          <span>{user.nome}</span>
          <button
            className="text-button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await api("/auth/logout", {});
                setUser(null);
                accept(null);
                setHistory([]);
                setDetail(null);
                setNotice("");
                setPage("estudo");
              })
            }
          >
            Sair
          </button>
        </div>
      </header>
      <main className="workspace">
        {feedback}
        {notice && !error && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        <div className="page-heading">
          <div>
            <p className="eyebrow">
              {page === "historico" ? "SEU PERCURSO" : "UM CICLO DE CADA VEZ"}
            </p>
            <h1>
              {page === "historico"
                ? "Histórico de estudos"
                : session && !session.finalizada_em
                  ? session.materia
                  : "Hora de encontrar seu ritmo"}
            </h1>
            <p>
              {page === "historico"
                ? "Suas sessões, sinais e escolhas de pausa."
                : "Uma pausa também faz parte do aprendizado."}
            </p>
          </div>
          <span className="date-label">
            {new Date().toLocaleDateString("pt-BR", {
              day: "numeric",
              month: "long",
            })}
          </span>
        </div>
        <Notifications
          userId={user.id}
          session={session}
          offline={offline}
          onReturn={() => {
            setPage("estudo");
            void reconnect();
          }}
        />
        {page === "estudo" && !session && (
          <div className="start-layout">
            <section className="intro-panel">
              <span className="intro-number">25 / 5</span>
              <h2>
                Um tempo para estudar.
                <br />
                Um tempo para respirar.
              </h2>
              <p>
                Além do tempo, o sistema considera os sinais da câmera e o
                cansaço que você informa. As recomendações são experimentais;
                você escolhe o que fazer.
              </p>
              <p className="small">
                Câmera opcional · Sem gravação · Histórico individual
              </p>
            </section>
            <form
              className="surface start-form"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  accept(
                    await api<StudySession>("/sessoes", {
                      materia,
                      cansaco: fatigue,
                    }),
                  );
                  setNotice(
                    "Sessão iniciada e salva. Ative a câmera se desejar.",
                  );
                  setFinish(false);
                });
              }}
            >
              <h2>Começar uma sessão</h2>
              <div className="field">
                <label htmlFor="materia">O que você vai estudar?</label>
                <input
                  id="materia"
                  placeholder="Ex.: Cálculo · revisão para a prova"
                  required
                  maxLength={150}
                  value={materia}
                  onChange={(e) => setMateria(e.target.value)}
                />
              </div>
              <FatigueInput
                value={fatigue}
                onChange={setFatigue}
                id="initial-fatigue"
              />
              <button className="primary full" disabled={busy || offline}>
                Iniciar estudo <span>→</span>
              </button>
            </form>
          </div>
        )}
        {page === "historico" && !detail && (
          <section className="surface history">
            <h2>Sessões registradas</h2>
            {history.length === 0 ? (
              <p>
                Você ainda não tem sessões nesta página. Comece pelo botão
                Estudar.
              </p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Matéria</th>
                      <th>Início</th>
                      <th>Estado</th>
                      <th>Sinais</th>
                      <th>Resumo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((item) => (
                      <tr key={item.id}>
                        <td>{item.materia}</td>
                        <td>{date(item.iniciada_em)}</td>
                        <td>
                          {item.finalizada_em ? "Encerrada" : "Em andamento"}
                        </td>
                        <td>{item.total_alertas}</td>
                        <td>
                          <button
                            className="text-button"
                            disabled={busy || offline}
                            onClick={() =>
                              void run(async () => {
                                setDetail(
                                  await api<StudySession>(
                                    `/sessoes/${item.id}`,
                                  ),
                                );
                              })
                            }
                          >
                            Ver detalhes →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="pagination">
              <button
                className="secondary"
                disabled={offset === 0 || busy || offline}
                onClick={() => void loadHistory(offset - 20)}
              >
                Anterior
              </button>
              <span>Página {offset / 20 + 1}</span>
              <button
                className="secondary"
                disabled={history.length < 20 || busy || offline}
                onClick={() => void loadHistory(offset + 20)}
              >
                Próxima
              </button>
            </div>
          </section>
        )}
        {shown && (
          <>
            <div className="stats">
              <div>
                <span>Tempo de estudo</span>
                <strong>{duration(studyTime)}</strong>
              </div>
              <div>
                <span>Tempo de pausa</span>
                <strong>{duration(pauseTime)}</strong>
              </div>
              <div>
                <span>Sinais registrados</span>
                <strong>
                  {shown.resumo.totalAlertas.toString().padStart(2, "0")}
                </strong>
              </div>
              <div>
                <span>Recomendações</span>
                <strong>
                  {shown.resumo.aceitas}{" "}
                  <small>aceitas · {shown.resumo.adiadas} adiadas</small>
                </strong>
              </div>
            </div>
            {page === "estudo" && !shown.finalizada_em && (
              <div className="study-grid">
                <Camera
                  key={shown.id}
                  enabled={!paused && !offline}
                  onSignal={onSignal}
                />
                <aside className="study-aside">
                  <section
                    className={`surface recommendation ${paused ? "resting" : ""}`}
                  >
                    <p className="eyebrow">
                      {paused ? "MOMENTO DE DESCANSO" : "SEU RITMO"}
                    </p>
                    <h2>
                      {paused
                        ? "Faça uma pausa"
                        : shown.recomendacao
                          ? "Que tal descansar?"
                          : "Tudo pronto para estudar"}
                    </h2>
                    <p>
                      {shown.recomendacao?.motivo ??
                        "O primeiro sinal gera um aviso. Sinais recorrentes, tempo de estudo ou cansaço informado podem sugerir uma pausa."}
                    </p>
                    {paused ? (
                      <>
                        <strong className="rest-timer">
                          {duration(Math.max(0, 300 - pauseElapsed))}
                        </strong>
                        <p className="small">
                          {pauseElapsed >= 300
                            ? "Os 5 minutos sugeridos terminaram. Retome quando quiser."
                            : "Afaste o olhar da tela e descanse no seu ritmo."}
                        </p>
                        <button
                          className="primary full"
                          disabled={busy || offline}
                          onClick={() => void pause("concluir")}
                        >
                          Concluir pausa e retomar
                        </button>
                      </>
                    ) : shown.recomendacao ? (
                      <div className="button-row">
                        <button
                          className="primary"
                          disabled={busy || offline}
                          onClick={() => void pause("aceitar")}
                        >
                          Aceitar · 5 min
                        </button>
                        <button
                          className="secondary"
                          disabled={busy || offline}
                          onClick={() => void pause("adiar")}
                        >
                          Adiar · 5 min
                        </button>
                      </div>
                    ) : (
                      <button
                        className="secondary full"
                        disabled={busy || offline}
                        onClick={() => void pause("manual")}
                      >
                        Iniciar pausa manual
                      </button>
                    )}
                    {shown.adiada_ate &&
                      new Date(shown.adiada_ate).getTime() >
                        sync.current.server + elapsed * 1000 && (
                        <p className="small">
                          Nova sugestão após{" "}
                          {new Date(shown.adiada_ate).toLocaleTimeString(
                            "pt-BR",
                            { hour: "2-digit", minute: "2-digit" },
                          )}
                          .
                        </p>
                      )}
                  </section>
                  <section className="surface">
                    <FatigueInput
                      value={fatigue}
                      onChange={setFatigue}
                      id="during-fatigue"
                    />
                    <button
                      className="secondary full"
                      disabled={busy || offline}
                      onClick={() =>
                        void run(async () => {
                          accept(
                            await api<StudySession>(
                              `/sessoes/${shown.id}/autorrelatos`,
                              { cansaco: fatigue },
                            ),
                          );
                          setNotice("Cansaço informado e salvo.");
                        })
                      }
                    >
                      Registrar cansaço
                    </button>
                  </section>
                  <button
                    className="text-button end-button"
                    disabled={busy || offline}
                    onClick={() => setFinish(true)}
                  >
                    Encerrar sessão
                  </button>
                </aside>
              </div>
            )}
            {(shown.finalizada_em || page === "historico") && (
              <section className="surface summary">
                <h2>
                  {shown.materia} ·{" "}
                  {shown.finalizada_em
                    ? "Sessão encerrada"
                    : "Sessão em andamento"}
                </h2>
                <p>
                  {date(shown.iniciada_em)}
                  {shown.finalizada_em
                    ? " até " + date(shown.finalizada_em)
                    : ""}
                </p>
                <p>
                  Cansaço inicial:{" "}
                  {shown.autorrelatos.find((r) => r.momento === "INICIO")
                    ?.nivel ?? "—"}
                  /5 · Cansaço final:{" "}
                  {shown.autorrelatos.find((r) => r.momento === "FIM")?.nivel ??
                    "—"}
                  /5
                </p>
                <p>
                  Pausas realizadas:{" "}
                  {shown.pausas.filter((p) => p.iniciada_em).length}. As
                  durações exibidas descontam o tempo de pausa do tempo de
                  estudo.
                </p>
                <button
                  className="primary"
                  disabled={busy || offline}
                  onClick={() => {
                    if (page === "historico") setDetail(null);
                    else {
                      accept(null);
                      setFinish(false);
                      setNotice("");
                    }
                  }}
                >
                  {page === "historico"
                    ? "Voltar ao histórico"
                    : "Preparar nova sessão"}
                </button>
              </section>
            )}
            <section className="surface events">
              <h2>Sinais e pausas</h2>
              <div className="event-columns">
                <div>
                  <h3>Sinais observados</h3>
                  {shown.alertas.length === 0 ? (
                    <p className="small">Nenhum sinal registrado.</p>
                  ) : (
                    <ul>
                      {shown.alertas.slice(0, 20).map((a) => (
                        <li key={a.evento_id}>
                          <span>{signalLabel(a.tipo)}</span>
                          <time>{date(a.criado_em)}</time>
                        </li>
                      ))}
                    </ul>
                  )}
                  {shown.alertas.length > 20 && (
                    <p className="small">
                      Exibindo os 20 sinais mais recentes.
                    </p>
                  )}
                </div>
                <div>
                  <h3>Escolhas de pausa</h3>
                  {shown.pausas.length === 0 ? (
                    <p className="small">Nenhuma pausa registrada.</p>
                  ) : (
                    <ul>
                      {shown.pausas
                        .slice(-20)
                        .reverse()
                        .map((p) => (
                          <li key={p.id}>
                            <span>
                              {p.origem === "MANUAL"
                                ? "Pausa manual"
                                : "Sugestão de pausa"}
                            </span>
                            <small>
                              {
                                {
                                  PENDENTE: "Aguardando escolha",
                                  ADIADA: "Adiada",
                                  EM_ANDAMENTO: "Em andamento",
                                  CONCLUIDA: "Concluída",
                                  CANCELADA: "Cancelada",
                                }[p.estado]
                              }
                            </small>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              </div>
            </section>
          </>
        )}
        <footer>
          NeuroPlan · Protótipo acadêmico. Sinais visuais e regras experimentais
          não confirmam fadiga nem diagnosticam burnout.
        </footer>
      </main>
      {finish && session && !session.finalizada_em && (
        <FinishModal onClose={() => setFinish(false)}>
          <h2 id="finish-title">Como você termina esta sessão?</h2>
          <p>
            Informe seu cansaço para salvar o resumo. Se houver uma pausa em
            andamento, ela será concluída junto com a sessão.
          </p>
          <FatigueInput
            value={fatigue}
            onChange={setFatigue}
            id="final-fatigue"
          />
          <div className="button-row">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setFinish(false)}
            >
              Continuar sessão
            </button>
            <button
              className="primary"
              disabled={busy || offline}
              onClick={() =>
                void run(async () => {
                  accept(
                    await api<StudySession>(`/sessoes/${session.id}/encerrar`, {
                      cansaco: fatigue,
                    }),
                  );
                  setFinish(false);
                  setNotice("Sessão encerrada e resumo salvo.");
                })
              }
            >
              Salvar e encerrar
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
        </FinishModal>
      )}
    </div>
  );
}

export function App() {
  return (
    <>
      <NotificationPermissionPrompt />
      <AppContent />
    </>
  );
}
