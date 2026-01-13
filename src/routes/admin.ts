import { Router, Request, Response } from 'express';
import {
  getUserByWhatsAppNumber,
  createUser,
  updateGoogleTokens,
  completeOnboarding,
} from '../integrations/supabase.js';
import { getAuthUrl } from '../integrations/google-calendar.js';
import { env } from '../config/env.js';

const router = Router();

// Middleware simples de autenticação para rotas admin
// Em produção, você deve usar autenticação mais robusta
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

router.use(adminAuth);

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
    timezone: user?.timezone,
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
