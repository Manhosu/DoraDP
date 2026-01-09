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

Sou a *DoraDP* - sua assistente de Departamento Pessoal.

Posso ajudá-lo a:
📋 Registrar folhas de pagamento
🏖️ Agendar férias
📝 Controlar rescisões
⏰ Gerenciar prazos de DP

*Como usar:*
Basta me enviar uma mensagem de texto ou áudio com os detalhes. Por exemplo:

_"Folha de pagamento empresa X dia 30/12"_

Eu vou extrair as informações e salvar no seu Google Calendar e Notion automaticamente!`;
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

_"Folha de pagamento empresa X dia 30/12"_
_"Férias do João empresa Y semana que vem"_
_"Rescisão Maria empresa Z amanhã"_

Dica: Quanto mais detalhes você fornecer, melhor será o registro!`;
}

/**
 * Formata mensagem de configuração para novos usuários
 */
export function formatSetupMessage(whatsappNumber: string, appUrl: string): string {
  const googleLink = `${appUrl}/auth/google?whatsapp=${whatsappNumber}`;
  const notionLink = `${appUrl}/setup/notion?whatsapp=${whatsappNumber}`;

  return `⚙️ *Configuração necessária*

Para usar a DoraDP, conecte suas contas:

🔗 *Google Calendar:*
${googleLink}

🔗 *Notion:*
${notionLink}

Clique nos links para configurar!`;
}

/**
 * Formata mensagem de Google conectado
 */
export function formatGoogleConnectedMessage(hasNotion: boolean): string {
  if (hasNotion) {
    return `✅ *Google Calendar conectado com sucesso!*

Tudo pronto! Agora você pode enviar mensagens para agendar seus compromissos de DP.`;
  }
  return `✅ *Google Calendar conectado com sucesso!*

Agora falta apenas configurar o Notion para finalizar.`;
}

/**
 * Formata mensagem de Notion conectado
 */
export function formatNotionConnectedMessage(hasGoogle: boolean): string {
  if (hasGoogle) {
    return `✅ *Notion conectado com sucesso!*

Tudo pronto! Agora você pode enviar mensagens para agendar seus compromissos de DP.`;
  }
  return `✅ *Notion conectado com sucesso!*

Agora falta apenas configurar o Google Calendar para finalizar.`;
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
