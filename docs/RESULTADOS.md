# Verificações do NeuroPlan

## Recuperação de 6 de outubro de 2026 — inicialização local

- O processo antigo `backend/dist/demo.js` continuava ativo em segundo plano na porta 3000. Foi encerrado especificamente após tentativa de parada; nenhum outro processo Node foi encerrado.
- A base local não abria mesmo após encerrar a instância. Diagnóstico em cópia confirmou `invalid resource manager ID in checkpoint record` / `could not locate a valid checkpoint record`, indicando WAL/checkpoint danificado.
- Original preservado em `.build/local-db-original-preservado` e cópia anterior em `.build/local-db-backup-20261006-200148`. Ferramenta aberta de recuperação PG17 revisada e executada somente na cópia de diagnóstico: [fonte](https://github.com/garrytan/gbrain/blob/master/src/core/pglite-resetwal.ts). Não foi aplicada automaticamente ao aplicativo.
- Após recuperar a cópia, os registros legíveis foram transferidos para uma base nova com as três migrações. Comparação de todos os campos copiados passou: 2 usuários, 8 sessões, 16 eventos, 17 pausas, 19 autorrelatos e 2 registros de autenticação. Sequências ajustadas; constraints verificadas durante a inserção; base limpa fechou e reabriu corretamente. A recuperação de WAL pode perder alterações recentes não recuperáveis; não há evidência suficiente para afirmar completude anterior à falha.
- Base limpa ativada como `.local-db`, preservando o original. API iniciada com sucesso: `/health` retornou JSON/200; tarefas, preferências e assistente passaram a retornar JSON/401 sem login, em vez de HTML/200.
- `backend/src/demo.ts` agora reserva a porta antes de abrir o banco. `npm run build -w backend` passou. Tentativa de segunda instância produziu mensagem clara de porta ocupada e saiu sem abrir a base, evitando concorrência entre instâncias locais.

## Correção de 6 de outubro de 2026 — tela branca no planejamento/assistente

- Diagnóstico no servidor local em execução: `/health` retornou JSON, mas `/tarefas`, `/planejamento/preferencias` e `/assistente/status` retornaram HTML com status 200. O processo ainda carregava a API anterior enquanto servia a interface recompilada.
- O cliente agora rejeita respostas HTML/JSON inválido com mensagem de reinício e reconexão, antes de atualizar os componentes. Proxy do Vite inclui as rotas de planejamento e assistente. Reiniciar `npm run demo` é necessário para carregar as rotas novas; não é necessário apagar a base local.
- `npm run check`: compilação passou e **23 testes passaram** (13 backend, 10 frontend), incluindo regressão de HTML com HTTP 200.
- Chrome headless: respostas HTML antigas simuladas nas duas áreas produziram aviso visível, sem tela branca; reconexão/atualização restauraram as telas. Os dois fluxos de organização e assistente também passaram.

## Atualização de 6 de outubro de 2026 — Groq e acesso direto

- `npm run check`: compilação frontend/API passou; **22 testes passaram**, 13 no backend e 9 na interface. Cobertura inclui acesso de qualquer conta, bloqueio sem login em todas as rotas do assistente, isolamento, origem, confirmação idempotente, quotas, timeout, respostas inválidas e preservação de conversa/proposta/tarefas de uma conta existente após reiniciar a API. O adaptador Groq usa JSON Schema estrito e mantém a chave apenas no cabeçalho do servidor.
- `node scripts/verify-planning-browser.mjs`: duas contas no Chrome headless acessaram o assistente sem convites; organização manual, revisão, edição, confirmação, consulta após recarga e preparação de estudo passaram. Esse teste usa banco em memória e IA simulada, sem alterar a base local.
- `node scripts/groq-smoke.cjs`: **chamada real à Groq passou**, usando `openai/gpt-oss-20b`. Resposta em português, JSON validado e proposta nula; o assistente pediu disponibilidade e compromissos antes de inventar horários. Nenhum dado real de estudante foi enviado. A chave não foi exibida. Esse teste verifica conectividade e formato, sem comprovar qualidade geral das propostas.
- Configuração única do dono documentada em `docs/PLANEJAMENTO.md`; variáveis privadas `GROQ_API_KEY` e `GROQ_MODEL`. Não há lista de convites nem alternância de fornecedores. Migração 003 e registros existentes preservados.
- Slides atualizados: `apresentacao/NeuroPlan-assistente.pptx`, com dez slides e roteiro. Pacote validado e imagens renderizadas inspecionadas. As versões anteriores foram preservadas.
- `backend/.env` estava rastreado pelo Git: retirado do índice com `git rm --cached`, mantendo o arquivo local. A regra de ignorar `.env` já existe. A alteração deve acompanhar o próximo commit.
- Pendentes: publicação externa, confirmação do plano Free no painel da equipe e avaliação de utilidade com voluntários. Nenhum upgrade ou método de pagamento foi configurado por estes testes.

Os registros seguintes descrevem versões anteriores e não representam o acesso atual ao assistente.

## Atualização de 6 de outubro de 2026 — planejamento

- `npm run check`: compilação frontend/API passou; **20 testes passaram**, sendo 11 no backend e 9 na interface. A suíte inclui migração 003, tarefas/agenda, autenticação e isolamento, acesso adulto verificado no servidor, deduplicação de pedidos e confirmação, edição/descarte, disponibilidade, conflitos, prazo, horizonte, fuso, tarefas concluídas, doze mensagens de contexto, quota, resposta inválida e timeout. O adaptador Gemini foi verificado com HTTP simulado, incluindo JSON estruturado, chave no cabeçalho e respostas 429/500.
- Chrome headless: conta demonstrativa sem convite criou tarefas e agenda manual, recarregou, consultou registros, recebeu bloqueio do chatbot pela API e preparou matéria sem iniciar estudo. Conta demonstrativa adulta convidada selecionou tarefa, recebeu proposta, editou título e horário, confirmou, recarregou e consultou agenda. Sem erros JavaScript observados.
- Os testes de navegador usam PostgreSQL em memória e **provedor de IA simulado**. Não chamam Google, não alteram `.local-db` e não validam a qualidade do Gemini real. Script reproduzível em `scripts/verify-planning-browser.mjs`.
- Guia de planejamento/piloto, instalação, publicação, API e roteiro atualizados. Os slides desta versão são `apresentacao/NeuroPlan-planejamento.pptx`.
- Pendente: chave da equipe e convite de adultos reais, projeto Google sem faturamento, teste da resposta real do modelo configurado, publicação externa e avaliação com voluntários. O organizador manual funciona sem configurar Gemini. Nenhuma conta externa ou serviço pago foi criado.

Os registros abaixo documentam verificações das versões anteriores.

## Compilação e testes

- `npm run check`: interface e API compiladas; oito testes passaram (cinco de API/regras/integração e três de métricas/detector). Os testes de integração usam PostgreSQL embarcado em memória, sem alterar banco externo.
- Migrações verificadas em banco vazio e schema legado; segunda execução não reaplica versões.
- Verificados autenticação/expiração/logout, cookies, origem, limites, isolamento entre contas, inícios concorrentes, reenvio concorrente de evento, pausa/adiamento, encerramento e duração descontada.
- Instalação npm: auditoria reportou zero vulnerabilidades na execução realizada. Isso é resultado pontual, não garantia futura.

## Navegador e persistência local

No navegador foram exercitados cadastro/login, sessão com cansaço inicial baixo e alto, recomendação por autorrelato, aceitar/adiar, pausa manual, retomada, autorrelato final, encerramento e histórico. Recarregar durante pausa recuperou o estado salvo.

Interromper o servidor fez a interface mostrar falha e suspender novos registros. Após reiniciar, Reconectar recuperou o estado; as sessões encerradas continuaram no banco local persistente.

O teste real do Web Worker carregou o modelo `.task` e WASM locais e processou uma imagem vazia sem emitir sinal. Repetido com as mesmas políticas CSP de produção, também passou. A primeira tentativa encontrou incompatibilidade com worker de módulo; a implementação foi corrigida para worker clássico antes da entrega.

## Material de apresentação

- Dez slides editáveis exportados, validados e inspecionados visualmente.
- Roteiro de aproximadamente dez minutos.
- Vídeo de reserva montado com capturas completas do aplicativo real, sem áudio, com dados fictícios: WebM de 60 segundos, 1920 × 1440. Reprodução verificada no navegador (sem erro de mídia). Não equivale a um ensaio com webcam real.

## Ainda pendente

- Publicação externa: depende de contas/projetos Render e Neon da equipe e envio do código ao GitHub. Não há URL publicada confirmada nesta entrega.
- Avaliação de webcam real: óculos, iluminação, fala/bocejo, movimentos e pessoas diferentes.
- Testes com voluntários, medição de falsos alertas e avaliação de utilidade.
- Ensaio do material no computador da faculdade e, se desejado, gravação contínua com narração.

## Atualização de 6 de outubro de 2026 — segundo plano

Build e suíte completa passaram: 12 testes (5 da API e 7 da interface). Quatro novos testes cobrem elegibilidade de notificações, identidade e deduplicação após adiamento, continuidade dos quadros e clique no service worker para focar a aba e atualizar a sessão sem aceitar automaticamente.

Implementados fluxo de quadros da câmera transferido ao worker, avaliação de recomendações na aba oculta, permissão e teste de notificações, deduplicação e encerramento dos avisos ao mudar o estado da recomendação. O processamento continua local. Documentação e roteiro atualizados.

A automação de navegador não iniciou nesta atualização (falha do runtime da ferramenta). Portanto, a exibição real do aviso pelo Windows e o funcionamento contínuo da webcam em Chrome/Edge por 30 minutos ainda precisam de validação manual conforme VALIDACAO.md. Os testes do navegador descritos acima referem-se à versão anterior.

Os resultados não demonstram prevenção de burnout nem validam diagnóstico de fadiga.

## Correções após teste do estudante — 6 de outubro de 2026

- Aviso de permissão disponível na entrada, inclusive antes do login. Verificado no Chrome: aparece com permissão não concedida, pode ser dispensado durante a visita e desaparece após permissão concedida. A confirmação nativa Permitir continua sendo responsabilidade do usuário.
- Recomendações pendentes podem solicitar notificação com a aba visível. A rotina de sincronização preserva o aviso de teste; anteriormente o encerrava ao consultar o estado da sessão.
- Câmera procura o processador de quadros no worker e na janela. Captura alternativa usa temporizador no worker e ignora quadros congelados; nenhuma captura depende de requestAnimationFrame. Contador de quadros e indicação de interrupção auxiliam o teste no equipamento do estudante.
- Suíte completa: 13 testes passaram (5 API e 8 interface). Build final da interface passou após ajuste visual do aviso.
- Teste de integração em Chrome com câmera simulada e banco em memória: fluxo normal e alternativa sem processador na janela continuaram processando quadros quando document.hidden foi simulado como verdadeiro. O estado foi controlado pelo teste; isso não comprova funcionamento sob suspensão real da aba pelo navegador. Solicitações nativas showNotification para teste e recomendação foram aceitas, sem duplicação após nova consulta.
- O ambiente de automação não apresentou avisos ativos no Windows. Portanto, entrega visual das notificações e webcam real em segundo plano continuam pendentes de teste no navegador do estudante. Nenhuma conta real ou vídeo de webcam foi usado nos testes automatizados.
