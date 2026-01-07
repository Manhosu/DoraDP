-- ===========================================
-- AIJP - Schema do Banco de Dados
-- Migração 002: Criação da tabela de logs de eventos
-- ===========================================

-- Tabela para registrar eventos criados (auditoria)
CREATE TABLE IF NOT EXISTS events_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Referência ao usuário
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Dados do evento
    titulo VARCHAR(500) NOT NULL,
    tipo_evento VARCHAR(50) NOT NULL,
    data_inicio TIMESTAMP WITH TIME ZONE NOT NULL,
    data_fim TIMESTAMP WITH TIME ZONE,
    descricao TEXT,

    -- IDs externos (para referência)
    google_event_id VARCHAR(255),
    notion_page_id VARCHAR(255),

    -- Mensagem original
    mensagem_original TEXT,
    foi_audio BOOLEAN DEFAULT false,

    -- Status
    status VARCHAR(50) DEFAULT 'created',
    error_message TEXT,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_events_log_user_id ON events_log(user_id);
CREATE INDEX IF NOT EXISTS idx_events_log_data_inicio ON events_log(data_inicio);
CREATE INDEX IF NOT EXISTS idx_events_log_status ON events_log(status);

-- RLS
ALTER TABLE events_log ENABLE ROW LEVEL SECURITY;

-- Política: Service role tem acesso total
CREATE POLICY "Service role has full access to events_log" ON events_log
    FOR ALL
    USING (auth.role() = 'service_role');

-- Comentários
COMMENT ON TABLE events_log IS 'Log de todos os eventos criados pelo sistema';
COMMENT ON COLUMN events_log.status IS 'Status: created, synced_google, synced_notion, error';
