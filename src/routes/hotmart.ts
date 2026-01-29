import { Router, Request, Response } from 'express';
import { getSupabaseAdmin } from '../integrations/supabase.js';
import { sendTextMessage, sendButtonMessage } from '../integrations/whatsapp.js';
import { env } from '../config/env.js';

const router = Router();

// IDs dos produtos na Hotmart (serão configurados via env ou aqui)
const PRODUCT_IDS = {
  DP_EM_ORDEM: process.env.HOTMART_PRODUCT_DP_EM_ORDEM || '', // Bônus 3 meses
  ASSINATURA_DORA: process.env.HOTMART_PRODUCT_ASSINATURA || '', // Assinatura mensal
};

// Tipos de eventos da Hotmart
type HotmartEvent =
  | 'PURCHASE_COMPLETE' // Compra aprovada
  | 'PURCHASE_CANCELED' // Compra cancelada
  | 'PURCHASE_REFUNDED' // Reembolso
  | 'PURCHASE_CHARGEBACK' // Chargeback
  | 'SUBSCRIPTION_CANCELLATION' // Assinatura cancelada
  | 'PURCHASE_DELAYED' // Boleto gerado (aguardando)
  | 'PURCHASE_APPROVED' // Compra aprovada (alternativo)
  | 'PURCHASE_PROTEST' // Protesto
  | 'PURCHASE_EXPIRED'; // Expirado

interface HotmartWebhookPayload {
  event: HotmartEvent;
  data: {
    product: {
      id: number;
      name: string;
    };
    buyer: {
      name: string;
      email: string;
      phone?: string;
      checkout_phone?: string;
    };
    purchase: {
      transaction: string;
      status: string;
    };
    subscription?: {
      status: string;
      plan: {
        name: string;
      };
    };
  };
}

/**
 * POST /webhook/hotmart - Recebe eventos da Hotmart
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const payload = req.body as HotmartWebhookPayload;

    console.log('[Hotmart] Webhook recebido:', {
      event: payload.event,
      product: payload.data?.product?.name,
      buyer: payload.data?.buyer?.email,
    });

    // Responder imediatamente
    res.sendStatus(200);

    // Processar evento
    await processHotmartEvent(payload);
  } catch (error) {
    console.error('[Hotmart] Erro no webhook:', error);
    res.sendStatus(200); // Sempre retornar 200 para não gerar retry
  }
});

/**
 * Processa evento da Hotmart
 */
async function processHotmartEvent(payload: HotmartWebhookPayload): Promise<void> {
  const { event, data } = payload;

  if (!data?.buyer) {
    console.error('[Hotmart] Payload sem dados do comprador');
    return;
  }

  // Extrair telefone (pode vir em phone ou checkout_phone)
  let phone = data.buyer.checkout_phone || data.buyer.phone || '';

  // Limpar telefone (remover caracteres especiais, manter apenas números)
  phone = phone.replace(/\D/g, '');

  // Adicionar código do país se não tiver
  if (phone && !phone.startsWith('55')) {
    phone = '55' + phone;
  }

  if (!phone) {
    console.error('[Hotmart] Comprador sem telefone:', data.buyer.email);
    return;
  }

  const productId = data.product.id.toString();
  const productName = data.product.name;
  const buyerName = data.buyer.name;
  const buyerEmail = data.buyer.email;

  console.log(`[Hotmart] Processando ${event} para ${phone} - Produto: ${productName}`);

  switch (event) {
    case 'PURCHASE_COMPLETE':
    case 'PURCHASE_APPROVED':
      await handlePurchaseApproved(phone, productId, productName, buyerName, buyerEmail);
      break;

    case 'PURCHASE_CANCELED':
    case 'PURCHASE_REFUNDED':
    case 'PURCHASE_CHARGEBACK':
    case 'SUBSCRIPTION_CANCELLATION':
      await handleSubscriptionCanceled(phone, productName);
      break;

    case 'PURCHASE_EXPIRED':
      await handleSubscriptionExpired(phone, productName);
      break;

    default:
      console.log(`[Hotmart] Evento ${event} ignorado`);
  }
}

/**
 * Processa compra aprovada
 */
