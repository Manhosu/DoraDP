import { Router, Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getUserByWhatsAppNumber,
  createUser,
  updateGoogleTokens,
  completeOnboarding,
  getAllUsers,
  updateUserSubscription,
  deleteUser,
  getAdminStats,
} from '../integrations/supabase.js';
import { getAuthUrl } from '../integrations/google-calendar.js';
import { env } from '../config/env.js';

const router = Router();

// Obter __dirname em ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * GET /admin - Painel admin web (sem autenticação - auth via JS)
 */
router.get('/', (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

// Middleware simples de autenticação para rotas admin API
const adminAuth = (req: Request, res: Response, next: Function): void => {
  const adminKey = req.headers['x-admin-key'];

  // Em desenvolvimento, permite acesso sem chave
  if (env.nodeEnv === 'development') {
    next();
    return;
  }

  // Em produção, requer chave admin (você pode adicionar ADMIN_KEY no .env)
  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    res.status(401).json({ error: 'Não autorizado' });
    return;
  }

  next();
};

// Aplicar auth apenas nas rotas de API (não no HTML)
router.use('/stats', adminAuth);
router.use('/users', adminAuth);

/**
 * GET /admin/stats - Estatísticas do sistema
 */
router.get('/stats', async (_req: Request, res: Response) => {
  const result = await getAdminStats();

  if (!result.success) {
    res.status(500).json({ success: false, error: result.error });
    return;
  }

  res.json({ success: true, data: result.data });
});

/**
 * GET /admin/users - Lista todos os usuários com filtros
 */
router.get('/users', async (req: Request, res: Response) => {
  const { status, search, page = '1', limit = '50' } = req.query;

  const result = await getAllUsers({
    status: status as string | undefined,
    search: search as string | undefined,
    page: parseInt(page as string, 10) || 1,
    limit: Math.min(parseInt(limit as string, 10) || 50, 100), // máximo 100
  });

  if (!result.success) {
    res.status(500).json({ success: false, error: result.error });
    return;
  }

  res.json({ success: true, data: result.data });
});

/**
 * GET /admin/users/:whatsapp - Busca um usuário pelo WhatsApp
 */
router.get('/users/:whatsapp', async (req: Request, res: Response) => {
  const whatsapp = req.params.whatsapp;

  if (!whatsapp) {
    res.status(400).json({ error: 'whatsapp é obrigatório' });
    return;
  }

  const result = await getUserByWhatsAppNumber(whatsapp);

  if (!result.success) {
    res.status(404).json({ error: result.error });
    return;
  }

  // Remover tokens sensíveis da resposta
  const user = result.data;
  res.json({
    id: user?.id,
    whatsapp_number: user?.whatsapp_number,
    full_name: user?.full_name,
    email: user?.email,
    timezone: user?.timezone,
    subscription_status: user?.subscription_status,
    subscription_expires_at: user?.subscription_expires_at,
    has_google: !!user?.google_access_token,
    onboarding_completed: user?.onboarding_completed,
    created_at: user?.created_at,
  });
});

/**
 * POST /admin/users - Cria um novo usuário
 */
router.post('/users', async (req: Request, res: Response) => {
  const { whatsapp_number, full_name } = req.body;

  if (!whatsapp_number) {
    res.status(400).json({ error: 'whatsapp_number é obrigatório' });
    return;
  }

  // Verificar se já existe
  const existing = await getUserByWhatsAppNumber(whatsapp_number);
  if (existing.success) {
    res.status(409).json({ error: 'Usuário já existe' });
    return;
  }

  const result = await createUser(whatsapp_number, full_name);

  if (!result.success) {
    res.status(500).json({ error: result.error });
    return;
  }

  res.status(201).json({
    message: 'Usuário criado com sucesso',
    user: {
      id: result.data?.id,
      whatsapp_number: result.data?.whatsapp_number,
    },
  });
});

/**
 * PUT /admin/users/:whatsapp - Atualiza dados de um usuário
 */
router.put('/users/:whatsapp', async (req: Request, res: Response) => {
  const whatsapp = req.params.whatsapp;
  const { subscription_status, subscription_expires_at, name, email } = req.body;

  if (!whatsapp) {
    res.status(400).json({ success: false, error: 'whatsapp é obrigatório' });
    return;
  }

  // Validar subscription_status se fornecido
  const validStatuses = ['active', 'trial', 'expired', 'canceled', null];
  if (subscription_status !== undefined && !validStatuses.includes(subscription_status)) {
    res.status(400).json({
      success: false,
      error: 'subscription_status inválido. Use: active, trial, expired, canceled ou null',
    });
    return;
  }

  const result = await updateUserSubscription(whatsapp, {
    subscription_status,
    subscription_expires_at,
    full_name: name,
    email,
  });

  if (!result.success) {
    res.status(404).json({ success: false, error: result.error });
    return;
  }

  res.json({
    success: true,
    message: 'Usuário atualizado com sucesso',
    data: {
      whatsapp_number: result.data?.whatsapp_number,
      subscription_status: result.data?.subscription_status,
      subscription_expires_at: result.data?.subscription_expires_at,
    },
  });
});

/**
 * DELETE /admin/users/:whatsapp - Remove um usuário (soft delete)
 */
router.delete('/users/:whatsapp', async (req: Request, res: Response) => {
  const whatsapp = req.params.whatsapp;

  if (!whatsapp) {
    res.status(400).json({ success: false, error: 'whatsapp é obrigatório' });
    return;
  }

  // Verificar se usuário existe
  const existingUser = await getUserByWhatsAppNumber(whatsapp);
  if (!existingUser.success) {
    res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    return;
  }

  const result = await deleteUser(whatsapp);

  if (!result.success) {
    res.status(500).json({ success: false, error: result.error });
    return;
  }

  res.json({
    success: true,
    message: 'Usuário removido com sucesso',
  });
});

/**
 * GET /admin/users/:whatsapp/google-auth-url - Gera URL de autenticação Google
 */
router.get('/users/:whatsapp/google-auth-url', async (req: Request, res: Response) => {
  const whatsapp = req.params.whatsapp;

  if (!whatsapp) {
    res.status(400).json({ error: 'whatsapp é obrigatório' });
    return;
  }

  const userResult = await getUserByWhatsAppNumber(whatsapp);
  if (!userResult.success) {
    res.status(404).json({ error: 'Usuário não encontrado' });
    return;
  }

  const authUrl = getAuthUrl(whatsapp);

  res.json({
    message: 'Envie esta URL para o usuário autorizar o Google Calendar',
    auth_url: authUrl,
  });
});

export default router;
