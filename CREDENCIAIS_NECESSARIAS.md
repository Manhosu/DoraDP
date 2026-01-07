# Credenciais e Configurações Externas Necessárias

Este documento lista TUDO que você precisa criar/configurar externamente antes de iniciar o desenvolvimento.

---

## 1. Supabase (Banco de Dados)

**Onde criar:** https://supabase.com

| Credencial | Onde encontrar |
|------------|----------------|
| `SUPABASE_URL` | Project Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | Project Settings → API → anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → service_role (secreto) |

**Passos:**
1. Criar conta no Supabase
2. Criar novo projeto
3. Aguardar provisionamento do banco
4. Copiar as credenciais acima

---

## 2. OpenAI (IA - Whisper e GPT-4o)

**Onde criar:** https://platform.openai.com

| Credencial | Onde encontrar |
|------------|----------------|
| `OPENAI_API_KEY` | API Keys → Create new secret key |

**Passos:**
1. Criar conta na OpenAI
2. Adicionar método de pagamento (é pago por uso)
3. Gerar API Key
4. **IMPORTANTE:** Guarde a chave, ela só aparece uma vez

**Custos estimados:**
- Whisper: ~$0.006 por minuto de áudio
- GPT-4o: ~$5 por 1M tokens de entrada, ~$15 por 1M tokens de saída

---

## 3. WhatsApp Business API (Meta)

**Onde criar:** https://developers.facebook.com

| Credencial | Onde encontrar |
|------------|----------------|
| `WHATSAPP_TOKEN` | WhatsApp → API Setup → Temporary access token (ou permanente) |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp → API Setup → Phone number ID |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | WhatsApp → API Setup → Business Account ID |
| `WHATSAPP_VERIFY_TOKEN` | Você define (string aleatória para verificar webhook) |
| `WHATSAPP_APP_SECRET` | App Settings → Basic → App Secret (para validação de assinatura) |

**Passos:**
1. Criar conta de desenvolvedor no Meta for Developers
2. Criar um App do tipo "Business"
3. Adicionar o produto "WhatsApp"
4. Configurar número de telefone de teste (ou usar um real)
5. Gerar token de acesso
6. Configurar URL do webhook (precisa de HTTPS público)

**Observações:**
- Para produção, você precisa verificar o negócio
- Número de teste só envia para números cadastrados
- Webhook precisa responder ao challenge de verificação

---

## 4. Google Cloud Platform (Calendar API + OAuth2)

**Onde criar:** https://console.cloud.google.com

| Credencial | Onde encontrar |
|------------|----------------|
| `GOOGLE_CLIENT_ID` | APIs & Services → Credentials → OAuth 2.0 Client IDs |
| `GOOGLE_CLIENT_SECRET` | APIs & Services → Credentials → OAuth 2.0 Client IDs |
| `GOOGLE_REDIRECT_URI` | Você define (ex: https://seudominio.com/auth/google/callback) |

**Passos:**
1. Criar projeto no Google Cloud Console
2. Ativar a API "Google Calendar API"
3. Configurar tela de consentimento OAuth:
   - Tipo: Externo
   - Nome do app, email de suporte, logo
   - Escopos necessários:
     - `https://www.googleapis.com/auth/calendar`
     - `https://www.googleapis.com/auth/calendar.events`
4. Criar credencial OAuth 2.0:
   - Tipo: Aplicativo Web
   - Adicionar URI de redirecionamento autorizado
5. Baixar JSON ou copiar Client ID e Client Secret

**Observações:**
- App começa em modo "Teste" (limite de 100 usuários)
- Para produção, precisa verificar o app com Google
- Processo de verificação pode levar semanas

---

## 5. Notion (API de Integração)

**Onde criar:** https://www.notion.so/my-integrations

| Credencial | Onde encontrar |
|------------|----------------|
| `NOTION_TOKEN` | Cada usuário terá o próprio (Internal Integration Token) |

**Passos para criar integração:**
1. Acessar https://www.notion.so/my-integrations
2. Criar nova integração
3. Dar um nome (ex: "AIJP - Assistente Jurídico")
4. Selecionar workspace
5. Copiar o "Internal Integration Token"

**Passos para cada usuário:**
1. Usuário cria sua própria integração OU
2. Você cria uma integração pública (OAuth) - mais complexo
3. Usuário compartilha a database com a integração
4. Usuário fornece o `database_id` da database que quer usar

**Observações:**
- Cada usuário precisa compartilhar sua database com a integração
- O `database_id` está na URL da database do Notion

---

## 6. Servidor/Hospedagem

**Opções recomendadas:**

| Plataforma | Tipo | Custo |
|------------|------|-------|
| Railway | Servidor | ~$5/mês |
| Render | Servidor | Gratuito até certo ponto |
| Vercel | Serverless | Gratuito até certo ponto |
| DigitalOcean | VPS | ~$5/mês |

**Requisitos:**
- HTTPS obrigatório (para webhook do WhatsApp)
- Domínio ou subdomínio
- Suporte a Node.js

---

## 7. Domínio (Opcional mas Recomendado)

**Onde comprar:** Cloudflare, Namecheap, GoDaddy, Registro.br

| Configuração | Uso |
|--------------|-----|
| Domínio principal | URL do webhook |
| SSL/TLS | Obrigatório para WhatsApp |

---

## Resumo: Arquivo .env

```env
# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# OpenAI
OPENAI_API_KEY=sk-...

# WhatsApp
WHATSAPP_TOKEN=EAAG...
WHATSAPP_PHONE_NUMBER_ID=123456789
WHATSAPP_BUSINESS_ACCOUNT_ID=987654321
WHATSAPP_VERIFY_TOKEN=meu_token_secreto_123
WHATSAPP_APP_SECRET=seu_app_secret

# Criptografia
ENCRYPTION_KEY=chave_de_32_caracteres_aqui_ok

# Google OAuth
GOOGLE_CLIENT_ID=123456789-xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
GOOGLE_REDIRECT_URI=https://seudominio.com/auth/google/callback

# App
NODE_ENV=development
PORT=3000
APP_URL=https://seudominio.com
```

---

## Ordem Recomendada para Configurar

1. **Supabase** - Criar primeiro, é o mais rápido
2. **OpenAI** - Simples, só criar conta e gerar key
3. **Google Cloud** - Mais burocrático, começar cedo
4. **Notion** - Simples para integração interna
5. **WhatsApp** - Deixar por último, precisa do webhook online
6. **Hospedagem** - Configurar quando o código estiver pronto

---

## Dúvidas Frequentes

**P: Preciso pagar algo agora?**
R: Supabase, Notion e hospedagem têm planos gratuitos. OpenAI e WhatsApp são pagos por uso.

**P: Posso testar sem WhatsApp Business?**
R: Sim, podemos criar endpoints de teste para simular mensagens.

**P: Preciso de CNPJ para o WhatsApp Business?**
R: Para produção completa, sim. Para testes, não.

**P: O Google vai aprovar meu app?**
R: Em modo teste funciona para até 100 usuários. Verificação completa demora.
