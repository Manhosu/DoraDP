import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import type { User, Reminder, ServiceResponse } from '../types/index.js';

// Cliente Supabase com service role (acesso total)
let supabaseAdmin: SupabaseClient | null = null;

/**
 * Obtém o cliente Supabase Admin (singleton)
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdmin) {
    supabaseAdmin = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return supabaseAdmin;
}

/**
 * Busca um usuário pelo número do WhatsApp
 */
export async function getUserByWhatsAppNumber(
  whatsappNumber: string
): Promise<ServiceResponse<User>> {
  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('whatsapp_number', whatsappNumber)
      .eq('is_active', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Usuário não encontrado
        return { success: false, error: 'Usuário não encontrado' };
      }
      throw error;
    }

    // Descriptografar tokens se existirem
    const user: User = {
      ...data,
      google_access_token: data.google_access_token
        ? decrypt(data.google_access_token)
        : null,
      google_refresh_token: data.google_refresh_token
        ? decrypt(data.google_refresh_token)
        : null,
    };

    return { success: true, data: user };
  } catch (error) {
    console.error('Erro ao buscar usuário:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}

/**
 * Cria um novo usuário
 */
export async function createUser(
  whatsappNumber: string,
  fullName?: string
): Promise<ServiceResponse<User>> {
  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('users')
      .insert({
        whatsapp_number: whatsappNumber,
        full_name: fullName || null,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return { success: true, data: data as User };
  } catch (error) {
    console.error('Erro ao criar usuário:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}

/**
 * Atualiza os tokens do Google para um usuário
 */
export async function updateGoogleTokens(
  userId: string,
  accessToken: string,
  refreshToken: string,
  expiryDate?: Date
): Promise<ServiceResponse<void>> {
  try {
    const supabase = getSupabaseAdmin();

    const { error } = await supabase
      .from('users')
      .update({
        google_access_token: encrypt(accessToken),
        google_refresh_token: encrypt(refreshToken),
        google_token_expiry: expiryDate?.toISOString() || null,
      })
      .eq('id', userId);

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error('Erro ao atualizar tokens do Google:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}

/**
 * Marca onboarding como completo
 */
export async function completeOnboarding(userId: string): Promise<ServiceResponse<void>> {
  try {
    const supabase = getSupabaseAdmin();

    const { error } = await supabase
      .from('users')
      .update({ onboarding_completed: true })
      .eq('id', userId);

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error('Erro ao completar onboarding:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}

/**
 * Registra um evento no log
 */
export async function logEvent(
  userId: string,
  event: {
    titulo: string;
    tipo_evento: string;
    data_inicio: string;
    data_fim?: string;
    descricao?: string;
    google_event_id?: string;
    mensagem_original?: string;
    foi_audio?: boolean;
    status?: string;
    error_message?: string;
  }
): Promise<ServiceResponse<{ id: string }>> {
  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('events_log')
      .insert({
        user_id: userId,
        ...event,
      })
      .select('id')
      .single();

    if (error) {
      throw error;
    }

    return { success: true, data: { id: data.id } };
  } catch (error) {
    console.error('Erro ao registrar evento:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}

/**
 * Busca eventos recentes do usuário (para alterar/cancelar)
 * Inclui eventos de hoje (mesmo que o horário já tenha passado) e futuros
 */
export async function getUserRecentEvents(
  userId: string,
  limit: number = 10
): Promise<ServiceResponse<Array<{
  id: string;
  titulo: string;
  tipo_evento: string;
  data_inicio: string;
  google_event_id: string | null;
}>>> {
  try {
    const supabase = getSupabaseAdmin();

    // Início do dia de hoje no timezone de São Paulo (UTC-3)
    const now = new Date();
    const spFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const todayStr = spFormatter.format(now); // YYYY-MM-DD
    // Converter início do dia em SP para UTC
    const startOfTodaySP = new Date(todayStr + 'T00:00:00-03:00');

    const { data, error } = await supabase
      .from('events_log')
      .select('id, titulo, tipo_evento, data_inicio, google_event_id')
      .eq('user_id', userId)
      .not('google_event_id', 'is', null)
      .gte('data_inicio', startOfTodaySP.toISOString()) // Eventos de hoje e futuros
      .order('data_inicio', { ascending: true })
      .limit(limit);

    if (error) {
      throw error;
    }

    return { success: true, data: data || [] };
  } catch (error) {
    console.error('Erro ao buscar eventos recentes:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}

// ==================== LEMBRETES ====================

/**
 * Cria um lembrete para um evento
 */
export async function createReminder(
  reminder: {
    user_id: string;
    event_log_id?: string;
    google_event_id?: string;
    event_title: string;
    event_datetime: string;
    reminder_time: string;
  }
): Promise<ServiceResponse<{ id: string }>> {
  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('reminders')
      .insert(reminder)
      .select('id')
      .single();

    if (error) {
      throw error;
    }

    return { success: true, data: { id: data.id } };
  } catch (error) {
    console.error('Erro ao criar lembrete:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}

/**
 * Busca lembretes pendentes que devem ser enviados
 * (reminder_time <= now e sent = false)
 */
export async function getPendingReminders(): Promise<ServiceResponse<Reminder[]>> {
  try {
    const supabase = getSupabaseAdmin();

    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('reminders')
      .select(`
        id,
        user_id,
        event_log_id,
        google_event_id,
        event_title,
        event_datetime,
        reminder_time,
        sent,
        created_at,
        users!inner(whatsapp_number)
      `)
      .eq('sent', false)
      .lte('reminder_time', now)
      .order('reminder_time', { ascending: true });

    if (error) {
      throw error;
    }

    // Flatten o resultado para incluir whatsapp_number
    const reminders = (data || []).map((r: Record<string, unknown>) => {
      const reminder = {
        id: r.id as string,
        user_id: r.user_id as string,
        event_log_id: r.event_log_id as string | null,
        google_event_id: r.google_event_id as string | null,
        event_title: r.event_title as string,
        event_datetime: r.event_datetime as string,
        reminder_time: r.reminder_time as string,
        sent: r.sent as boolean,
        created_at: r.created_at as string,
        whatsapp_number: (r.users as { whatsapp_number: string })?.whatsapp_number,
      };
      return reminder as Reminder;
    });

    return { success: true, data: reminders };
  } catch (error) {
    console.error('Erro ao buscar lembretes pendentes:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}

/**
 * Marca um lembrete como enviado
 */
export async function markReminderAsSent(reminderId: string): Promise<ServiceResponse<void>> {
  try {
    const supabase = getSupabaseAdmin();

    const { error } = await supabase
      .from('reminders')
      .update({ sent: true })
      .eq('id', reminderId);

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error('Erro ao marcar lembrete como enviado:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}

/**
 * Remove lembretes de um evento (para quando o evento é cancelado)
 */
export async function deleteRemindersByGoogleEventId(
  googleEventId: string
): Promise<ServiceResponse<void>> {
  try {
    const supabase = getSupabaseAdmin();

    const { error } = await supabase
      .from('reminders')
      .delete()
      .eq('google_event_id', googleEventId);

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error('Erro ao deletar lembretes:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}

/**
 * Atualiza o lembrete de um evento (para quando o evento é remarcado)
 */
export async function updateReminderByGoogleEventId(
  googleEventId: string,
  updates: {
    event_title?: string;
    event_datetime?: string;
    reminder_time?: string;
  }
): Promise<ServiceResponse<void>> {
  try {
    const supabase = getSupabaseAdmin();

    const { error } = await supabase
      .from('reminders')
      .update(updates)
      .eq('google_event_id', googleEventId)
      .eq('sent', false); // Só atualiza se ainda não foi enviado

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error('Erro ao atualizar lembrete:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}
