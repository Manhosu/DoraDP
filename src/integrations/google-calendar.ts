import { google, calendar_v3 } from 'googleapis';
import { env } from '../config/env.js';
import { updateGoogleTokens } from './supabase.js';
import type { ExtractedEvent, ServiceResponse, GoogleCalendarEvent } from '../types/index.js';

/**
 * Cria um cliente OAuth2 do Google
 */
export function createOAuth2Client(): InstanceType<typeof google.auth.OAuth2> {
  return new google.auth.OAuth2(
    env.googleClientId,
    env.googleClientSecret,
    env.googleRedirectUri
  );
}

/**
 * Gera a URL de autorização do Google
 */
export function getAuthUrl(state?: string): string {
  const oauth2Client = createOAuth2Client();

  const scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
  ];

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
    state: state,
  });
}

/**
 * Troca o código de autorização por tokens
 */
export async function exchangeCodeForTokens(
  code: string
): Promise<ServiceResponse<{ accessToken: string; refreshToken: string; expiryDate: Date }>> {
  try {
    const oauth2Client = createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error('Tokens não recebidos do Google');
    }

    return {
      success: true,
      data: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiryDate: new Date(tokens.expiry_date || Date.now() + 3600000),
      },
    };
  } catch (error) {
    console.error('Erro ao trocar código por tokens:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro ao autenticar com Google',
    };
  }
}

/**
 * Cria um cliente de calendário autenticado
 */
function getCalendarClient(
  accessToken: string,
  refreshToken: string,
  userId: string
): calendar_v3.Calendar {
  const oauth2Client = createOAuth2Client();

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  // Listener para quando o token for atualizado
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await updateGoogleTokens(
        userId,
        tokens.access_token,
        refreshToken,
        tokens.expiry_date ? new Date(tokens.expiry_date) : undefined
      );
    }
  });

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

/**
 * Cria um evento no Google Calendar
 */
export async function createCalendarEvent(
  accessToken: string,
  refreshToken: string,
  userId: string,
  event: ExtractedEvent,
  timezone: string = 'America/Sao_Paulo'
): Promise<ServiceResponse<{ eventId: string; htmlLink: string }>> {
  try {
    const calendar = getCalendarClient(accessToken, refreshToken, userId);

    const calendarEvent: GoogleCalendarEvent = {
      summary: event.titulo,
      description: event.descricao || undefined,
      location: event.local || undefined,
      start: {
        dateTime: event.data_inicio,
        timeZone: timezone,
      },
      end: {
        dateTime: event.data_fim || new Date(new Date(event.data_inicio).getTime() + 3600000).toISOString(),
        timeZone: timezone,
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 30 },
          { method: 'popup', minutes: 10 },
        ],
      },
    };

    // Adicionar participantes se existirem
    if (event.participantes && event.participantes.length > 0) {
      calendarEvent.attendees = event.participantes
        .filter((p) => p.includes('@'))
        .map((email) => ({ email }));
    }

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: calendarEvent,
    });

    if (!response.data.id) {
      throw new Error('ID do evento não retornado');
    }

    return {
      success: true,
      data: {
        eventId: response.data.id,
        htmlLink: response.data.htmlLink || '',
      },
    };
  } catch (error) {
    console.error('Erro ao criar evento no Google Calendar:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro ao criar evento',
    };
  }
}

/**
 * Lista eventos de um dia específico
 */
export async function listEventsForDay(
  accessToken: string,
  refreshToken: string,
  userId: string,
  date: Date,
  timezone: string = 'America/Sao_Paulo'
): Promise<ServiceResponse<ExtractedEvent[]>> {
  try {
    const calendar = getCalendarClient(accessToken, refreshToken, userId);

    // Início e fim do dia
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      timeZone: timezone,
    });

    const events: ExtractedEvent[] = (response.data.items || []).map((item) => ({
      titulo: item.summary || 'Sem título',
      data_inicio: item.start?.dateTime || item.start?.date || '',
      data_fim: item.end?.dateTime || item.end?.date || null,
      descricao: item.description || null,
      tipo_evento: 'compromisso' as const,
      local: item.location || null,
      participantes: item.attendees?.map((a) => a.email || '') || null,
      empresa: null,
    }));

    return { success: true, data: events };
  } catch (error) {
    console.error('Erro ao listar eventos:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro ao listar eventos',
    };
  }
}
