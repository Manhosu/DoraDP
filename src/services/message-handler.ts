import type { WhatsAppMessage, User, ExtractedEvent } from '../types/index.js';
import {
  getUserByWhatsAppNumber,
  createUser,
  logEvent,
  transcribeAudio,
  extractEventFromText,
  classifyMessage,
  sendTextMessage,
  markAsRead,
  downloadMedia,
  sendReaction,
  createCalendarEvent,
  listEventsForDay,
  createNotionPage,
} from '../integrations/index.js';
import {
  formatEventConfirmation,
  formatErrorMessage,
  formatWelcomeMessage,
  formatHelpMessage,
  formatDailyAgenda,
  formatDateRequestMessage,
  formatSetupMessage,
} from '../utils/formatters.js';
import { env } from '../config/env.js';

/**
 * Handler principal para processar mensagens do WhatsApp
 */
export async function handleIncomingMessage(
  message: WhatsAppMessage,
  senderName?: string
): Promise<void> {
  const whatsappNumber = message.from;

  try {
    // Marcar mensagem como lida
    await markAsRead(message.id);

    // Buscar ou criar usuário
    let userResult = await getUserByWhatsAppNumber(whatsappNumber);
    let user: User;
    let isNewUser = false;

    if (!userResult.success || !userResult.data) {
      // Criar novo usuário
      const createResult = await createUser(whatsappNumber, senderName);
      if (!createResult.success || !createResult.data) {
        await sendTextMessage(
          whatsappNumber,
          formatErrorMessage('Erro ao registrar usuário. Tente novamente.')
        );
        return;
      }
      user = createResult.data;
      isNewUser = true;
    } else {
      user = userResult.data;
    }

    // Se for novo usuário ou onboarding não completo
    if (isNewUser || !user.onboarding_completed) {
      // Enviar boas-vindas apenas se for novo usuário
      if (isNewUser) {
        await sendTextMessage(whatsappNumber, formatWelcomeMessage(senderName));
      }

      // Verificar se usuário precisa configurar integrações
      const needsGoogle = !user.google_access_token;
      const needsNotion = !user.notion_token;

      if (needsGoogle || needsNotion) {
        // Enviar links de configuração
        await sendTextMessage(
          whatsappNumber,
          formatSetupMessage(whatsappNumber, env.appUrl)
        );
        return;
      }
    }

    // Obter texto da mensagem (transcrever se for áudio)
    let messageText: string;
    let isAudio = false;

    if (message.type === 'audio' && message.audio) {
      isAudio = true;
      // Enviar reação de processamento
      await sendReaction(whatsappNumber, message.id, '🎧');

      // Baixar e transcrever áudio
      const downloadResult = await downloadMedia(message.audio.id);
      if (!downloadResult.success || !downloadResult.data) {
        await sendTextMessage(
          whatsappNumber,
          formatErrorMessage('Não consegui baixar o áudio. Tente enviar novamente.')
        );
        return;
      }

      const transcriptionResult = await transcribeAudio(
        downloadResult.data,
        message.audio.mime_type
      );
      if (!transcriptionResult.success || !transcriptionResult.data) {
        await sendTextMessage(
          whatsappNumber,
          formatErrorMessage('Não consegui transcrever o áudio. Tente enviar como texto.')
        );
        return;
      }

      messageText = transcriptionResult.data;
    } else if (message.type === 'text' && message.text) {
      messageText = message.text.body;
    } else {
      await sendTextMessage(
        whatsappNumber,
        'Desculpe, só consigo processar mensagens de texto e áudio por enquanto.'
      );
      return;
    }

    // Classificar a mensagem
    const classificationResult = await classifyMessage(messageText);
    if (!classificationResult.success || !classificationResult.data) {
      // Tentar processar como agendamento mesmo assim
      await processScheduling(user, messageText, isAudio, message.id);
      return;
    }

    const { intent, command } = classificationResult.data;

    // Processar baseado na intenção
    switch (intent) {
      case 'ver_agenda':
        await handleViewAgenda(user);
        break;

      case 'ajuda':
        await sendTextMessage(whatsappNumber, formatHelpMessage());
        break;

      case 'saudacao':
        await sendTextMessage(
          whatsappNumber,
          `Olá! 👋 Como posso ajudá-lo hoje?\n\nEnvie uma mensagem descrevendo um compromisso ou digite *ajuda* para ver os comandos.`
        );
        break;

      case 'agendamento':
        await processScheduling(user, messageText, isAudio, message.id);
        break;

      default:
        await sendTextMessage(
          whatsappNumber,
          `Não entendi sua mensagem. 🤔\n\nVocê quis agendar algo? Se sim, inclua detalhes como data e horário.\n\nDigite *ajuda* para ver os comandos disponíveis.`
        );
    }
  } catch (error) {
    console.error('Erro ao processar mensagem:', error);
    await sendTextMessage(
      whatsappNumber,
      formatErrorMessage('Ocorreu um erro inesperado. Por favor, tente novamente.')
    );
  }
}

