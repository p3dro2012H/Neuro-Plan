# Publicar gratuitamente no Render e no Neon

Repositório: https://github.com/p3dro2012H/Neuro-Plan

## Banco Neon

1. Crie uma conta em https://neon.com e um projeto no plano Free.
2. Copie a connection string com conexão agrupada (pooled), mantendo `sslmode=require` e os parâmetros fornecidos pelo Neon.
3. Guarde a URL nas variáveis do Render. Nunca coloque no frontend, em prints ou no repositório.

## Render

1. Crie uma conta em https://render.com e conecte o GitHub da equipe.
2. Envie esta implementação e o `package-lock.json` da raiz ao repositório; exclua `.env` e `.local-db`.
3. Crie um Blueprint a partir do repositório: a raiz contém `render.yaml`. Confirme o serviço **Free**, sem serviços pagos.
4. Configure `DATABASE_URL` com a URL Neon e `APP_ORIGIN` com a URL HTTPS exata do Render, sem barra final (ex.: `https://neuro-plan-xxxx.onrender.com`). Após conhecer a URL gerada, ajuste a variável e faça novo deploy.
5. Build: `npm ci && npm run build`. Início: `npm start`; `AUTO_MIGRATE=true` aplica migrações antes de atender.
6. Confirme `/health` e o fluxo completo em duas contas. Verifique cookie HttpOnly, Secure e SameSite=Lax.

Express entrega interface e API na mesma origem HTTPS; não precisa de outro serviço para React. Credenciais do banco nunca vão para o navegador.

## Apresentação e limites gratuitos

Render Free suspende serviços ociosos e pode demorar aproximadamente um minuto para reiniciar. Abra antes da demonstração. Se houver aviso de falha, aguarde e clique em Reconectar; dados confirmados continuam no Neon. Não configure tráfego artificial para impedir suspensão.

Confira cotas em https://render.com/docs/free e https://neon.com/pricing antes de publicar. O PostgreSQL gratuito do Render expira após 30 dias; este projeto usa Neon. Não aceite upgrades pagos.

Use `npm run demo` como alternativa e prepare uma gravação real conforme `docs/ROTEIRO.md`. A publicação só estará concluída quando houver URL funcional testada. Esta configuração não cria contas ou projetos nesses serviços.

## Atualizações

Faça backup antes de mudanças estruturais. Migrações já aplicadas não devem ser reescritas; acrescente uma nova versão. Reverter código no Render não reverte banco. Logs não devem conter senhas, tokens, connection strings ou imagens.
