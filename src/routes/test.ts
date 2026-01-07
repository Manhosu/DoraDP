import { Router, Request, Response } from 'express';
import { handleIncomingMessage } from '../services/message-handler.js';
import { extractEventFromText, classifyMessage, transcribeAudio } from '../integrations/openai.js';
import { env } from '../config/env.js';
import type { WhatsAppMessage } from '../types/index.js';

const router = Router();

// Apenas disponível em desenvolvimento
router.use((req: Request, res: Response, next) => {
  if (env.nodeEnv !== 'development') {
    res.status(403).json({ error: 'Rotas de teste só disponíveis em desenvolvimento' });
    return;
  }
  next();
});

/**
 * POST /test/message - Simula uma mensagem do WhatsApp
 * Útil para testar o sistema sem precisar do WhatsApp Business
 */
router.post('/message', async (req: Request, res: Response) => {
  const { from, text, sender_name } = req.body;

  if (!from || !text) {
    res.status(400).json({ error: 'Campos "from" e "text" são obrigatórios' });
    return;
  }

  // Criar mensagem fake do WhatsApp
  const fakeMessage: WhatsAppMessage = {
    from: from,
    id: `test_${Date.now()}`,
    timestamp: String(Math.floor(Date.now() / 1000)),
    type: 'text',
    text: {
      body: text,
    },
  };

  try {
    // Processar a mensagem (não vai enviar WhatsApp de verdade se não tiver token válido)
    await handleIncomingMessage(fakeMessage, sender_name);

    res.json({
      success: true,
      message: 'Mensagem processada. Verifique os logs do servidor.',
      simulated_message: fakeMessage,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro ao processar mensagem',
    });
  }
});

/**
 * POST /test/extract - Testa apenas a extração de eventos pela IA
 * Não salva nada, apenas retorna o que a IA extraiu
 */
router.post('/extract', async (req: Request, res: Response) => {
  const { text, timezone } = req.body;

  if (!text) {
    res.status(400).json({ error: 'Campo "text" é obrigatório' });
    return;
  }

  const result = await extractEventFromText(text, timezone || 'America/Sao_Paulo');

  res.json({
    success: result.success,
    extracted_event: result.data,
    error: result.error,
  });
});

/**
 * POST /test/classify - Testa a classificação de mensagens
 */
router.post('/classify', async (req: Request, res: Response) => {
  const { text } = req.body;

  if (!text) {
    res.status(400).json({ error: 'Campo "text" é obrigatório' });
    return;
  }

  const result = await classifyMessage(text);

  res.json({
    success: result.success,
    classification: result.data,
    error: result.error,
  });
});

/**
 * GET /test/env - Verifica quais variáveis de ambiente estão configuradas
 * (não mostra os valores, apenas se estão definidas)
 */
router.get('/env', (_req: Request, res: Response) => {
  res.json({
    configured: {
      supabase: {
        url: !!env.supabaseUrl,
        anon_key: !!env.supabaseAnonKey,
        service_role_key: !!env.supabaseServiceRoleKey,
      },
      openai: {
        api_key: !!env.openaiApiKey,
      },
      whatsapp: {
        token: !!env.whatsappToken,
        phone_number_id: !!env.whatsappPhoneNumberId,
        business_account_id: !!env.whatsappBusinessAccountId,
        verify_token: !!env.whatsappVerifyToken,
        app_secret: !!env.whatsappAppSecret,
      },
      google: {
        client_id: !!env.googleClientId,
        client_secret: !!env.googleClientSecret,
        redirect_uri: !!env.googleRedirectUri,
      },
      encryption: {
        key: !!env.encryptionKey,
      },
    },
    environment: env.nodeEnv,
    port: env.port,
    app_url: env.appUrl,
  });
});

export default router;
