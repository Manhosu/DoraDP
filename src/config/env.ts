import dotenv from 'dotenv';

dotenv.config();

function getEnvVar(key: string, required: boolean = true): string {
  const value = process.env[key]?.trim(); // Remove espaços e quebras de linha
  if (required && !value) {
    throw new Error(`Variável de ambiente ${key} não definida`);
  }
  return value || '';
}

export const env = {
  // Servidor
  nodeEnv: getEnvVar('NODE_ENV', false) || 'development',
  port: parseInt(getEnvVar('PORT', false) || '3000', 10),
  appUrl: getEnvVar('APP_URL', false) || 'http://localhost:3000',

  // Supabase
  supabaseUrl: getEnvVar('SUPABASE_URL'),
  supabaseAnonKey: getEnvVar('SUPABASE_ANON_KEY'),
  supabaseServiceRoleKey: getEnvVar('SUPABASE_SERVICE_ROLE_KEY'),

  // OpenAI
  openaiApiKey: getEnvVar('OPENAI_API_KEY'),

  // WhatsApp
  whatsappToken: getEnvVar('WHATSAPP_TOKEN'),
  whatsappPhoneNumberId: getEnvVar('WHATSAPP_PHONE_NUMBER_ID'),
  whatsappBusinessAccountId: getEnvVar('WHATSAPP_BUSINESS_ACCOUNT_ID'),
  whatsappVerifyToken: getEnvVar('WHATSAPP_VERIFY_TOKEN'),
  whatsappAppSecret: getEnvVar('WHATSAPP_APP_SECRET', false), // Opcional para validação de assinatura

  // Google OAuth
  googleClientId: getEnvVar('GOOGLE_CLIENT_ID'),
  googleClientSecret: getEnvVar('GOOGLE_CLIENT_SECRET'),
  googleRedirectUri: getEnvVar('GOOGLE_REDIRECT_URI'),

  // Notion OAuth
  notionClientId: getEnvVar('NOTION_CLIENT_ID', false),
  notionClientSecret: getEnvVar('NOTION_CLIENT_SECRET', false),
  notionRedirectUri: getEnvVar('NOTION_REDIRECT_URI', false) || 'https://doradp.onrender.com/auth/notion/callback',

  // Criptografia
  encryptionKey: getEnvVar('ENCRYPTION_KEY'),
};

export function validateEnv(): void {
  console.log('Validando variáveis de ambiente...');
  // A própria importação do env já valida as variáveis obrigatórias
  console.log('Variáveis de ambiente validadas com sucesso!');
}
