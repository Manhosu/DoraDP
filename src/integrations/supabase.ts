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
 * Apenas eventos futuros (a partir do momento atual)
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

    const { data, error } = await supabase
      .from('events_log')
      .select('id, titulo, tipo_evento, data_inicio, google_event_id')
      .eq('user_id', userId)
      .not('google_event_id', 'is', null)
      .gte('data_inicio', new Date().toISOString()) // Apenas eventos futuros
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
 * Marca um lembrete como enviado (apenas se ainda não foi enviado)
 * Retorna success: false se o lembrete já estava marcado como enviado (outro processo já tratou)
 */
export async function markReminderAsSent(reminderId: string): Promise<ServiceResponse<void>> {
  try {
    const supabase = getSupabaseAdmin();

    // Só atualiza se sent = false (evita race condition)
    const { data, error } = await supabase
      .from('reminders')
      .update({ sent: true })
      .eq('id', reminderId)
      .eq('sent', false)
      .select('id');

    if (error) {
      throw error;
    }

    // Se não atualizou nenhuma linha, significa que já estava marcado como enviado
    if (!data || data.length === 0) {
      return { success: false, error: 'Lembrete já foi processado' };
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

// ==================== IDEMPOTÊNCIA DE MENSAGENS ====================

/**
 * Verifica se uma mensagem já foi processada (para evitar duplicatas)
 */
export async function isMessageProcessed(messageId: string): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('processed_messages')
      .select('message_id')
      .eq('message_id', messageId)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned (not found)
      console.error('Erro ao verificar mensagem processada:', error);
    }

    return !!data;
  } catch (error) {
    console.error('Erro ao verificar mensagem processada:', error);
    return false; // Em caso de erro, permite processar (fail-open)
  }
}

/**
 * Marca uma mensagem como processada
 */
export async function markMessageAsProcessed(
  messageId: string,
  whatsappNumber: string
): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin();

    const { error } = await supabase
      .from('processed_messages')
      .upsert(
        { message_id: messageId, whatsapp_number: whatsappNumber },
        { onConflict: 'message_id' }
      );

    if (error) {
      console.error('Erro ao marcar mensagem como processada:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Erro ao marcar mensagem como processada:', error);
    return false;
  }
}

// ==================== USUÁRIOS ATIVOS ====================

/**
 * Busca todos os usuários ativos com Google Calendar conectado
 * Para envio de lembretes matinais
 */
