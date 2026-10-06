# Apresentação de aproximadamente 10 minutos

Slides editáveis em `apresentacao/NeuroPlan.pptx`. Não afirmar resultados com voluntários antes da avaliação.

1. **NeuroPlan — 35 s.** Projeto acadêmico de apoio a pausas durante estudos.
2. **Problema e objetivo — 45 s.** Sinais visuais isolados são ambíguos. O estudante escolhe; prevenção de burnout é motivação, não efeito demonstrado.
3. **Experiência — 50 s.** Cadastro, autorrelato inicial, matéria, câmera opcional e permissão de notificações. Estudar em outra aba/programa com o NeuroPlan aberto; receber sugestão, retornar pelo aviso e aceitar ou adiar. Pausa, autorrelato final e histórico.
4. **Arquitetura — 60 s.** Navegador calcula sinais; API valida/decide; PostgreSQL guarda. Worker separa análise da interface. Imagens ficam locais.
5. **Modelo e métricas — 65 s.** MediaPipe é pré-treinado pelo Google; a equipe não treinou reconhecimento de emoções. Explicar EAR/MAR e mostrar valores na tela.
6. **Regras — 65 s.** Persistência dos sinais, intervalo de eventos, dois sinais em cinco minutos, 25 minutos e cansaço 4–5. Parâmetros experimentais; adiar é respeitado; pausa reinicia ciclo.
7. **Como foi criado — 55 s.** Python original, adaptação web, autenticação, persistência, interface, testes e configuração de publicação. Distinguir contribuição da equipe das bibliotecas e informar apoio de IA conforme regras da faculdade.
8. **Verificação — 55 s.** Mostrar resultados reais dos testes executados. Separar dos testes com webcam/voluntários, pendentes até registro.
9. **Demonstração — 90 s.** Entrar, iniciar com cansaço baixo, ativar câmera e notificações, usar Testar notificação e mostrar retorno ao sistema. Informar cansaço 4 para sugerir pausa sem esperar 25 min, trocar de aba, clicar no aviso e adiar. Iniciar pausa manual, concluir, encerrar e abrir histórico. Dados fictícios; demonstração de regra, não prova de fadiga. Ensaiar o aviso em segundo plano antes da apresentação, pois permissões e configurações do Windows podem ocultá-lo.
10. **Limitações — 20 s.** Fala parece bocejo; limiares/iluminação variam. Próximo trabalho: calibração e avaliação de utilidade.

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
