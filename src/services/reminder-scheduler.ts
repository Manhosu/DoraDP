import cron from 'node-cron';
import { getPendingReminders, markReminderAsSent } from '../integrations/supabase.js';
import { sendTextMessage } from '../integrations/whatsapp.js';
import type { Reminder } from '../types/index.js';

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
 * Inicia o scheduler de lembretes
 * Executa a cada minuto para verificar lembretes pendentes
 */
export function startReminderScheduler(): void {
  console.log('[Scheduler] Iniciando scheduler de lembretes...');

  // Executar a cada minuto
  cron.schedule('* * * * *', () => {
    processReminders();
  });

  console.log('[Scheduler] Scheduler iniciado. Verificando lembretes a cada minuto.');
}
