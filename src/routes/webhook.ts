import { Router, Request, Response } from 'express';
import { verifyWebhook } from '../integrations/whatsapp.js';
import { handleIncomingMessage } from '../services/message-handler.js';
import {
  whatsappSignatureMiddleware,
  rateLimitMiddleware,
  checkWhatsAppRateLimit,
} from '../utils/security.js';
import type { WhatsAppWebhookPayload } from '../types/index.js';

const router = Router();

// Aplicar middlewares de segurança
router.use(rateLimitMiddleware);
router.use(whatsappSignatureMiddleware);

/**
 * GET /webhook - Verificação do webhook do WhatsApp
 */
router.get('/', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'] as string | undefined;
  const token = req.query['hub.verify_token'] as string | undefined;
  const challenge = req.query['hub.challenge'] as string | undefined;

  console.log('Webhook verification request:', { mode, token: token ? '***' : undefined });

  const verification = verifyWebhook(mode, token, challenge);

  if (verification.valid) {
    console.log('Webhook verified successfully');
    res.status(200).send(verification.challenge);
  } else {
    console.log('Webhook verification failed');
    res.sendStatus(403);
  }
});

/**
 * POST /webhook - Recebe mensagens do WhatsApp
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const payload = req.body as WhatsAppWebhookPayload;

    // Responder imediatamente para evitar timeout
    res.sendStatus(200);

    // Verificar se é uma notificação válida
    if (payload.object !== 'whatsapp_business_account') {
      console.log('Payload ignorado: não é whatsapp_business_account');
      return;
    }

    // Processar cada entrada
    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        // Ignorar notificações de status (mensagem entregue, lida, etc.)
        if (change.value.statuses) {
          continue;
        }

        const messages = change.value.messages;
        const contacts = change.value.contacts;

        if (!messages || messages.length === 0) {
          continue;
        }

        // Processar cada mensagem
        for (const message of messages) {
          // Rate limit por número de WhatsApp
          if (!checkWhatsAppRateLimit(message.from)) {
            console.warn(`Rate limit excedido para WhatsApp: ${message.from}`);
            continue;
          }

          // Obter nome do contato se disponível
          const contact = contacts?.find((c) => c.wa_id === message.from);
          const senderName = contact?.profile?.name;

          console.log(`Nova mensagem de ${message.from}:`, {
            type: message.type,
            id: message.id,
            senderName,
          });

          // Processar mensagem de forma assíncrona
          handleIncomingMessage(message, senderName).catch((error) => {
            console.error('Erro ao processar mensagem:', error);
          });
        }
      }
    }
  } catch (error) {
    console.error('Erro no webhook:', error);
    // Já respondemos 200, então apenas logamos o erro
  }
});

export default router;
