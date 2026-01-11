// ===========================================
// Tipos principais do sistema AIJP
// ===========================================

// --- Usuário ---
export interface User {
  id: string;
  whatsapp_number: string;
  full_name: string | null;
  google_access_token: string | null;
  google_refresh_token: string | null;
  google_token_expiry: string | null;
  notion_token: string | null;
  notion_database_id: string | null;
  timezone: string;
  is_active: boolean;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

// --- Evento extraído pela IA ---
export type EventType = 'audiencia' | 'reuniao' | 'prazo' | 'compromisso' | 'outro';

export interface ExtractedEvent {
  titulo: string;
  data_inicio: string; // ISO 8601
  data_fim: string | null; // ISO 8601
  descricao: string | null;
  tipo_evento: EventType;
  local: string | null;
  participantes: string[] | null;
  empresa: string | null; // Nome da empresa/cliente mencionado
  all_day?: boolean; // true se evento de dia todo (sem horário específico)
}

// --- WhatsApp Webhook Payload ---
export interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type: 'text' | 'audio' | 'image' | 'document' | 'unknown';
  text?: {
    body: string;
  };
  audio?: {
    id: string;
    mime_type: string;
  };
}

export interface WhatsAppWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{
          profile: {
            name: string;
          };
          wa_id: string;
        }>;
        messages?: WhatsAppMessage[];
        statuses?: Array<{
          id: string;
          status: string;
          timestamp: string;
          recipient_id: string;
        }>;
      };
      field: string;
    }>;
  }>;
}

// --- Google Calendar ---
export interface GoogleCalendarEvent {
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime?: string;
    date?: string; // Para eventos all-day (formato YYYY-MM-DD)
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string; // Para eventos all-day (formato YYYY-MM-DD)
    timeZone?: string;
  };
  attendees?: Array<{
    email: string;
  }>;
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{
      method: 'email' | 'popup';
      minutes: number;
    }>;
  };
}

// --- Notion ---
export interface NotionPageProperties {
  [key: string]: unknown;
}

// --- Respostas de serviço ---
export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// --- Comandos do usuário ---
export type UserCommand = 'ver_agenda' | 'ajuda' | 'configurar' | 'cancelar' | 'none';

export interface ParsedUserInput {
  command: UserCommand;
  rawText: string;
  isAudio: boolean;
}
