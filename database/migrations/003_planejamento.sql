CREATE TABLE planejamento_preferencias (
 usuario_id INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
 fuso TEXT NOT NULL,
 disponibilidade JSONB NOT NULL DEFAULT '[]',
 compromissos JSONB NOT NULL DEFAULT '[]'
);
CREATE TABLE tarefas (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
 titulo TEXT NOT NULL, materia TEXT NOT NULL DEFAULT '', prazo TIMESTAMPTZ,
 estimativa_min INTEGER NOT NULL CHECK(estimativa_min > 0),
 prioridade TEXT NOT NULL CHECK(prioridade IN ('BAIXA','MEDIA','ALTA')),
 concluida BOOLEAN NOT NULL DEFAULT FALSE,
 criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX tarefas_usuario ON tarefas(usuario_id);
CREATE TABLE planejamento_blocos (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
 tarefa_id UUID REFERENCES tarefas(id) ON DELETE SET NULL,
 titulo TEXT NOT NULL, materia TEXT NOT NULL DEFAULT '',
 tipo TEXT NOT NULL CHECK(tipo IN ('ESTUDO','PAUSA','PESSOAL')),
 inicio TIMESTAMPTZ NOT NULL, fim TIMESTAMPTZ NOT NULL CHECK(fim > inicio)
);
CREATE INDEX planejamento_usuario ON planejamento_blocos(usuario_id,inicio);
CREATE TABLE assistente_mensagens (
 id UUID PRIMARY KEY,
 usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
 assinatura TEXT NOT NULL, texto TEXT NOT NULL, tarefa_ids JSONB NOT NULL DEFAULT '[]', resposta TEXT,
 estado TEXT NOT NULL CHECK(estado IN ('PROCESSANDO','CONCLUIDA','FALHA')),
 criado_em TIMESTAMPTZ NOT NULL, atualizado_em TIMESTAMPTZ NOT NULL
);
CREATE INDEX assistente_usuario ON assistente_mensagens(usuario_id,criado_em);
CREATE TABLE assistente_propostas (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
 mensagem_id UUID UNIQUE REFERENCES assistente_mensagens(id) ON DELETE CASCADE,
 dados JSONB NOT NULL,
 estado TEXT NOT NULL DEFAULT 'RASCUNHO' CHECK(estado IN ('RASCUNHO','CONFIRMADA','DESCARTADA'))
);
CREATE TABLE planejamento_confirmacoes (
 usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
 pedido_id UUID NOT NULL, assinatura TEXT NOT NULL, resultado JSONB NOT NULL,
 PRIMARY KEY(usuario_id,pedido_id)
);
CREATE TABLE assistente_uso (
 usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
 criado_em TIMESTAMPTZ NOT NULL
);
CREATE INDEX assistente_uso_usuario ON assistente_uso(usuario_id,criado_em);
