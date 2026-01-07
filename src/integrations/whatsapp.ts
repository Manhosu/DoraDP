import axios from 'axios';
import { env } from '../config/env.js';
import type { ServiceResponse } from '../types/index.js';

const WHATSAPP_API_URL = 'https://graph.facebook.com/v18.0';

/**
 * Envia uma mensagem de texto via WhatsApp
 */
export async function sendTextMessage(
  to: string,
  message: string
): Promise<ServiceResponse<{ messageId: string }>> {
  try {
    const response = await axios.post(
      `${WHATSAPP_API_URL}/${env.whatsappPhoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'text',
        text: {
          preview_url: false,
          body: message,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${env.whatsappToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return {
      success: true,
      data: { messageId: response.data.messages[0].id },
    };
  } catch (error) {
    console.error('Erro ao enviar mensagem WhatsApp:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro ao enviar mensagem',
    };
  }
}

/**
 * Marca uma mensagem como lida
 */
export async function markAsRead(messageId: string): Promise<ServiceResponse<void>> {
  try {
    await axios.post(
      `${WHATSAPP_API_URL}/${env.whatsappPhoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      },
      {
        headers: {
          Authorization: `Bearer ${env.whatsappToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return { success: true };
  } catch (error) {
    console.error('Erro ao marcar mensagem como lida:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro ao marcar como lida',
    };
  }
}

/**
 * Faz download de um arquivo de mídia do WhatsApp
 */
export async function downloadMedia(mediaId: string): Promise<ServiceResponse<Buffer>> {
  try {
    // Primeiro, obter a URL do arquivo
    const mediaInfo = await axios.get(`${WHATSAPP_API_URL}/${mediaId}`, {
      headers: {
        Authorization: `Bearer ${env.whatsappToken}`,
      },
    });

    const mediaUrl = mediaInfo.data.url;

    // Fazer download do arquivo
    const mediaResponse = await axios.get(mediaUrl, {
      headers: {
        Authorization: `Bearer ${env.whatsappToken}`,
      },
      responseType: 'arraybuffer',
    });

    return {
      success: true,
      data: Buffer.from(mediaResponse.data),
    };
  } catch (error) {
    console.error('Erro ao baixar mídia:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro ao baixar mídia',
    };
  }
}

/**
 * Envia uma reação a uma mensagem
 */
export async function sendReaction(
  to: string,
  messageId: string,
  emoji: string
): Promise<ServiceResponse<void>> {
  try {
    await axios.post(
      `${WHATSAPP_API_URL}/${env.whatsappPhoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'reaction',
        reaction: {
          message_id: messageId,
          emoji: emoji,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${env.whatsappToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return { success: true };
  } catch (error) {
    console.error('Erro ao enviar reação:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro ao enviar reação',
    };
  }
}

/**
 * Valida o webhook do WhatsApp (challenge)
 */
export function verifyWebhook(
  mode: string | undefined,
  token: string | undefined,
  challenge: string | undefined
): { valid: boolean; challenge?: string } {
  if (mode === 'subscribe' && token === env.whatsappVerifyToken) {
    return { valid: true, challenge: challenge };
  }
  return { valid: false };
}
