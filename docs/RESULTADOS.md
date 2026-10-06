# Verificações realizadas em 1 de outubro de 2026

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
