# Contrato da API

POST: JSON, mesma origem, cookie `pausa_auth`. Em produção, Origin deve coincidir com APP_ORIGIN. Erros: `{ "erro": "mensagem" }`. Horários ISO 8601 com fuso (UTC com `Z`). IDs de sessão/evento são UUID; pausaId é inteiro.

| Endpoint                       | Entrada / resultado                                                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| POST /auth/cadastro            | `{nome,email,senha}`; cria usuário/cookie; senha 8–72 caracteres e no máximo 72 bytes UTF-8                                   |
| POST /auth/login               | `{email,senha}`; usuário `{id,nome,email}` e cookie por 7 dias                                                                |
| POST /auth/logout              | `{}`; revoga token e limpa cookie                                                                                             |
| GET /auth/me                   | usuário ou 401                                                                                                                |
| GET /health                    | consulta banco; `{status:"ok"}` ou 503                                                                                        |
| POST /sessoes                  | `{materia,cansaco}`; cria sessão/autorrelato inicial; uma ativa por conta                                                     |
| GET /sessoes/ativa             | snapshot da sessão ativa ou null                                                                                              |
| GET /sessoes?offset=0          | página de 20 sessões próprias, mais recentes primeiro                                                                         |
| GET /sessoes/:id               | snapshot próprio, sem criar recomendações                                                                                     |
| POST /sessoes/:id/avaliar      | `{}`; avalia regras e retorna snapshot; interface consulta a cada 15 s, inclusive em segundo plano quando o navegador permite |
| POST /sessoes/:id/autorrelatos | `{cansaco}`; inteiro 1–5, momento DURANTE                                                                                     |
| POST /sessoes/:id/pausas       | `{acao:"manual"}` ou `{acao:"aceitar"\|"adiar"\|"concluir",pausaId}`                                                          |
| POST /sessoes/:id/encerrar     | `{cansaco}`; fecha sessão/pausa, grava FIM; repetição não duplica                                                             |
| POST /alertas                  | `{sessionId,eventoId,tipo,valorMetrica,timestamp}`; OLHOS_FECHADOS/BOCEJO, métrica finita 0–5                                 |

## Snapshot e regras

Dados da sessão, `agora` (relógio do servidor), `recomendacao` (PENDENTE/EM_ANDAMENTO ou null), listas `pausas`, `alertas`, `autorrelatos`, e `resumo`: `estudoSegundos`, `pausaSegundos`, `totalAlertas`, `aceitas`, `adiadas`. Snapshot inclui os 200 alertas mais recentes; o total considera todos. Tela lista os 20 mais recentes. Pausas manuais não contam como recomendações aceitas.

Dois sinais nos últimos 5 min do ciclo, 25 min desde o início do ciclo ou último cansaço do ciclo em 4–5 sugerem 5 min de pausa. Prioridade: autorrelato, sinais, tempo. Primeiro sinal gera aviso no cliente. Adiar impede novas sugestões por 5 min. Concluir pausa reinicia ciclo; sinais/autorrelatos antigos continuam no histórico, sem influenciar nova decisão.

Ocorrência visual contínua gera um evento por tipo; intervalo global de 30 s no detector/servidor. Aceita horários até 60 s atrasados ou 10 s adiantados, nunca antes do ciclo. Cliente usa o relógio do servidor. Reenvio idêntico de eventoId retorna 200/`duplicado:true`; novo retorna 201. Alterar conteúdo para ID existente retorna 409.

Transações com bloqueio serializam operações da sessão. Índices únicos garantem uma sessão ativa por conta e uma recomendação/pausa aberta por sessão. Sessão alheia: 404. Sinais durante pausa ou após encerrar: 409. Não há fila offline: falhas suspendem registros; Reconectar consulta estado persistido antes de continuar.

Tokens aleatórios ficam como SHA-256 no banco; senhas bcrypt. Login/cadastro: limite compartilhado de 20 pedidos por IP em 15 min, em memória, para instância única. Logout revoga o token atual; expiração bloqueia uso. Origem/JSON impedem ações por formulários externos.

# Planejamento e assistente

Todas as rotas abaixo exigem o cookie de autenticação. Operações que alteram dados exigem JSON e a origem permitida, como as rotas existentes.

| Rota                                       | Uso                                                                                                                                |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| GET/PUT `/planejamento/preferencias`       | Fuso IANA, disponibilidade `{dia:0..6,inicio:"HH:mm",fim:"HH:mm"}` e compromissos `{titulo,inicio,fim}`. GET inclui `configurada`. |
| GET/POST `/tarefas`                        | Lista ou cria tarefa: `{titulo,materia,prazo,estimativaMin,prioridade,concluida}`. Prazo ISO com fuso ou null.                     |
| PUT/DELETE `/tarefas/:id`                  | Edita o objeto completo ou exclui sua tarefa.                                                                                      |
| GET/POST `/planejamentos`                  | Consulta `{fuso,first,last,blocos}` ou salva `{pedidoId,tarefas,blocos}`; POST idempotente por UUID.                               |
| PUT/DELETE `/planejamentos/:id`            | Edita ou exclui seu bloco.                                                                                                         |
| GET `/assistente/status`                   | Consulta `{configurado:boolean}` para a conta conectada.                                                                           |
| GET/POST/DELETE `/assistente/mensagens`    | consulta últimos 30 pedidos, envia `{pedidoId,texto,tarefaIds}` ou apaga conversa e propostas.                                     |
| GET/PUT/DELETE `/assistente/propostas/:id` | consulta, edita proposta em rascunho `{tarefas,blocos}` ou descarta.                                                               |
| POST `/assistente/propostas/:id/confirmar` | confirma de modo transacional e idempotente. Corpo `{}`.                                                                           |

`prioridade` é BAIXA/MEDIA/ALTA; `tipo` do bloco é ESTUDO/PAUSA/PESSOAL. Bloco: `{titulo,materia,tipo,inicio,fim,tarefaRef}`. Proposta pode conter tarefas novas com `ref` textual único, sem `id`/`concluida`; `tarefaRef` usa essa referência ou o UUID de uma tarefa pendente da conta. Instantes são ISO 8601 com fuso. DELETE envia `{}`. Consulte [o guia](PLANEJAMENTO.md) para regras, privacidade e configuração.

Envio concluído retorna um pedido contendo `texto`, `resposta`, `estado`, `tarefa_ids`, `proposta_id`, `proposta` e `proposta_estado`. Nenhuma proposta é automaticamente confirmada. Respostas inválidas ou horários inválidos produzem 503 e não apresentam proposta pronta. Sem login: 401. Origem inválida: 403. Dados alheios: 404 (ou 409 para uma proposta que não está disponível para edição/descarte). Limite: 429. Sem chave/timeout/serviço indisponível: 503. Horários inválidos: 400. UUID reutilizado com outros dados: 409.