export async function getAllActiveUsersWithCalendar(): Promise<ServiceResponse<Array<{
  id: string;
  whatsapp_number: string;
  google_access_token: string;
  google_refresh_token: string;
  timezone: string;
  subscription_status: string | null;
}>>> {
  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('users')
      .select('id, whatsapp_number, google_access_token, google_refresh_token, timezone, subscription_status')
      .not('google_access_token', 'is', null)
      .not('google_refresh_token', 'is', null);

    if (error) {
      throw error;
    }

    // Filtrar usuários com acesso ativo (não expirado/cancelado)
    const activeUsers = (data || []).filter(user => {
      const status = user.subscription_status;
      // Permitir: null (legado), active, trial
      // Bloquear: expired, canceled
      return !status || status === 'active' || status === 'trial';
    });

    return { success: true, data: activeUsers };
  } catch (error) {
    console.error('Erro ao buscar usuários ativos:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}

// ==================== FUNÇÕES ADMIN ====================

/**
 * Lista todos os usuários com filtros e paginação
 */
export async function getAllUsers(filters: {
  status?: string;
  search?: string;
  page: number;
  limit: number;
}): Promise<ServiceResponse<{
  users: Array<{
    id: string;
    whatsapp_number: string;
    full_name: string | null;
    email: string | null;
    subscription_status: string | null;
    subscription_expires_at: string | null;
    has_google: boolean;
    onboarding_completed: boolean;
    created_at: string;
  }>;
  total: number;
  page: number;
  limit: number;
}>> {
  try {
    const supabase = getSupabaseAdmin();
    const { status, search, page, limit } = filters;
    const offset = (page - 1) * limit;

    // Query base - buscar todos os campos disponíveis
    let query = supabase
      .from('users')
      .select('*', { count: 'exact' })
      .eq('is_active', true);

    // Filtrar por status (só se a coluna existir)
    if (status) {
      if (status === 'legacy') {
        query = query.is('subscription_status', null);
      } else {
        query = query.eq('subscription_status', status);
      }
    }

    // Busca por número ou nome (usar apenas campos que certamente existem)
    if (search) {
      query = query.or(`whatsapp_number.ilike.%${search}%,full_name.ilike.%${search}%`);
    }

    // Paginação e ordenação
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Erro na query getAllUsers:', error);
      throw error;
    }

    console.log(`[Admin] Encontrados ${data?.length || 0} usuários`);

    // Transformar dados (não expor tokens, tratar campos opcionais)
    const users = (data || []).map(user => ({
      id: user.id,
      whatsapp_number: user.whatsapp_number,
      full_name: user.full_name || null,
      email: user.email || null,
      subscription_status: user.subscription_status || null,
      subscription_expires_at: user.subscription_expires_at || null,
      has_google: !!user.google_access_token,
      onboarding_completed: user.onboarding_completed || false,
      created_at: user.created_at,
    }));

    return {
      success: true,
      data: {
        users,
        total: count || 0,
        page,
        limit,
      },
    };
  } catch (error) {
    console.error('Erro ao listar usuários:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}

/**
 * Atualiza dados de assinatura de um usuário
 */
export async function updateUserSubscription(
  whatsappNumber: string,
  updates: {
    subscription_status?: string | null;
    subscription_expires_at?: string | null;
    full_name?: string;
    email?: string;
  }
): Promise<ServiceResponse<User>> {
  try {
    const supabase = getSupabaseAdmin();

    // Montar objeto de atualização
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.subscription_status !== undefined) {
      updateData.subscription_status = updates.subscription_status;
    }
    if (updates.subscription_expires_at !== undefined) {
      updateData.subscription_expires_at = updates.subscription_expires_at;
    }
    if (updates.full_name !== undefined) {
      updateData.full_name = updates.full_name;
    }
    if (updates.email !== undefined) {
      updateData.email = updates.email;
    }

    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('whatsapp_number', whatsappNumber)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Usuário não encontrado' };
      }
      throw error;
    }

    return { success: true, data: data as User };
  } catch (error) {
    console.error('Erro ao atualizar assinatura:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}

/**
 * Deleta um usuário (soft delete - marca como inativo)
 */
export async function deleteUser(whatsappNumber: string): Promise<ServiceResponse<void>> {
  try {
    const supabase = getSupabaseAdmin();

    const { error } = await supabase
      .from('users')
      .update({
        is_active: false,
        subscription_status: 'canceled',
        updated_at: new Date().toISOString(),
      })
      .eq('whatsapp_number', whatsappNumber);

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error('Erro ao deletar usuário:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}

/**
 * Retorna estatísticas do sistema para o painel admin
 */
export async function getAdminStats(): Promise<ServiceResponse<{
  total_users: number;
  active: number;
  trial: number;
  expired: number;
  canceled: number;
  legacy: number;
  with_google: number;
}>> {
  try {
    const supabase = getSupabaseAdmin();

    // Buscar todos os usuários ativos (select * para evitar erro se coluna não existir)
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('is_active', true);

    if (error) {
      console.error('Erro na query getAdminStats:', error);
      throw error;
    }

    const users = data || [];
    console.log(`[Admin] Stats: ${users.length} usuários ativos encontrados`);

    const stats = {
      total_users: users.length,
      active: 0,
      trial: 0,
      expired: 0,
      canceled: 0,
      legacy: 0,
      with_google: 0,
    };

    for (const user of users) {
      // Contar por status (campo pode não existir)
      const status = user.subscription_status;
      switch (status) {
        case 'active':
          stats.active++;
          break;
        case 'trial':
          stats.trial++;
          break;
        case 'expired':
          stats.expired++;
          break;
        case 'canceled':
          stats.canceled++;
          break;
        default:
          stats.legacy++;
          break;
      }

      // Contar com Google conectado
      if (user.google_access_token) {
        stats.with_google++;
      }
    }

    return { success: true, data: stats };
  } catch (error) {
    console.error('Erro ao buscar estatísticas:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}
