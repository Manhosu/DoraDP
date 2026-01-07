import type { ExtractedEvent, EventType } from '../types/index.js';

/**
 * Emojis para cada tipo de evento
 */
const EVENT_EMOJIS: Record<EventType, string> = {
  audiencia: '⚖️',
  reuniao: '👥',
  prazo: '⏰',
  compromisso: '📅',
  outro: '📌',
};

/**
 * Formata uma mensagem de confirmação de evento para WhatsApp
 */
export function formatEventConfirmation(event: ExtractedEvent): string {
  const emoji = EVENT_EMOJIS[event.tipo_evento];
  const tipoFormatado = event.tipo_evento.charAt(0).toUpperCase() + event.tipo_evento.slice(1);

  const dataInicio = new Date(event.data_inicio);
  const dataFormatada = dataInicio.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const horaFormatada = dataInicio.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  let message = `${emoji} *${tipoFormatado} agendado(a) com sucesso!*\n\n`;
  message += `📋 *Título:* ${event.titulo}\n`;
  message += `📅 *Data:* ${dataFormatada}\n`;
  message += `🕐 *Horário:* ${horaFormatada}\n`;

  if (event.local) {
    message += `📍 *Local:* ${event.local}\n`;
  }

  if (event.descricao) {
    message += `\n📝 *Descrição:* ${event.descricao}\n`;
  }

  message += `\n✅ Evento salvo no Google Calendar e Notion.`;

  return message;
}

/**
 * Formata mensagem de erro amigável
 */
export function formatErrorMessage(error: string): string {
  return `❌ *Ops! Algo deu errado*\n\n${error}\n\nTente novamente ou digite *ajuda* para ver os comandos disponíveis.`;
}

/**
 * Formata mensagem de boas-vindas
 */
export function formatWelcomeMessage(userName?: string): string {
  const greeting = userName ? `Olá, *${userName}*! 👋` : 'Olá! 👋';

  return `${greeting}

Sou o *AIJP* - seu Assistente de Inteligência Jurídica e Prazos.

Posso ajudá-lo a:
⚖️ Agendar audiências
👥 Marcar reuniões
⏰ Registrar prazos processuais
📅 Organizar compromissos

*Como usar:*
Basta me enviar uma mensagem de texto ou áudio com os detalhes do compromisso. Por exemplo:

_"Audiência no Fórum Central dia 15 às 14h, processo 1234567"_

Eu vou extrair as informações e salvar no seu Google Calendar e Notion automaticamente!

Digite *ajuda* para ver todos os comandos.`;
}

/**
 * Formata mensagem de ajuda
 */
export function formatHelpMessage(): string {
  return `📚 *Comandos disponíveis:*

*ver agenda* - Mostra seus compromissos de hoje
*ajuda* - Exibe esta mensagem

*Para agendar:*
Envie uma mensagem de texto ou áudio descrevendo o compromisso. Exemplos:

_"Reunião com cliente João amanhã às 10h"_
_"Prazo para contestação dia 20/01 às 23:59"_
_"Audiência de instrução sexta-feira às 14h no Fórum Central"_

Dica: Quanto mais detalhes você fornecer, melhor será o registro!`;
}

/**
 * Formata lista de eventos do dia
 */
export function formatDailyAgenda(events: ExtractedEvent[]): string {
  if (events.length === 0) {
    return `📅 *Agenda de hoje*\n\nVocê não tem compromissos agendados para hoje. 🎉`;
  }

  let message = `📅 *Agenda de hoje*\n\n`;

  events.forEach((event, index) => {
    const emoji = EVENT_EMOJIS[event.tipo_evento];
    const hora = new Date(event.data_inicio).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });

    message += `${index + 1}. ${emoji} *${hora}* - ${event.titulo}\n`;
    if (event.local) {
      message += `   📍 ${event.local}\n`;
    }
    message += '\n';
  });

  return message.trim();
}

/**
 * Formata mensagem solicitando data
 */
export function formatDateRequestMessage(): string {
  return `🤔 *Não consegui identificar a data do compromisso.*

Por favor, me informe a data e horário. Exemplos:
- _"Amanhã às 14h"_
- _"Dia 15/01 às 10:30"_
- _"Segunda-feira que vem às 9h"_`;
}
