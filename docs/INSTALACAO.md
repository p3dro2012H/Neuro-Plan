# Como executar

Use Node.js 22 ou superior. Execute os comandos na raiz do projeto.

Tarefas e agenda estão na área **Planejamento**, com banco local e PostgreSQL. O **Assistente** está disponível para todas as contas. O dono configura uma única chave privada da Groq no servidor: siga [o guia de planejamento](PLANEJAMENTO.md). O modo local permite organização manual sem internet após a instalação; a IA exige conexão com a Groq.

## Demonstração local, sem instalar PostgreSQL

```powershell
npm ci
npm run demo
```

Abra http://localhost:3000, crie uma conta e inicie uma sessão. O comando prepara o modelo e compila o aplicativo. O banco usa PGlite (PostgreSQL embarcado), persistido em `.local-db`, ignorada pelo Git. Não exponha este modo na internet. `Ctrl+C` encerra o processo. Não compartilhe a pasta do banco: ela contém registros locais e hashes das senhas.

Após atualizar o código ou alterar `backend/.env`, encerre o servidor com **Ctrl+C**, execute novamente **`npm run demo`** e recarregue o navegador com **Ctrl+Shift+R**. Um processo já aberto continua usando a API antiga, mesmo quando os arquivos da interface são recompilados. Se aparecer “O servidor não retornou os dados esperados”, faça esse reinício. As contas e registros em `.local-db` são preservados.

Se aparecer “Já existe um servidor usando a porta 3000”, a segunda instância foi bloqueada antes de abrir o banco. Use a instância já aberta ou encerre-a no terminal original antes de reiniciar. Não abra duas instâncias nem apague `.local-db` para contornar erros. Em `Aborted()` durante a inicialização, preserve a pasta para diagnóstico e recuperação; esse erro pode indicar dano no banco local.

## Desenvolvimento com PostgreSQL

1. Instale PostgreSQL e crie `monitoramento_fadiga` (ou crie um projeto Neon).
2. Copie `backend/.env.example` para `backend/.env` e configure DB_HOST/DB_NAME/DB_USER/DB_PASSWORD ou DATABASE_URL. Não envie esse arquivo ao Git.
3. Na raiz, execute:

```powershell
npm ci
npm run assets
npm run migrate
npm run dev
```

Abra **http://localhost:5173**. O Vite encaminha as chamadas à API local (porta 3000). Use `localhost` para coincidir com APP_ORIGIN. No modo de demonstração use a porta 3000, sem Vite.

## Verificação

```powershell
npm run check
```

Compila interface/API e executa testes com PostgreSQL embarcado sem credenciais. Os testes usam bancos em memória e não alteram seu banco real. O modelo `.task` existente e o WASM da versão fixada do MediaPipe são copiados automaticamente no build. A instalação inicial exige internet; a demonstração local depois de instalada funciona sem serviços externos.

## Migrações em banco existente

O runner registra versões em `schema_migrations` e aplica alterações numa transação com bloqueio. Se `usuarios` existe, reconhece o schema inicial como legado e aplica somente a evolução. Faça backup antes de migrar dados importantes.

Horários antigos sem fuso são interpretados como UTC. Se eram locais, ajuste `AT TIME ZONE` na migração 002 **antes da primeira execução**. E-mails duplicados sem distinguir maiúsculas/minúsculas e várias sessões abertas do mesmo usuário interrompem a migração: resolva manualmente. Nenhum registro é descartado automaticamente. Senhas legadas precisam ser hashes bcrypt válidos; não há recuperação de senha nesta versão.

Pausas antigas sem horários de início/fim continuam no histórico, mas sua duração não pode ser reconstruída e não entra no total de pausas realizadas.

## Worker facial

O MediaPipe carrega o WASM usando `importScripts`. Por isso, o projeto prepara um worker clássico separado em `npm run assets`, igual em desenvolvimento e produção. Após mudar `frontend/src/vision.worker.ts` ou as métricas, execute esse comando novamente e recarregue a página.

Para verificar modelo/WASM/worker sem usar webcam, após o build execute `node scripts/vision-smoke.mjs` e abra `http://localhost:3000/vision-smoke.html` com a demonstração local ativa. Deve aparecer PASSOU. A página é um artefato de teste; o próximo build a remove.

## Câmera e tempo

Use Chrome/Edge num computador com webcam. Câmera exige HTTPS ou localhost. Ative-a no botão do aplicativo. Imagens não são enviadas à API. Se houver falha de câmera/modelo, continue com tempo e autorrelato. O aplicativo procura suporte ao processador de quadros no worker e na janela; quando indisponível ou incompatível, usa solicitações de captura pelo temporizador do worker, sem depender de animação da aba. A análise é suspensa durante pausas e falhas da API; sair da tela de estudo fecha a câmera. Interrupções entre quadros superiores a 500 ms reiniciam os contadores, preservando o intervalo mínimo entre eventos. A interface mostra o tipo de captura e a quantidade de quadros analisados; ausência de novos resultados por três segundos mostra captura interrompida. Um vídeo congelado não é contado repetidamente como novos quadros.

Na entrada do site, inclusive antes do login, aparece um aviso com **Ativar notificações** e **Agora não**. Clique em Ativar e depois em **Permitir** na confirmação do navegador: o aplicativo não pode aceitar essa confirmação pelo usuário. Ao permitir, o aviso desaparece. Agora não dispensa o aviso nesta visita; a opção permanece disponível após o login. Se já estiver bloqueada, o aviso orienta a mudar a permissão nas configurações do site.

Use **Testar notificação** para confirmar que o Windows exibe os avisos. Uma recomendação de pausa confirmada pela API pode notificar com a aba visível ou em segundo plano. O primeiro sinal isolado é registrado e gera um aviso dentro da sessão; dois sinais em cinco minutos, 25 minutos de estudo ou cansaço informado 4–5 podem gerar recomendação. Clique no aviso para voltar ao NeuroPlan, consultar o estado atual e aceitar ou adiar pelos controles da sessão. Não é necessário permitir notificações para estudar. Confira também o modo Não perturbe do Windows.

Mantenha a aba aberta e o computador acordado. Não há push com a aba fechada. Suspensão da aba, economia de recursos ou bloqueio do sistema podem interromper a câmera e atrasar avisos. A avaliação do tempo ocorre a cada 15 segundos quando o navegador permite; o cálculo usa os horários do servidor e não uma contagem de ticks. O tempo da sessão continua enquanto houver uma sessão aberta, mesmo com navegador fechado; registre pausa ou encerre ao parar de estudar.
