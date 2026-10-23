# Apresentação de aproximadamente 10 minutos

Slides atualizados em `apresentacao/NeuroPlan-assistente.pptx`; as versões anteriores foram preservadas. Não afirmar resultados com voluntários antes da avaliação. A integração usa Groq. Uma chamada real foi validada em 6 de outubro de 2026; testes de qualidade com estudantes continuam pendentes.

1. **NeuroPlan — 35 s.** Plataforma de organização dos estudos, com apoio a pausas e visão computacional como diferencial.
2. **Problema e objetivo — 45 s.** Organizar tarefas, distribuir tempo e incluir pausas. O estudante decide. Prevenção de burnout é motivação, sem efeito demonstrado.
3. **Experiência — 50 s.** Conta, tarefas, disponibilidade, compromissos e agenda de sete dias. Organizador manual para todas as contas, inclusive menores. Preparar estudo preenche a matéria; iniciar continua manual.
4. **Arquitetura — 60 s.** React, API Express e PostgreSQL. Groq é chamado somente pelo servidor; chave privada. A conversa recebe planejamento escolhido, sem dados faciais ou cansaço. Câmera e modelo MediaPipe ficam no navegador, em worker. Render e Neon para publicação; PGlite para demonstração local.
5. **Modelo e métricas — 65 s.** MediaPipe é pré-treinado pelo Google. Equipe adapta EAR/MAR e persistência temporal, sem reconhecimento emocional. Explicar limiares experimentais e regras de 25 minutos, dois sinais em cinco minutos ou autorrelato alto. Sugestão de pausa é escolha do estudante.
6. **Assistente — 65 s.** Todas as contas conectadas podem conversar, sem convites; a chave é configurada uma vez pelo dono no servidor. Conversa em português e proposta JSON validada com Zod e regras temporais. Perguntar dados faltantes, explicar o que não coube; editar, salvar ou descartar. Sem salvamento automático. Limites, timeout e alternativa manual.
7. **Como foi criado — 55 s.** Python original, adaptação web, contas, tarefas, agenda, migração 003, integração Groq e confirmação transacional. Distinguir desenvolvimento da equipe e modelos prontos. Informar apoio de IA conforme regras da faculdade.
8. **Verificação — 55 s.** Testes de isolamento, bloqueio sem login, deduplicação, conflitos, fusos, quota, respostas inválidas e timeout. Dois fluxos no Chrome com IA simulada. O teste real confirmou idioma, formato e pergunta por informações faltantes; avaliação com voluntários continua pendente.
9. **Demonstração — 90 s.** Criar tarefa, salvar disponibilidade, adicionar bloco e mostrar persistência após recarga. Com a chave da Groq configurada, dividir tarefa, editar proposta e confirmar; sem chave, mostrar somente a demonstração simulada identificada. Preparar matéria e iniciar manualmente. Demonstrar regra de pausa por autorrelato, se houver tempo. Use contas fictícias, sem credenciais nos slides.
10. **Limitações — 20 s.** IA pode errar; câmera depende de luz e posição. Próximos passos: ampliar a avaliação do assistente, publicar e avaliar utilidade/falsos alertas com voluntários.

Total: cerca de 600 s. Ajuste à exigência do professor.

## Demonstração de reserva disponível

`apresentacao/demo-reserva.webm` contém uma sequência de 12 telas completas capturadas do aplicativo real, com uma conta fictícia: login, preparação, estudo, recomendação, adiamento, pausa manual, retomada, aceitação, encerramento, resumo e histórico. O vídeo dura cerca de 60 segundos, sem áudio. É uma montagem de capturas, não uma gravação contínua das interações. Narre as etapas usando este roteiro.

A demonstração usa autorrelato para gerar a sugestão; não mostra inferência de uma pessoa real nem comprova acurácia do detector. Chrome/Edge conseguem reproduzir WebM. Teste no computador da apresentação; mantenha também o modo local e os slides.

## Fazer uma gravação contínua com narração

1. Execute `npm run demo` ou abra publicação e confira `/health`.
2. Use conta fictícia; oculte dados pessoais/abas/notificações.
3. Grave 2–3 min do fluxo do slide 9 com a ferramenta de gravação do computador. Não grave pessoas sem consentimento.
4. Reveja áudio, legibilidade e ausência de credenciais. Salve `apresentacao/demo-reserva.mp4` na máquina da equipe (ignorado pelo Git).

A gravação contínua deve usar o aplicativo real funcionando. Pode complementar ou substituir a montagem fornecida.
