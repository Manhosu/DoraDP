-- =====================================================
-- Tabela para controle de idempotência de mensagens
-- Evita processamento duplicado de webhooks do WhatsApp
-- =====================================================

CREATE TABLE IF NOT EXISTS processed_messages (
    message_id VARCHAR(255) PRIMARY KEY,
    whatsapp_number VARCHAR(20) NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índice para limpeza automática (mensagens antigas)
CREATE INDEX IF NOT EXISTS idx_processed_messages_date
ON processed_messages(processed_at);

-- Comentário na tabela
COMMENT ON TABLE processed_messages IS 'Controle de idempotência para evitar processamento duplicado de mensagens do WhatsApp';

-- =====================================================
-- Função para limpar mensagens antigas (mais de 24h)
-- Pode ser executada via cron do Supabase ou manualmente
-- =====================================================
CREATE OR REPLACE FUNCTION cleanup_old_processed_messages()
RETURNS void AS $$
BEGIN
    DELETE FROM processed_messages
    WHERE processed_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;
