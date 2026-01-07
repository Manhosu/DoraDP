# Checklist Completo de Desenvolvimento - AIJP

## Fase 1: Configuração do Ambiente ✅ CONCLUÍDA

- [x] Inicializar projeto Node.js com TypeScript
- [x] Configurar `tsconfig.json`
- [x] Configurar ESLint e Prettier
- [x] Criar estrutura de pastas do projeto
- [x] Criar arquivo `.env.example` com todas as variáveis necessárias
- [x] Configurar `.gitignore`
- [x] Instalar dependências principais (express, openai, googleapis, @notionhq/client, @supabase/supabase-js)

---

## Fase 2: Banco de Dados (Supabase) ⏳ AGUARDANDO CREDENCIAIS

- [ ] Criar projeto no Supabase
- [x] Criar SQL para tabela `users` com todos os campos especificados (`supabase/001_create_users_table.sql`)
- [x] Criar SQL para tabela `events_log` (`supabase/002_create_events_log_table.sql`)
- [x] Configurar Row Level Security (RLS) no SQL
- [x] Criar índices para performance
- [ ] Executar migrations no Supabase (após ter credenciais)
- [ ] Testar conexão do cliente Supabase

---

## Fase 3: Módulo de Autenticação Google OAuth2 ✅ CÓDIGO PRONTO

- [x] Criar rota `/auth/google` para iniciar fluxo OAuth
- [x] Criar rota `/auth/google/callback` para receber o code
- [x] Implementar troca de code por access_token e refresh_token
- [x] Implementar função para refresh automático de tokens expirados
- [x] Salvar tokens criptografados no Supabase
- [ ] Testar fluxo completo de autenticação (após ter credenciais)

---

## Fase 4: Módulo WhatsApp ✅ CÓDIGO PRONTO

- [x] Configurar webhook para receber mensagens do WhatsApp Business API
- [x] Implementar verificação de webhook (challenge)
- [x] Criar handler para mensagens de texto
- [x] Criar handler para mensagens de áudio
- [x] Implementar download de arquivos de mídia (.ogg)
- [x] Implementar função para enviar mensagens de resposta
- [x] Implementar formatação de mensagens (emojis, negrito)
- [ ] Testar recebimento e envio de mensagens (após ter credenciais)

---

## Fase 5: Módulo de IA (OpenAI) ✅ CÓDIGO PRONTO

- [x] Configurar cliente OpenAI
- [x] Implementar transcrição de áudio com Whisper
- [x] Criar prompt system para extração de entidades jurídicas
- [x] Implementar parsing de datas relativas ("amanhã", "próxima segunda", etc.)
- [x] Implementar suporte a timezone do usuário
- [x] Criar schema JSON de saída (titulo, data_inicio, data_fim, descricao, tipo_evento)
- [x] Implementar validação da resposta da IA
- [x] Implementar fallback quando IA não consegue extrair data
- [ ] Testar com diversos formatos de mensagem (após ter credenciais)

---

## Fase 6: Módulo Google Calendar ✅ CÓDIGO PRONTO

- [x] Configurar cliente Google Calendar API
- [x] Implementar função `events.insert` para criar eventos
- [x] Implementar tratamento de tokens expirados (refresh automático)
- [x] Implementar função `events.list` para listar eventos do dia
- [x] Formatar dados do evento conforme API do Google
- [ ] Testar criação e listagem de eventos (após ter credenciais)

---

## Fase 7: Módulo Notion ✅ CÓDIGO PRONTO

- [x] Configurar cliente Notion API
- [x] Implementar função `pages.create` para criar itens
- [x] Mapear campos extraídos pela IA para propriedades do Notion
- [x] Implementar suporte a diferentes schemas de database
- [ ] Testar criação de páginas (após ter credenciais)

---

## Fase 8: Lógica Principal (Orquestrador) ✅ CÓDIGO PRONTO

- [x] Criar roteador principal de mensagens recebidas
- [x] Implementar identificação de usuário por `whatsapp_number`
- [x] Implementar fluxo de onboarding para novos usuários
- [x] Implementar pipeline completo: Receber → Transcrever → Extrair → Salvar → Confirmar
- [x] Implementar comando "Ver agenda de hoje"
- [x] Implementar tratamento de erros global
- [x] Implementar logs de auditoria (tabela events_log)

---

## Fase 9: Tratamento de Erros e Edge Cases ✅ CÓDIGO PRONTO

- [x] Usuário não cadastrado envia mensagem (cria automaticamente)
- [x] Token do Google expirado e refresh (listener automático)
- [x] Token do Notion inválido (tratamento de erro)
- [x] IA não consegue extrair data/hora (solicita esclarecimento)
- [x] IA não consegue identificar tipo de evento (usa 'outro')
- [x] Áudio corrompido ou formato não suportado (mensagem de erro)
- [x] Timeout nas APIs externas (tratamento de erro)
- [x] Rate limiting das APIs

