import type { WhatsAppMessage, User, ExtractedEvent } from '../types/index.js';
import {
  getUserByWhatsAppNumber,
  createUser,
  logEvent,
  createReminder,
  getUserRecentEvents,
  deleteRemindersByGoogleEventId,
  updateReminderByGoogleEventId,
  transcribeAudio,
  extractEventFromText,
  classifyMessage,
  identifyEventToModify,
  sendTextMessage,
  sendButtonMessage,
  markAsRead,
  downloadMedia,
  sendReaction,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  listEventsForDay,
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

      // Verificar se usuário precisa configurar Google Calendar
      const needsGoogle = !user.google_access_token;

      if (needsGoogle) {
        await sendButtonMessage(
          whatsappNumber,
          '📅 Google Calendar',
          'Clique no botão abaixo para conectar seu Google Calendar:',
          [{ text: 'Conectar Google', url: `${env.appUrl}/g/${whatsappNumber}` }]
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
    const classificationResult = await classifyMessage(messageText, user.timezone);
    if (!classificationResult.success || !classificationResult.data) {
      // Tentar processar como agendamento mesmo assim
      await processScheduling(user, messageText, isAudio, message.id);
      return;
    }

    const { intent, target_date } = classificationResult.data;

    // Processar baseado na intenção
    switch (intent) {
      case 'ver_agenda':
        // Se tiver uma data específica, usa ela; senão, usa hoje
        const targetDateObj = target_date ? new Date(target_date + 'T12:00:00') : undefined;
        await handleViewAgenda(user, targetDateObj);
        break;

      case 'ajuda':
        await sendTextMessage(whatsappNumber, formatHelpMessage());
        break;

      case 'saudacao':
        await sendTextMessage(
          whatsappNumber,
          `Olá! 👋 Como posso ajudá-lo hoje?\n\nEnvie uma mensagem descrevendo um compromisso de DP ou digite *ajuda* para ver os comandos.`
        );
        break;

      case 'fora_do_escopo':
        await sendTextMessage(
          whatsappNumber,
          `❌ *Desculpe, só posso ajudar com assuntos de Departamento Pessoal.*\n\n` +
          `Exemplos do que posso agendar:\n` +
          `• Folha de pagamento, 13º, adiantamento\n` +
          `• Férias, rescisão, admissão\n` +
          `• FGTS, INSS, eSocial, DCTFWeb\n` +
          `• Audiências trabalhistas\n` +
          `• Reuniões de trabalho\n\n` +
          `Como posso ajudá-lo com DP?`
        );
        break;

      case 'agendamento':
        await processScheduling(user, messageText, isAudio, message.id);
        break;

      case 'alterar':
        await handleAlterarEvento(user, messageText, message.id);
        break;

      case 'cancelar':
        await handleCancelarEvento(user, messageText, message.id);
        break;

      default:
        // Para qualquer outra intenção, tentar processar como agendamento
        // Se a extração de evento funcionar, é agendamento
        // Se não funcionar, a função processScheduling já envia mensagem de erro apropriada
        await processScheduling(user, messageText, isAudio, message.id);
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

  // Registrar no log
  const logResult = await logEvent(user.id, {
    titulo: event.titulo,
    tipo_evento: event.tipo_evento,
    data_inicio: event.data_inicio,
    data_fim: event.data_fim || undefined,
    descricao: event.descricao || undefined,
    google_event_id: googleEventId,
    mensagem_original: messageText,
    foi_audio: isAudio,
    status: googleEventId ? 'synced_google' : 'created',
  });

  // Criar lembrete (apenas para eventos com horário específico, não all-day)
  if (googleEventId && !event.all_day) {
    const eventDateTime = new Date(event.data_inicio);
    const reminderTime = new Date(eventDateTime.getTime() - 10 * 60 * 1000); // 10 minutos antes

    // Só criar lembrete se ainda der tempo (evento é no futuro)
    if (reminderTime > new Date()) {
      await createReminder({
        user_id: user.id,
        event_log_id: logResult.data?.id,
        google_event_id: googleEventId,
        event_title: event.titulo,
        event_datetime: event.data_inicio,
        reminder_time: reminderTime.toISOString(),
      });
    }
  }

  // Enviar confirmação
  await sendReaction(whatsappNumber, messageId, '✅');
  await sendTextMessage(whatsappNumber, formatEventConfirmation(event));
}

/**
 * Processa comando de ver agenda
 */
async function handleViewAgenda(user: User, targetDate?: Date): Promise<void> {
  const whatsappNumber = user.whatsapp_number;

  if (!user.google_access_token || !user.google_refresh_token) {
    await sendTextMessage(
      whatsappNumber,
      `⚠️ Você precisa conectar seu Google Calendar primeiro.\n\n🔗 Clique aqui para configurar:\n${env.appUrl}/auth/google?whatsapp=${whatsappNumber}`
    );
    return;
  }

  const dateToQuery = targetDate || new Date();
  const eventsResult = await listEventsForDay(
    user.google_access_token,
    user.google_refresh_token,
    user.id,
    dateToQuery,
    user.timezone
  );

  if (!eventsResult.success) {
    await sendTextMessage(
      whatsappNumber,
      formatErrorMessage('Não consegui buscar sua agenda. Tente novamente.')
    );
    return;
  }

  await sendTextMessage(whatsappNumber, formatDailyAgenda(eventsResult.data || [], dateToQuery));
}

/**
 * Processa comando de alterar evento
 */
async function handleAlterarEvento(
  user: User,
  messageText: string,
  messageId: string
): Promise<void> {
  const whatsappNumber = user.whatsapp_number;

  if (!user.google_access_token || !user.google_refresh_token) {
    await sendTextMessage(
      whatsappNumber,
      `⚠️ Você precisa conectar seu Google Calendar primeiro.\n\n🔗 Clique aqui para configurar:\n${env.appUrl}/auth/google?whatsapp=${whatsappNumber}`
    );
    return;
  }

  await sendReaction(whatsappNumber, messageId, '⏳');

  // Buscar eventos recentes do usuário
  const eventsResult = await getUserRecentEvents(user.id);

  if (!eventsResult.success || !eventsResult.data || eventsResult.data.length === 0) {
    await sendTextMessage(
      whatsappNumber,
      `📅 Você não tem compromissos futuros para alterar.\n\nEnvie uma mensagem para criar um novo agendamento.`
    );
    return;
  }

  // Identificar qual evento e quais alterações
  const identifyResult = await identifyEventToModify(
    messageText,
    eventsResult.data,
    user.timezone
  );

  if (!identifyResult.success || !identifyResult.data) {
    await sendTextMessage(
      whatsappNumber,
      formatErrorMessage('Não consegui processar sua solicitação. Tente novamente.')
    );
    return;
  }

  const { google_event_id, new_date, new_time, confidence } = identifyResult.data;

  // Se não conseguiu identificar o evento com confiança
  if (confidence === 'none' || confidence === 'low' || !google_event_id) {
    // Listar os eventos para o usuário escolher
    const eventsList = eventsResult.data.map((e, i) => {
      const date = new Date(e.data_inicio);
      const dateStr = date.toLocaleDateString('pt-BR', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        timeZone: 'America/Sao_Paulo',
      });
      const timeStr = date.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Sao_Paulo',
      });
      return `${i + 1}. ${e.titulo} - ${dateStr} às ${timeStr}`;
    }).join('\n');

    await sendTextMessage(
      whatsappNumber,
      `🤔 *Qual compromisso você quer alterar?*\n\nSeus próximos compromissos:\n${eventsList}\n\n_Diga algo como: "remarcar o primeiro para dia 15" ou "alterar reunião para às 14h"_`
    );
    return;
  }

  // Construir a nova data/hora (considerando timezone de São Paulo)
  let newDateTime: string | undefined;
  if (new_date || new_time) {
    const currentEvent = eventsResult.data.find(e => e.google_event_id === google_event_id);
    if (currentEvent) {
      // Extrair componentes da data atual do evento no timezone de São Paulo
      const currentDate = new Date(currentEvent.data_inicio);
      const spFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const parts = spFormatter.formatToParts(currentDate);
      let year = parseInt(parts.find(p => p.type === 'year')?.value || '2024');
      let month = parseInt(parts.find(p => p.type === 'month')?.value || '1');
      let day = parseInt(parts.find(p => p.type === 'day')?.value || '1');
      let hours = parseInt(parts.find(p => p.type === 'hour')?.value || '9');
      let minutes = parseInt(parts.find(p => p.type === 'minute')?.value || '0');

      // Aplicar nova data se fornecida
      if (new_date) {
        const [newYear, newMonth, newDay] = new_date.split('-').map(Number);
        year = newYear || year;
        month = newMonth || month;
        day = newDay || day;
      }

      // Aplicar novo horário se fornecido
      if (new_time) {
        const [newHours, newMinutes] = new_time.split(':').map(Number);
        hours = newHours ?? hours;
        minutes = newMinutes ?? minutes;
      }

      // Construir ISO string no timezone de São Paulo
      // São Paulo é UTC-3 (sem horário de verão desde 2019)
      const spOffset = -3;
      const utcHours = hours - spOffset; // Converter de SP para UTC
      const isoDate = new Date(Date.UTC(year, month - 1, day, utcHours, minutes, 0, 0));
      newDateTime = isoDate.toISOString();
    }
  }

  if (!newDateTime) {
    await sendTextMessage(
      whatsappNumber,
      `🤔 *Para qual data/horário você quer remarcar?*\n\nExemplos:\n• "Para dia 15"\n• "Para às 14h"\n• "Para amanhã às 10h"`
    );
    return;
  }

  // Atualizar no Google Calendar
  const updateResult = await updateCalendarEvent(
    user.google_access_token,
    user.google_refresh_token,
    user.id,
    google_event_id,
    { data_inicio: newDateTime },
    user.timezone
  );

  if (!updateResult.success) {
    await sendTextMessage(
      whatsappNumber,
      formatErrorMessage('Não consegui alterar o compromisso. Tente novamente.')
    );
    return;
  }

  // Atualizar o lembrete também
  const reminderTime = new Date(new Date(newDateTime).getTime() - 10 * 60 * 1000);
  if (reminderTime > new Date()) {
    await updateReminderByGoogleEventId(google_event_id, {
      event_datetime: newDateTime,
      reminder_time: reminderTime.toISOString(),
    });
  } else {
    // Se o evento for muito em breve, deletar o lembrete
    await deleteRemindersByGoogleEventId(google_event_id);
  }

  const newDate = new Date(newDateTime);
  const formattedDate = newDate.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
  const formattedTime = newDate.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });

  await sendReaction(whatsappNumber, messageId, '✅');
  await sendTextMessage(
    whatsappNumber,
    `✅ *Compromisso alterado com sucesso!*\n\n📅 Nova data: ${formattedDate}\n🕐 Novo horário: ${formattedTime}`
  );
}

