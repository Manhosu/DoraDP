# Projeto: Assistente de Inteligência Jurídica e Prazos (AIJP)

## 1. Visão Geral
Sistema de automação para **Departamento Pessoal** que utiliza IA para converter mensagens de voz e texto do WhatsApp em registros estruturados no Google Calendar e Notion. O sistema é desenhado para profissionais de DP/RH, permitindo controle de prazos trabalhistas como folha de pagamento, férias, rescisões, etc.

## 2. Arquitetura Técnica
- **Runtime:** Node.js / TypeScript
- **IA:** OpenAI (Whisper para áudio + GPT-4o para extração de entidades)
- **Banco de Dados:** Supabase (PostgreSQL) para gestão de usuários e tokens
- **Integrações:** - WhatsApp Business API (via Webhook)
  - Google Calendar API (OAuth2)
  - Notion API (Internal Integration Tokens)
- **Infraestrutura:** Edge Functions ou servidor Express/Fastify

## 3. Estrutura de Dados (Supabase)
### Tabela `users`
- `id`: UUID (Primary Key)
- `whatsapp_number`: String (Unique) - Identificador único do usuário
- `full_name`: String
- `google_access_token`: String (Encrypted)
- `google_refresh_token`: String (Encrypted)
- `notion_token`: String (Encrypted)
- `notion_database_id`: String
- `timezone`: String (Default: 'America/Sao_Paulo')
- `created_at`: Timestamp

## 4. Fluxo de Execução (Pipeline)
1. **Entrada:** Webhook recebe payload do WhatsApp (Texto ou Áudio).
2. **Identificação:** Sistema busca no Supabase o usuário dono daquele `from_number`.
3. **Processamento de Áudio:** Se for áudio, processa via OpenAI Whisper.
4. **Extração de Entidades (LLM):**
   - Entrada: Texto transcrito + Data/Hora Atual.
   - Saída: JSON estruturado com `titulo`, `data_inicio`, `data_fim`, `descricao`, `tipo_evento` (audiência, reunião, prazo).
5. **Execução de Integrações:**
   - Cria evento no Google Calendar do usuário.
   - Cria página/item na Database do Notion do usuário.
6. **Confirmação:** Envia mensagem de sucesso via WhatsApp com resumo do agendamento.

## 5. Requisitos Funcionais (Escopo de Desenvolvimento)
- [x] **Módulo Auth:** Implementar fluxo de troca de Code por Refresh Token para Google OAuth2.
- [x] **Módulo WhatsApp:** Handler para receber mensagens e baixar arquivos de mídia (.ogg).
- [x] **Módulo IA:** Prompt system para extração de datas relativas (ex: "amanhã", "sexta que vem às 10h") considerando o timezone do usuário.
- [x] **Módulo Notion:** Função para `pages.create` utilizando o schema da database do cliente.
- [x] **Módulo Calendar:** Função para `events.insert` com tratamento de tokens expirados.
- [x] **Módulo de Consulta:** Comando "Ver agenda de hoje" que retorna os eventos do dia.

## 6. Regras de Negócio
- **Privacidade:** Um usuário JAMAIS pode ver ou gravar dados em tokens de outro `whatsapp_number`.
- **Tratamento de Erros:** Se a IA não identificar uma data, o sistema deve responder solicitando a data específica.
- **Formatação:** As respostas no WhatsApp devem usar emojis e negritos para facilitar a leitura rápida.

## 6.1 Integração Notion - Template "lista de tarefas - DP"

### Database Utilizada
- **Nome:** lista de tarefas - DP
- **ID:** `544b6c73-476a-429b-bdb2-c1edc1f2bd85`
- **Token:** Configurado por usuário via endpoint `/admin/users/:whatsapp/notion`

### Mapeamento de Colunas

| Coluna Notion | Tipo | Campo Extraído pela IA |
|---------------|------|------------------------|
| **Tarefa** | Title | Título do compromisso |
| **PRAZO** | Date | Data/hora do evento |
| **EMPRESA** | Text | Nome da empresa mencionada |
| **OBSERVAÇÕES** | Text | Descrição/detalhes extras |
| **Status** | Select | "a fazer" (padrão) |

### Status Disponíveis
- 🔴 `a fazer` - Tarefa pendente (padrão)
- 🟡 `em andamento` - Em execução
- 🟢 `concluído` - Finalizada
- 🟣 `revisar` - Precisa revisão
- ⚪ `Não iniciada` - Ainda não começou

### Exemplo de Uso

**Mensagem WhatsApp:**
> "Folha de pagamento empresa Eduardo G dia 30/12"

**Registro criado no Notion:**

| Tarefa | PRAZO | EMPRESA | Status |
|--------|-------|---------|--------|
| Folha de pagamento | 30/12/2026 | Eduardo G | a fazer |

**Evento criado no Google Calendar:**
- Título: Folha de pagamento - Eduardo G
- Data: 30/12/2026
- Descrição: Prazo de DP

## 7. Como Executar

### Pré-requisitos
- Node.js 18+
- Conta Supabase (banco de dados)
- Conta OpenAI (API para Whisper e GPT-4o)
- WhatsApp Business API configurado
- Google Cloud Console (OAuth2 para Calendar)

### Instalação
```bash
npm install
cp .env.example .env
# Preencher variáveis no .env
```

### Desenvolvimento
```bash
npm run dev
```

### Produção
```bash
npm run build
node dist/index.js
```

### Endpoints Disponíveis
| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/health` | GET | Health check |
| `/webhook` | GET/POST | Webhook WhatsApp |
| `/auth/google` | GET | Iniciar OAuth Google |
| `/auth/google/callback` | GET | Callback OAuth |
| `/admin/users` | POST | Criar usuário |
| `/admin/users/:whatsapp` | GET | Buscar usuário |
| `/admin/users/:whatsapp/google-auth-url` | GET | Gerar URL OAuth |
| `/admin/users/:whatsapp/notion` | POST | Configurar Notion |
| `/test/*` | * | Endpoints de teste (dev only) |

## 8. Status do Projeto

✅ **100% Implementado e Funcional**

| Módulo | Status |
|--------|--------|
| Servidor Express | ✅ Funcionando |
| Banco de Dados (Supabase) | ✅ Tabelas criadas |
| WhatsApp Webhook | ✅ Implementado |
| Google OAuth2 | ✅ Implementado |
| Google Calendar | ✅ Implementado |
| Notion API | ✅ Implementado |
| OpenAI (Whisper + GPT-4o) | ✅ Implementado |
| Criptografia de Tokens | ✅ AES-256-GCM |
| Rate Limiting | ✅ Implementado |
| Rotas Admin | ✅ Implementado |

### Pendente para Produção
- [ ] Configurar webhook URL no WhatsApp (após deploy)
- [ ] Deploy em plataforma (Vercel, Railway, etc.)
- [ ] Adicionar créditos na conta OpenAI