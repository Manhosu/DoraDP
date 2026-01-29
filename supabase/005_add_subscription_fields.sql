-- =====================================================
-- Adicionar campos de controle de assinatura na tabela users
-- Para integração com Hotmart
-- =====================================================

-- Adicionar coluna de status da assinatura
-- Valores: 'active', 'trial', 'expired', 'canceled', NULL (sem assinatura/legado)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(20) DEFAULT NULL;

-- Adicionar coluna de data de expiração (para bônus de 3 meses)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Adicionar coluna para guardar o ID do produto na Hotmart
ALTER TABLE users
ADD COLUMN IF NOT EXISTS hotmart_product_id VARCHAR(50) DEFAULT NULL;

-- Adicionar coluna de email (vem da Hotmart)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS email VARCHAR(255) DEFAULT NULL;

-- Índice para buscar usuários por status
CREATE INDEX IF NOT EXISTS idx_users_subscription_status
ON users(subscription_status);

-- Índice para buscar usuários prestes a expirar
CREATE INDEX IF NOT EXISTS idx_users_subscription_expires
ON users(subscription_expires_at)
WHERE subscription_expires_at IS NOT NULL;

-- Comentários nas colunas
COMMENT ON COLUMN users.subscription_status IS 'Status da assinatura: active, trial, expired, canceled, NULL';
COMMENT ON COLUMN users.subscription_expires_at IS 'Data de expiração do acesso (para bônus/trial)';
COMMENT ON COLUMN users.hotmart_product_id IS 'ID do produto na Hotmart que deu acesso';
COMMENT ON COLUMN users.email IS 'Email do usuário (vindo da Hotmart)';
