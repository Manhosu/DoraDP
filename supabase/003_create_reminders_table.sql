-- =============================================
-- Tabela de lembretes (reminders)
-- =============================================

CREATE TABLE IF NOT EXISTS reminders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_log_id UUID REFERENCES events_log(id) ON DELETE SET NULL,
    google_event_id VARCHAR(255),
    event_title VARCHAR(500) NOT NULL,
    event_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
    reminder_time TIMESTAMP WITH TIME ZONE NOT NULL,
    sent BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indice para buscar lembretes pendentes de forma eficiente
CREATE INDEX IF NOT EXISTS idx_reminders_pending
ON reminders(reminder_time)
WHERE sent = false;

-- Indice para buscar lembretes por usuario
CREATE INDEX IF NOT EXISTS idx_reminders_user_id
ON reminders(user_id);

-- Indice para buscar por google_event_id (para atualizar/cancelar)
CREATE INDEX IF NOT EXISTS idx_reminders_google_event_id
ON reminders(google_event_id)
WHERE google_event_id IS NOT NULL;

-- Comentarios
COMMENT ON TABLE reminders IS 'Lembretes de eventos a serem enviados via WhatsApp';
COMMENT ON COLUMN reminders.event_datetime IS 'Data/hora do evento original';
COMMENT ON COLUMN reminders.reminder_time IS 'Data/hora em que o lembrete deve ser enviado (ex: 10 min antes)';
COMMENT ON COLUMN reminders.sent IS 'Se o lembrete ja foi enviado';
