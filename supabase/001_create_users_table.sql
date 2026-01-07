-- ===========================================
-- AIJP - Schema do Banco de Dados
-- Migração 001: Criação da tabela users
-- ===========================================

-- Habilitar extensão para UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Habilitar extensão para criptografia
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Tabela principal de usuários
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Identificação
    whatsapp_number VARCHAR(20) UNIQUE NOT NULL,
    full_name VARCHAR(255),

    -- Tokens Google (criptografados)
    google_access_token TEXT,
    google_refresh_token TEXT,
    google_token_expiry TIMESTAMP WITH TIME ZONE,

    -- Tokens Notion (criptografados)
    notion_token TEXT,
    notion_database_id VARCHAR(255),

    -- Preferências
    timezone VARCHAR(50) DEFAULT 'America/Sao_Paulo',
    is_active BOOLEAN DEFAULT true,
    onboarding_completed BOOLEAN DEFAULT false,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índice para busca por número do WhatsApp
CREATE INDEX IF NOT EXISTS idx_users_whatsapp_number ON users(whatsapp_number);

-- Índice para usuários ativos
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active) WHERE is_active = true;

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ===========================================
-- Row Level Security (RLS)
-- ===========================================

-- Habilitar RLS na tabela
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Política: Service role tem acesso total
CREATE POLICY "Service role has full access" ON users
    FOR ALL
    USING (auth.role() = 'service_role');

-- Política: Usuários autenticados podem ver apenas seus próprios dados
-- (Para uso futuro com autenticação de usuários)
CREATE POLICY "Users can view own data" ON users
    FOR SELECT
    USING (auth.uid()::text = id::text);

-- ===========================================
-- Comentários nas colunas
-- ===========================================

COMMENT ON TABLE users IS 'Tabela principal de usuários do sistema AIJP';
COMMENT ON COLUMN users.whatsapp_number IS 'Número do WhatsApp no formato internacional (ex: 5511999999999)';
COMMENT ON COLUMN users.google_access_token IS 'Token de acesso do Google OAuth2 (criptografado)';
COMMENT ON COLUMN users.google_refresh_token IS 'Token de refresh do Google OAuth2 (criptografado)';
COMMENT ON COLUMN users.notion_token IS 'Token de integração do Notion (criptografado)';
COMMENT ON COLUMN users.notion_database_id IS 'ID da database do Notion do usuário';
COMMENT ON COLUMN users.timezone IS 'Timezone do usuário para cálculo de datas';
