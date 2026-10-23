# Organização dos estudos e assistente

O NeuroPlan oferece tarefas e agenda para os próximos sete dias. A visão computacional é um recurso opcional durante a sessão de estudo. As notificações existentes continuam relacionadas às pausas, sem lembretes de tarefas.

## Usar o organizador

1. Entre e abra **Planejamento**. O fuso inicial vem do navegador. Confira o identificador, por exemplo `America/Sao_Paulo`, e salve as preferências.
2. Acrescente os horários disponíveis por dia e os compromissos fixos com início e fim. As disponibilidades são usadas apenas no horizonte de sete dias desta versão.
3. Cadastre tarefas com título, matéria opcional, prazo opcional, estimativa em minutos e prioridade. Use Editar, Concluir, Reabrir ou Excluir.
4. Adicione blocos de estudo, pausa ou atividade pessoal. O servidor verifica disponibilidade, duração positiva, prazos, conflitos e horizonte. Ajuste o formulário se houver erro.
5. Em um bloco de estudo, **Preparar estudo** preenche a matéria. A sessão só começa quando você clicar em iniciar. Uma sessão ativa precisa ser encerrada antes de preparar outra.

Salvar um bloco ou uma proposta acrescenta itens; não substitui a agenda. Preferências não podem invalidar blocos futuros: ajuste ou remova esses blocos antes de reduzir disponibilidade ou trocar de fuso. Horários da agenda e compromissos são instantes com fuso; mudar o fuso muda a exibição e as regras locais, preservando os instantes. Horários inexistentes devido à mudança de horário são recusados no formulário. Blocos não atravessam a meia-noite.

## Configurar o assistente uma única vez

Qualquer estudante conectado abre **Assistente** e conversa, sem convite ou chave individual. O público inicial é de estudantes a partir de 16 anos; a conta administrativa da Groq deve pertencer a um adulto da equipe. O organizador manual funciona sem configurar IA.

1. Crie a conta da equipe em [Groq Console](https://console.groq.com/), no plano Free. Não adicione método de pagamento nem ative upgrade.
2. Abra [API Keys](https://console.groq.com/keys), clique em **Create API Key**, dê o nome NeuroPlan e copie a chave.
3. Abra o arquivo existente `backend/.env` no editor e acrescente ou atualize:

```dotenv
GROQ_API_KEY=sua_chave_privada
GROQ_MODEL=openai/gpt-oss-20b
```

4. Salve e reinicie o servidor. No modo local, interrompa o terminal com Ctrl+C e execute `npm run demo` na raiz. Não execute duas instâncias sobre a mesma base local.
5. Na publicação, configure essas mesmas variáveis no painel privado do Render. A chave local não é enviada automaticamente à hospedagem.

Não envie a chave em conversas, prints, frontend ou Git. Nenhuma configuração é solicitada ao estudante. O servidor chama exclusivamente a Groq; não há alternância automática para outro fornecedor. A migração 003 continua sendo usada, preservando tarefas, propostas e conversas existentes.

Confira [configuração oficial](https://console.groq.com/docs/quickstart), [cotas compartilhadas da conta](https://console.groq.com/docs/rate-limits), [saída JSON estruturada](https://console.groq.com/docs/structured-outputs) e [faturamento](https://console.groq.com/docs/billing-faqs). O código não ativa upgrade nem verifica o plano contratado; mantenha Free no painel.

Antes de enviar, a tela explica o processamento pela Groq, com detalhes expansíveis. São enviados somente o pedido, até doze mensagens anteriores, tarefas selecionadas e dados de agenda/disponibilidade/compromissos. Nome, e-mail, senha, imagens, sinais faciais e autorrelatos não são incluídos automaticamente. Evite informações pessoais. Consulte [uso de dados](https://console.groq.com/docs/your-data) e [termos do serviço](https://console.groq.com/docs/legal/services-agreement); a equipe deve atender às exigências aplicáveis de uso e privacidade para seu público.

## Revisar uma proposta

Selecione tarefas pendentes e use um dos atalhos ou escreva seu pedido. Sem os dados necessários, o assistente deve perguntar e não produzir uma agenda pronta. A resposta precisa passar por Zod e validação de horários no servidor antes de aparecer como proposta.

Edite os cartões, retire itens, escolha **Salvar planejamento** ou **Descartar**. O servidor valida novamente ao editar e confirmar. Tarefas e blocos só são acrescentados depois da confirmação. A conversa pode ser apagada; itens já confirmados continuam na agenda.

Cada envio usa UUID. Um reenvio idêntico retorna a resposta existente, sem repetir a mensagem; uma confirmação repetida retorna o resultado salvo, sem repetir tarefas. A confirmação é transacional. Em falha, a interface não afirma que salvou: reconecte/atualize para consultar o servidor. Uma proposta ainda em rascunho pode ter ficado desatualizada por alterações manuais; edite seus horários antes de tentar confirmar novamente.

Limites locais: cinco tentativas por minuto e vinte por dia UTC, por usuário. Tentativas com falha também consomem limite. O servidor espera até trinta segundos e o navegador até quarenta e cinco. Quota, resposta inválida, timeout e serviço indisponível mantêm o organizador manual disponível. Sem chave, a tela informa indisponibilidade temporária; não há chatbot fictício no aplicativo.

## Verificação

`npm run check` compila e executa testes com bancos PostgreSQL em memória, sem credenciais reais. Para repetir o teste visual, instale Playwright no ambiente de teste ou configure `PLAYWRIGHT_MODULE_PATH` apontando ao pacote já instalado e execute:

```powershell
npm run build
node scripts/verify-planning-browser.mjs
```

O script usa Chrome headless, banco temporário em memória na porta 3013 e resposta de IA explicitamente simulada. Não altera `.local-db` nem chama a Groq. Verifica duas contas com acesso automático, organização manual, proposta editada antes de salvar e consulta após recarga. Para verificar uma resposta real sem expor a chave, após compilar execute `node scripts/groq-smoke.cjs`. O teste real envia apenas um pedido fictício sem dados de estudantes. Testes de qualidade e ensaios com a equipe continuam necessários antes da apresentação.

Não fazem parte desta versão: explicações de matérias, exercícios resolvidos, recorrência semanal, calendário externo, lembretes de tarefas ou orientação de saúde.
