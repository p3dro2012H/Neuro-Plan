-- =========================================================================
-- Schema: monitoramento_fadiga
-- Sistema de Monitoramento de Estudos - Detecção de Fadiga
-- =========================================================================

CREATE TYPE tipo_alerta AS ENUM ('OLHOS_FECHADOS', 'BOCEJO');

-- -------------------------------------------------------------------------
-- 1. Usuários (estudantes que usam o sistema)
-- -------------------------------------------------------------------------
CREATE TABLE usuarios (
    id              SERIAL PRIMARY KEY,
    nome            VARCHAR(150) NOT NULL,
    email           VARCHAR(150) NOT NULL UNIQUE,
    senha_hash      VARCHAR(255) NOT NULL,
    tipo_estudo     VARCHAR(50),          -- ex.: 'concurso', 'medicina'
    criado_em       TIMESTAMP NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------------------
-- 2. Sessões de estudo
-- -------------------------------------------------------------------------
CREATE TABLE sessoes_estudo (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id      INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    materia         VARCHAR(150),
    iniciada_em     TIMESTAMP NOT NULL DEFAULT NOW(),
    finalizada_em   TIMESTAMP,
    duracao_minutos INTEGER GENERATED ALWAYS AS (
        CASE
            WHEN finalizada_em IS NOT NULL
            THEN EXTRACT(EPOCH FROM (finalizada_em - iniciada_em)) / 60
            ELSE NULL
        END
    ) STORED
);

-- -------------------------------------------------------------------------
-- 3. Alertas de fadiga (registrados pelo módulo de visão computacional)
-- -------------------------------------------------------------------------
CREATE TABLE alertas_fadiga (
    id              BIGSERIAL PRIMARY KEY,
    sessao_id       UUID NOT NULL REFERENCES sessoes_estudo(id) ON DELETE CASCADE,
    tipo            tipo_alerta NOT NULL,
    valor_metrica   NUMERIC(5, 3) NOT NULL,   -- valor de EAR ou MAR no momento do alerta
    criado_em       TIMESTAMP NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------------------
-- 4. Pausas sugeridas/realizadas (histórico das recomendações aplicadas)
-- -------------------------------------------------------------------------
CREATE TABLE pausas (
    id                      SERIAL PRIMARY KEY,
    sessao_id               UUID NOT NULL REFERENCES sessoes_estudo(id) ON DELETE CASCADE,
    duracao_sugerida_min    INTEGER NOT NULL,
    motivo                  TEXT,
    aceita_pelo_usuario     BOOLEAN,
    criado_em               TIMESTAMP NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------------------
-- Índices para consultas frequentes (dashboard e regra de negócio)
-- -------------------------------------------------------------------------
CREATE INDEX idx_alertas_sessao ON alertas_fadiga (sessao_id);
CREATE INDEX idx_sessoes_usuario ON sessoes_estudo (usuario_id);