async function handlePurchaseApproved(
  phone: string,
  productId: string,
  productName: string,
  buyerName: string,
  buyerEmail: string
): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Verificar se é o produto bônus (3 meses) ou assinatura
  const isBonus = productId === PRODUCT_IDS.DP_EM_ORDEM ||
                  productName.toLowerCase().includes('dp em ordem');

  // Calcular data de expiração
  let expiresAt: Date | null = null;
  let subscriptionStatus: string;

  if (isBonus) {
    // Bônus: 3 meses de acesso
    expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 3);
    subscriptionStatus = 'trial';
  } else {
    // Assinatura: acesso contínuo enquanto ativa
    subscriptionStatus = 'active';
  }

  // Buscar ou criar usuário
  let { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('whatsapp_number', phone)
    .single();

  if (user) {
    // Atualizar usuário existente
    await supabase
      .from('users')
      .update({
        subscription_status: subscriptionStatus,
        subscription_expires_at: expiresAt?.toISOString() || null,
        hotmart_product_id: productId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);
  } else {
    // Criar novo usuário
    const { data: newUser } = await supabase
      .from('users')
      .insert({
        whatsapp_number: phone,
        name: buyerName,
        email: buyerEmail,
        subscription_status: subscriptionStatus,
        subscription_expires_at: expiresAt?.toISOString() || null,
        hotmart_product_id: productId,
      })
      .select()
      .single();

    user = newUser;
  }

  // Enviar mensagem de boas-vindas
  const expiresText = expiresAt
    ? `\n\n_Seu acesso é válido até ${expiresAt.toLocaleDateString('pt-BR')}_`
    : '';

  await sendTextMessage(
    phone,
    `🎉 *Bem-vindo(a) à Dora, ${buyerName.split(' ')[0]}!*\n\n` +
    `Seu acesso foi liberado com sucesso! Agora você pode usar a Dora para organizar seus compromissos de Departamento Pessoal.\n\n` +
    `Para começar, conecte seu Google Calendar clicando no botão abaixo.${expiresText}`
  );

  // Enviar botão de conexão do Google
  await sendButtonMessage(
    phone,
    '📅 Conectar Agenda',
    'Clique para conectar seu Google Calendar:',
    [{ text: 'Conectar Google', url: `${env.appUrl}/g/${phone}` }]
  );

  console.log(`[Hotmart] Acesso liberado para ${phone} - Status: ${subscriptionStatus}`);
}

/**
 * Processa cancelamento de assinatura
 */
async function handleSubscriptionCanceled(phone: string, productName: string): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Atualizar status para bloqueado
  const { data: user } = await supabase
    .from('users')
    .update({
      subscription_status: 'canceled',
      updated_at: new Date().toISOString(),
    })
    .eq('whatsapp_number', phone)
    .select()
    .single();

  if (!user) {
    console.log(`[Hotmart] Usuário não encontrado para cancelamento: ${phone}`);
    return;
  }

  // Enviar mensagem informando o cancelamento
  await sendTextMessage(
    phone,
    `😢 *Que pena que você está saindo!*\n\n` +
    `Seu acesso à Dora foi cancelado.\n\n` +
    `Se mudar de ideia, estamos aqui! Você pode renovar a qualquer momento.`
  );

  // Enviar botão para renovar
  if (process.env.HOTMART_CHECKOUT_URL) {
    await sendButtonMessage(
      phone,
      '💜 Volte quando quiser',
      'Clique para renovar seu acesso:',
      [{ text: 'Renovar Acesso', url: process.env.HOTMART_CHECKOUT_URL }]
    );
  }

  console.log(`[Hotmart] Acesso cancelado para ${phone}`);
}

/**
 * Processa expiração de acesso
 */
async function handleSubscriptionExpired(phone: string, productName: string): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Atualizar status para expirado
  const { data: user } = await supabase
    .from('users')
    .update({
      subscription_status: 'expired',
      updated_at: new Date().toISOString(),
    })
    .eq('whatsapp_number', phone)
    .select()
    .single();

  if (!user) {
    console.log(`[Hotmart] Usuário não encontrado para expiração: ${phone}`);
    return;
  }

  // Enviar mensagem de expiração com oferta
  await sendTextMessage(
    phone,
    `⏰ *Seu período de teste expirou!*\n\n` +
    `Esperamos que você tenha gostado da Dora!\n\n` +
    `Para continuar organizando seus compromissos de DP, assine agora e tenha acesso ilimitado.`
  );

  // Enviar botão para assinar
  if (process.env.HOTMART_CHECKOUT_URL) {
    await sendButtonMessage(
      phone,
      '🚀 Continue com a Dora',
      'Assine agora e não perca seus agendamentos:',
      [{ text: 'Assinar Agora', url: process.env.HOTMART_CHECKOUT_URL }]
    );
  }

  console.log(`[Hotmart] Acesso expirado para ${phone}`);
}

export default router;
