import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import type { User, ServiceResponse } from '../types/index.js';

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
      notion_token: data.notion_token ? decrypt(data.notion_token) : null,
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
 * Atualiza o token do Notion para um usuário
 */
export async function updateNotionToken(
  userId: string,
  notionToken: string,
  databaseId: string
): Promise<ServiceResponse<void>> {
  try {
    const supabase = getSupabaseAdmin();

    const { error } = await supabase
      .from('users')
      .update({
        notion_token: encrypt(notionToken),
        notion_database_id: databaseId,
      })
      .eq('id', userId);

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error('Erro ao atualizar token do Notion:', error);
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
    notion_page_id?: string;
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