/**
 * Processa comando de cancelar evento
 */
async function handleCancelarEvento(
  user: User,
  messageText: string,
  messageId: string
): Promise<void> {
  const whatsappNumber = user.whatsapp_number;

  if (!user.google_access_token || !user.google_refresh_token) {
    await sendTextMessage(
      whatsappNumber,
      `⚠️ Você precisa conectar seu Google Calendar primeiro.\n\n🔗 Clique aqui para configurar:\n${env.appUrl}/auth/google?whatsapp=${whatsappNumber}`
    );
    return;
  }

  await sendReaction(whatsappNumber, messageId, '⏳');

  // Buscar eventos recentes do usuário
  const eventsResult = await getUserRecentEvents(user.id);

  if (!eventsResult.success || !eventsResult.data || eventsResult.data.length === 0) {
    await sendTextMessage(
      whatsappNumber,
      `📅 Você não tem compromissos futuros para cancelar.`
    );
    return;
  }

  const msgLower = messageText.toLowerCase();

  // Detectar cancelamento em lote (todos, tudo) com filtro de data (hoje, amanhã)
  const isBatchCancel = /\b(todos?|tudo)\b/.test(msgLower);
  const isToday = /\bhoje\b/.test(msgLower);
  const isTomorrow = /\bamanh[aã]\b/.test(msgLower);

  if (isBatchCancel && (isToday || isTomorrow)) {
    // Cancelamento em lote por data
    const now = new Date();
    const spFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    let targetDateStr: string;
    if (isTomorrow) {
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      targetDateStr = spFormatter.format(tomorrow);
    } else {
      targetDateStr = spFormatter.format(now);
    }

    // Filtrar eventos da data alvo
    const eventsToCancel = eventsResult.data.filter(e => {
      const eventDate = new Date(e.data_inicio);
      const eventDateStr = spFormatter.format(eventDate);
      return eventDateStr === targetDateStr && e.google_event_id;
    });

    if (eventsToCancel.length === 0) {
      await sendTextMessage(
        whatsappNumber,
        `📅 Você não tem compromissos para ${isToday ? 'hoje' : 'amanhã'}.`
      );
      return;
    }

    // Cancelar todos os eventos da data
    let canceledCount = 0;
    const canceledTitles: string[] = [];

    for (const event of eventsToCancel) {
      if (event.google_event_id) {
        const deleteResult = await deleteCalendarEvent(
          user.google_access_token,
          user.google_refresh_token,
          user.id,
          event.google_event_id
        );

        if (deleteResult.success) {
          await deleteRemindersByGoogleEventId(event.google_event_id);
          canceledCount++;
          canceledTitles.push(event.titulo);
        }
      }
    }

    await sendReaction(whatsappNumber, messageId, '✅');
    const dateLabel = isToday ? 'hoje' : 'amanhã';
    await sendTextMessage(
      whatsappNumber,
      `✅ *${canceledCount} compromisso(s) de ${dateLabel} cancelado(s)!*\n\n❌ ${canceledTitles.join('\n❌ ')}`
    );
    return;
  }

  // Identificar qual evento específico
  const identifyResult = await identifyEventToModify(
    messageText,
    eventsResult.data,
    user.timezone
  );

  if (!identifyResult.success || !identifyResult.data) {
    await sendTextMessage(
      whatsappNumber,
      formatErrorMessage('Não consegui processar sua solicitação. Tente novamente.')
    );
    return;
  }

  const { google_event_id, confidence } = identifyResult.data;

  // Se não conseguiu identificar o evento com confiança
  if (confidence === 'none' || confidence === 'low' || !google_event_id) {
    // Listar os eventos para o usuário escolher
    const eventsList = eventsResult.data.map((e, i) => {
      const date = new Date(e.data_inicio);
      const dateStr = date.toLocaleDateString('pt-BR', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        timeZone: 'America/Sao_Paulo',
      });
      const timeStr = date.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Sao_Paulo',
      });
      return `${i + 1}. ${e.titulo} - ${dateStr} às ${timeStr}`;
    }).join('\n');

    await sendTextMessage(
      whatsappNumber,
      `🤔 *Qual compromisso você quer cancelar?*\n\nSeus próximos compromissos:\n${eventsList}\n\n_Diga algo como: "cancelar o primeiro" ou "cancelar a reunião"_`
    );
    return;
  }

  // Encontrar o evento para mostrar no feedback
  const eventToCancel = eventsResult.data.find(e => e.google_event_id === google_event_id);

  // Deletar do Google Calendar
  const deleteResult = await deleteCalendarEvent(
    user.google_access_token,
    user.google_refresh_token,
    user.id,
    google_event_id
  );

  if (!deleteResult.success) {
    await sendTextMessage(
      whatsappNumber,
      formatErrorMessage('Não consegui cancelar o compromisso. Tente novamente.')
    );
    return;
  }

  // Deletar o lembrete também
  await deleteRemindersByGoogleEventId(google_event_id);

  await sendReaction(whatsappNumber, messageId, '✅');
  await sendTextMessage(
    whatsappNumber,
    `✅ *Compromisso cancelado com sucesso!*\n\n❌ ${eventToCancel?.titulo || 'Compromisso'} foi removido da sua agenda.`
  );
}