/**
 * Processa um agendamento
 */
async function processScheduling(
  user: User,
  messageText: string,
  isAudio: boolean,
  messageId: string
): Promise<void> {
  const whatsappNumber = user.whatsapp_number;

  // Verificar se usuário tem as integrações configuradas
  if (!user.google_access_token || !user.google_refresh_token) {
    await sendTextMessage(
      whatsappNumber,
      `⚠️ Você precisa conectar seu Google Calendar primeiro.\n\n🔗 Clique aqui para configurar:\n${env.appUrl}/auth/google?whatsapp=${whatsappNumber}`
    );
    return;
  }

  // Enviar reação de processamento
  await sendReaction(whatsappNumber, messageId, '⏳');

  // Extrair evento do texto
  const extractResult = await extractEventFromText(messageText, user.timezone);

  if (!extractResult.success || !extractResult.data) {
    // IA não conseguiu extrair a data
    await sendTextMessage(whatsappNumber, formatDateRequestMessage());
    return;
  }

  const event = extractResult.data;

  // Criar evento no Google Calendar
  const calendarResult = await createCalendarEvent(
    user.google_access_token,
    user.google_refresh_token,
    user.id,
    event,
    user.timezone
  );

  let googleEventId: string | undefined;
  if (calendarResult.success && calendarResult.data) {
    googleEventId = calendarResult.data.eventId;
  } else {
    console.error('Erro ao criar evento no Calendar:', calendarResult.error);
  }

  // Criar página no Notion (se configurado)
  let notionPageId: string | undefined;
  if (user.notion_token && user.notion_database_id) {
    const notionResult = await createNotionPage(
      user.notion_token,
      user.notion_database_id,
      event
    );

    if (notionResult.success && notionResult.data) {
      notionPageId = notionResult.data.pageId;
    } else {
      console.error('Erro ao criar página no Notion:', notionResult.error);
    }
  }

  // Registrar no log
  await logEvent(user.id, {
    titulo: event.titulo,
    tipo_evento: event.tipo_evento,
    data_inicio: event.data_inicio,
    data_fim: event.data_fim || undefined,
    descricao: event.descricao || undefined,
    google_event_id: googleEventId,
    notion_page_id: notionPageId,
    mensagem_original: messageText,
    foi_audio: isAudio,
    status: googleEventId ? 'synced_google' : 'created',
  });

  // Enviar confirmação
  await sendReaction(whatsappNumber, messageId, '✅');
  await sendTextMessage(whatsappNumber, formatEventConfirmation(event));
}

/**
 * Processa comando de ver agenda
 */
async function handleViewAgenda(user: User): Promise<void> {
  const whatsappNumber = user.whatsapp_number;

  if (!user.google_access_token || !user.google_refresh_token) {
    await sendTextMessage(
      whatsappNumber,
      `⚠️ Você precisa conectar seu Google Calendar primeiro.\n\n🔗 Clique aqui para configurar:\n${env.appUrl}/auth/google?whatsapp=${whatsappNumber}`
    );
    return;
  }

  const today = new Date();
  const eventsResult = await listEventsForDay(
    user.google_access_token,
    user.google_refresh_token,
    user.id,
    today,
    user.timezone
  );

  if (!eventsResult.success) {
    await sendTextMessage(
      whatsappNumber,
      formatErrorMessage('Não consegui buscar sua agenda. Tente novamente.')
    );
    return;
  }

  await sendTextMessage(whatsappNumber, formatDailyAgenda(eventsResult.data || []));
}
