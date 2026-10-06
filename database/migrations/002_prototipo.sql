-- Horários legados sem fuso são interpretados como UTC. Conferir antes de migrar dados reais.
ALTER TABLE sessoes_estudo DROP COLUMN duracao_minutos;
ALTER TABLE usuarios ALTER COLUMN criado_em TYPE TIMESTAMPTZ USING criado_em AT TIME ZONE 'UTC';
ALTER TABLE sessoes_estudo ALTER COLUMN iniciada_em TYPE TIMESTAMPTZ USING iniciada_em AT TIME ZONE 'UTC';
ALTER TABLE sessoes_estudo ALTER COLUMN finalizada_em TYPE TIMESTAMPTZ USING finalizada_em AT TIME ZONE 'UTC';
ALTER TABLE alertas_fadiga ALTER COLUMN criado_em TYPE TIMESTAMPTZ USING criado_em AT TIME ZONE 'UTC';
ALTER TABLE pausas ALTER COLUMN criado_em TYPE TIMESTAMPTZ USING criado_em AT TIME ZONE 'UTC';
ALTER TABLE sessoes_estudo ADD COLUMN ciclo_iniciado_em TIMESTAMPTZ;
UPDATE sessoes_estudo SET ciclo_iniciado_em = iniciada_em;
ALTER TABLE sessoes_estudo ALTER COLUMN ciclo_iniciado_em SET NOT NULL;
ALTER TABLE sessoes_estudo ADD COLUMN adiada_ate TIMESTAMPTZ;
-- Duplicadas ativas devem ser resolvidas antes da migração, sem descartar dados automaticamente.
CREATE UNIQUE INDEX uma_sessao_ativa ON sessoes_estudo(usuario_id) WHERE finalizada_em IS NULL;
CREATE UNIQUE INDEX email_normalizado ON usuarios(lower(email));
ALTER TABLE alertas_fadiga ADD COLUMN evento_id UUID NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX evento_unico ON alertas_fadiga(evento_id);
ALTER TABLE pausas ADD COLUMN estado TEXT NOT NULL DEFAULT 'CONCLUIDA'
 CHECK (estado IN ('PENDENTE','ADIADA','EM_ANDAMENTO','CONCLUIDA','CANCELADA'));
ALTER TABLE pausas ADD COLUMN origem TEXT NOT NULL DEFAULT 'LEGADO';
ALTER TABLE pausas ADD COLUMN iniciada_em TIMESTAMPTZ;
ALTER TABLE pausas ADD COLUMN finalizada_em TIMESTAMPTZ;
ALTER TABLE pausas ADD COLUMN decidida_em TIMESTAMPTZ;
CREATE UNIQUE INDEX uma_pausa_aberta ON pausas(sessao_id) WHERE estado IN ('PENDENTE','EM_ANDAMENTO');
CREATE TABLE autorrelatos (
 id BIGSERIAL PRIMARY KEY, sessao_id UUID NOT NULL REFERENCES sessoes_estudo(id) ON DELETE CASCADE,
 nivel INTEGER NOT NULL CHECK(nivel BETWEEN 1 AND 5), momento TEXT NOT NULL CHECK(momento IN ('INICIO','DURANTE','FIM')),
 criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE autenticacoes (
 token_hash TEXT PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
 expira_em TIMESTAMPTZ NOT NULL, criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_auth_expira ON autenticacoes(expira_em);
CREATE INDEX idx_pausas_sessao ON pausas(sessao_id);
CREATE INDEX idx_autorrelatos_sessao ON autorrelatos(sessao_id);