---

## Fase 10: Segurança ✅ CÓDIGO PRONTO

- [x] Validar assinatura do webhook do WhatsApp (HMAC SHA256)
- [x] Criptografar todos os tokens no banco de dados (AES-256-GCM)
- [x] Implementar rate limiting no webhook (por IP e por número WhatsApp)
- [x] Sanitizar inputs antes de enviar para IA
- [ ] Configurar HTTPS (responsabilidade do deploy)
- [x] Configurar RLS no Supabase (no SQL)

---

## Fase 11: Deploy e Infraestrutura ⏳ AGUARDANDO

- [ ] Escolher plataforma de deploy (Vercel, Railway, Render, etc.)
- [ ] Configurar variáveis de ambiente em produção
- [ ] Configurar domínio para webhook
- [ ] Configurar SSL/TLS
- [ ] Configurar logs e monitoramento
- [ ] Testar fluxo completo em produção

---

## Fase 12: Testes e Validação ⏳ AGUARDANDO CREDENCIAIS

- [ ] Testar fluxo completo com mensagem de texto
- [ ] Testar fluxo completo com mensagem de áudio
- [ ] Testar comando de consulta de agenda
- [ ] Testar com múltiplos usuários simultaneamente
- [ ] Validar isolamento de dados entre usuários
- [ ] Testar cenários de erro

---

## Fase 13: Administração e Ferramentas ✅ CÓDIGO PRONTO (NOVA)

- [x] Criar rotas de administração (`/admin/*`)
- [x] Endpoint para cadastrar usuários manualmente
- [x] Endpoint para gerar URL de auth Google por usuário
- [x] Endpoint para configurar Notion por usuário
- [x] Endpoint para listar databases do Notion
- [x] Criar rotas de teste (`/test/*` - apenas em dev)
- [x] Endpoint para simular mensagens do WhatsApp
- [x] Endpoint para testar extração de eventos pela IA
- [x] Endpoint para testar classificação de mensagens
- [x] Endpoint para verificar variáveis de ambiente configuradas
- [x] Adicionar logging de requisições

---

## Extras (Futuro)

- [ ] Dashboard web para usuários
- [ ] Notificações de lembretes
- [ ] Suporte a cancelamento/edição de eventos
- [ ] Integração com outros calendários (Outlook)
- [ ] Relatórios de uso

---

## Resumo do Progresso

| Fase | Status |
|------|--------|
| 1. Configuração do Ambiente | ✅ Concluída |
| 2. Banco de Dados | ⏳ SQL pronto, aguardando Supabase |
| 3. Auth Google OAuth2 | ✅ Código pronto |
| 4. Módulo WhatsApp | ✅ Código pronto |
| 5. Módulo IA (OpenAI) | ✅ Código pronto |
| 6. Módulo Google Calendar | ✅ Código pronto |
| 7. Módulo Notion | ✅ Código pronto |
| 8. Orquestrador | ✅ Código pronto |
| 9. Tratamento de Erros | ✅ Código pronto |
| 10. Segurança | ✅ Código pronto |
| 11. Deploy | ⏳ Aguardando |
| 12. Testes | ⏳ Aguardando credenciais |
| 13. Admin/Ferramentas | ✅ Código pronto |

**Status Geral:** 🟢 **100% do código implementado** - Aguardando apenas credenciais para testes e deploy.

---

## Estrutura Final do Projeto

```
src/
├── config/
│   └── env.ts                    # Configuração de ambiente
├── integrations/
│   ├── index.ts                  # Re-exportações
│   ├── supabase.ts               # CRUD usuários + logs
│   ├── openai.ts                 # Whisper + GPT-4o
│   ├── whatsapp.ts               # API WhatsApp
│   ├── google-calendar.ts        # OAuth + Calendar
│   └── notion.ts                 # API Notion
├── routes/
│   ├── index.ts                  # Re-exportações
│   ├── webhook.ts                # Webhook WhatsApp
│   ├── auth.ts                   # OAuth Google
│   ├── admin.ts                  # Administração
│   └── test.ts                   # Testes (dev only)
├── services/
│   └── message-handler.ts        # Orquestrador
├── types/
│   └── index.ts                  # Tipos TypeScript
├── utils/
│   ├── crypto.ts                 # Criptografia AES-256
│   ├── formatters.ts             # Formatação mensagens
│   └── security.ts               # Validação + Rate limit
└── index.ts                      # Servidor Express
```

**Próximos passos:** Configurar credenciais externas e testar o sistema.
