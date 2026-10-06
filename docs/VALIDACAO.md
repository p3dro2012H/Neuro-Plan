# Avaliação e evidências

Execute `npm run check`. Os testes verificam regras temporais, deduplicação, encerramento, subtração de pausas, autenticação/expiração, cookies, origem, limites, isolamento entre contas e migrações. Visão usa métricas e sequências sintéticas; isso não demonstra acurácia em pessoas reais.

## Câmera e voluntários (a realizar)

Peça consentimento; não registre nomes/imagens no relatório. Use P01/P02 e anote condições. Não peça para prolongar estudos ou simular sofrimento. Fechar olhos deliberadamente testa uma regra, sem provar fadiga real.

| Cenário | Esperado | Observado |
|---|---|---|
| Piscada curta | Nenhum evento | A preencher |
| Olhos fechados 2,5 s | Um evento, sem repetição contínua | A preencher |
| Boca aberta 1,2 s | Possível bocejo; fala pode ser falso alerta | A preencher |
| Rosto sai/retorna | Contador reinicia | A preencher |
| Óculos/baixa luz/posição lateral | Anotar perdas/falsos alertas | A preencher |
| Outra aba/programa/janela minimizada | Análise continua com navegador compatível; testar por 30 minutos | A preencher |
| Pausa/falha da API | Análise suspensa; câmera encerrada ao sair | A preencher |
| Notificação de recomendação | Um aviso por recomendação; clique retorna e atualiza sem aceitar automaticamente | A preencher |
| Notificação negada/Não perturbe | Aviso de permissão; recomendações continuam na interface | A preencher |
| Entrada antes do login | Aviso Ativar notificações; clique solicita permissão, Permitir remove aviso | A preencher |
| Notificação com aba visível | Recomendação pendente também notifica; primeiro sinal isolado não sugere pausa | A preencher |
| Botão Testar notificação | Aviso de teste permanece após atualização da sessão | A preencher |
| Adiamento por cinco minutos | Fecha aviso anterior; nova recomendação pode notificar ao vencer | A preencher |
| Interrupção dos quadros | Contadores reiniciados; não conta lacuna como olhos fechados | A preencher |
| Negar câmera/desconectar webcam | Estudo com tempo/autorrelato | A preencher |
| Recarregar durante estudo/pausa | Recuperar estado salvo | A preencher |
| API interrompida | Suspender registros/reconectar | A preencher |
| Duas contas | Histórico isolado | A preencher |
| Publicação HTTPS | Fluxo completo | A preencher |

Anote tentativas, eventos esperados/observados, falsos alertas e falhas. Separe testes deliberados de observações espontâneas. Pergunte sobre clareza, incômodo e utilidade. Uma amostra pequena não comprova prevenção de burnout.

## Aceitação

- URL HTTPS funcionando em Chrome/Edge.
- Cadastro/login, sessão, recomendação, aceitar/adiar, pausa, concluir, encerrar e histórico.
- Câmera opcional/local, isolamento de contas e reconexão verificados.
- Slides/roteiro ensaiados, alternativa local verificada, gravação de reserva realizada.

Publicação e avaliação com voluntários ficam pendentes até verificação real. Registre apenas comandos/resultados efetivamente executados em `docs/RESULTADOS.md`.
