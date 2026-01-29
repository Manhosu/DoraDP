import cron from 'node-cron';
import { getPendingReminders, markReminderAsSent, getAllActiveUsersWithCalendar } from '../integrations/supabase.js';
import { sendTextMessage } from '../integrations/whatsapp.js';
import { listEventsForDay } from '../integrations/google-calendar.js';
import type { Reminder, ExtractedEvent } from '../types/index.js';

/**
 * Formata mensagem de lembrete
 */
function formatReminderMessage(reminder: Reminder): string {
  const eventDate = new Date(reminder.event_datetime);

  // Formatar hora
  const hora = eventDate.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });

  // Formatar data
  const data = eventDate.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });

  return `⏰ *Lembrete - 10 minutos!*\n\n` +
    `📋 *${reminder.event_title}*\n` +
    `📅 ${data}\n` +
    `🕐 ${hora}\n\n` +
    `_O compromisso começa em breve._`;
}

/**
 * Processa e envia lembretes pendentes
 */
async function processReminders(): Promise<void> {
  try {
    const result = await getPendingReminders();

    if (!result.success || !result.data || result.data.length === 0) {
      return;
    }

    console.log(`[Scheduler] Processando ${result.data.length} lembrete(s)...`);

    for (const reminder of result.data) {
      try {
        if (!reminder.whatsapp_number) {
          console.error(`[Scheduler] Lembrete ${reminder.id} sem número de WhatsApp`);
          continue;
        }

        // IMPORTANTE: Marcar como enviado ANTES de enviar (evita race condition/duplicatas)
        // Se o scheduler rodar novamente antes de terminar, o lembrete já estará marcado
        const markResult = await markReminderAsSent(reminder.id);
        if (!markResult.success) {
          console.log(`[Scheduler] Lembrete ${reminder.id} já está sendo processado, pulando`);
          continue;
        }

        // Enviar mensagem de lembrete
        await sendTextMessage(reminder.whatsapp_number, formatReminderMessage(reminder));

        console.log(`[Scheduler] Lembrete enviado: ${reminder.event_title} para ${reminder.whatsapp_number}`);
      } catch (error) {
        console.error(`[Scheduler] Erro ao enviar lembrete ${reminder.id}:`, error);
        // Nota: o lembrete já foi marcado como enviado, então não será reenviado
        // Isso é intencional para evitar duplicatas em caso de erro parcial
      }
    }
  } catch (error) {
    console.error('[Scheduler] Erro ao processar lembretes:', error);
  }
}

/**
 * Formata mensagem de agenda do dia
 */
function formatMorningAgendaMessage(events: ExtractedEvent[]): string {
  if (events.length === 0) {
    return '';
  }

  let message = `☀️ *Bom dia! Sua agenda de hoje:*\n\n`;

  events.forEach((event, index) => {
    const startDate = new Date(event.data_inicio);

    // Verificar se é evento de dia todo (sem horário específico ou meia-noite)
    const isAllDay = event.data_inicio.includes('T00:00:00') || !event.data_inicio.includes('T');

    if (isAllDay) {
      message += `${index + 1}. 📋 *Dia todo* - ${event.titulo}\n`;
    } else {
      const hora = startDate.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Sao_Paulo',
      });
      message += `${index + 1}. 📋 *${hora}* - ${event.titulo}\n`;
    }
  });

  message += `\n_Tenha um ótimo dia!_`;

  return message;
}

/**
 * Envia lembretes matinais às 8h para todos os usuários ativos
 */
async function sendMorningReminders(): Promise<void> {
  try {
    console.log('[Scheduler] Iniciando envio de lembretes matinais...');

    // Buscar todos os usuários ativos com Google Calendar
    const usersResult = await getAllActiveUsersWithCalendar();

    if (!usersResult.success || !usersResult.data || usersResult.data.length === 0) {
      console.log('[Scheduler] Nenhum usuário ativo para lembrete matinal');
      return;
    }

    console.log(`[Scheduler] Processando ${usersResult.data.length} usuário(s) para lembrete matinal...`);

    const today = new Date();

    for (const user of usersResult.data) {
      try {
        // Buscar eventos do dia no Google Calendar
        const eventsResult = await listEventsForDay(
          user.google_access_token,
          user.google_refresh_token,
          user.id,
          today,
          user.timezone || 'America/Sao_Paulo'
        );

        if (!eventsResult.success || !eventsResult.data || eventsResult.data.length === 0) {
          // Usuário sem eventos hoje - não enviar mensagem
          continue;
        }

        // Formatar e enviar mensagem
        const message = formatMorningAgendaMessage(eventsResult.data);
        if (message) {
          await sendTextMessage(user.whatsapp_number, message);
          console.log(`[Scheduler] Lembrete matinal enviado para ${user.whatsapp_number} (${eventsResult.data.length} eventos)`);
        }
      } catch (error) {
        console.error(`[Scheduler] Erro ao enviar lembrete matinal para ${user.whatsapp_number}:`, error);
        // Continuar com os outros usuários
      }
    }

    console.log('[Scheduler] Lembretes matinais concluídos');
  } catch (error) {
    console.error('[Scheduler] Erro ao processar lembretes matinais:', error);
  }
}

/**
 * Inicia o scheduler de lembretes
 * - Executa a cada minuto para verificar lembretes pendentes (10 min antes)
 * - Executa às 8h de São Paulo para enviar agenda do dia
 */
export function startReminderScheduler(): void {
  console.log('[Scheduler] Iniciando scheduler de lembretes...');

  // Lembrete 10 min antes: executar a cada minuto
  cron.schedule('* * * * *', () => {
    processReminders();
  });

  // Lembrete matinal às 8h de São Paulo (11h UTC)
  cron.schedule('0 11 * * *', () => {
    sendMorningReminders();
  });

  console.log('[Scheduler] Scheduler iniciado:');
  console.log('   - Lembretes 10min: a cada minuto');
  console.log('   - Agenda do dia: 8h São Paulo');
}
