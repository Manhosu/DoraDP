import { Router, Request, Response } from 'express';
import { getAuthUrl, exchangeCodeForTokens } from '../integrations/google-calendar.js';
import { getUserByWhatsAppNumber, updateGoogleTokens, completeOnboarding } from '../integrations/supabase.js';
import { sendTextMessage } from '../integrations/whatsapp.js';
import { formatGoogleConnectedMessage } from '../utils/formatters.js';

const router = Router();

/**
 * GET /auth/google/debug - Debug do OAuth (temporário)
 */
router.get('/google/debug', (_req: Request, res: Response) => {
  const authUrl = getAuthUrl('debug');

  res.json({
    message: 'Debug OAuth Google',
    authUrl: authUrl,
    parsedUrl: {
      fullUrl: authUrl,
      redirectUri: new URL(authUrl).searchParams.get('redirect_uri'),
      clientId: new URL(authUrl).searchParams.get('client_id'),
      scope: new URL(authUrl).searchParams.get('scope'),
    }
  });
});

/**
 * GET /auth/google - Inicia o fluxo OAuth do Google
 * Query params:
 *   - whatsapp: número do WhatsApp do usuário
 */
router.get('/google', (req: Request, res: Response) => {
  const whatsappNumber = req.query.whatsapp as string;

  if (!whatsappNumber) {
    res.status(400).json({ error: 'Parâmetro whatsapp é obrigatório' });
    return;
  }

  // Usar o número como state para identificar o usuário no callback
  const authUrl = getAuthUrl(whatsappNumber);

  // Log para debug
  console.log('=== OAuth Debug ===');
  console.log('WhatsApp:', whatsappNumber);
  console.log('Auth URL:', authUrl);
  console.log('Redirect URI:', new URL(authUrl).searchParams.get('redirect_uri'));
  console.log('==================');

  res.redirect(authUrl);
});

/**
 * GET /auth/google/callback - Callback do OAuth do Google
 */
router.get('/google/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string;
  const state = req.query.state as string; // whatsapp number
  const error = req.query.error as string;

  if (error) {
    res.status(400).send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
          <h1>❌ Erro na autenticação</h1>
          <p>Você cancelou a autorização ou ocorreu um erro.</p>
          <p>Erro: ${error}</p>
        </body>
      </html>
    `);
    return;
  }

  if (!code || !state) {
    res.status(400).send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
          <h1>❌ Erro na autenticação</h1>
          <p>Parâmetros inválidos na resposta do Google.</p>
        </body>
      </html>
    `);
    return;
  }

  try {
    // Buscar usuário pelo WhatsApp number
    const userResult = await getUserByWhatsAppNumber(state);
    if (!userResult.success || !userResult.data) {
      res.status(404).send(`
        <html>
          <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
            <h1>❌ Usuário não encontrado</h1>
            <p>O número do WhatsApp não está registrado no sistema.</p>
          </body>
        </html>
      `);
      return;
    }

    const user = userResult.data;

    // Trocar código por tokens
    const tokensResult = await exchangeCodeForTokens(code);
    if (!tokensResult.success || !tokensResult.data) {
      res.status(500).send(`
        <html>
          <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
            <h1>❌ Erro ao obter tokens</h1>
            <p>${tokensResult.error}</p>
          </body>
        </html>
      `);
      return;
    }

    const { accessToken, refreshToken, expiryDate } = tokensResult.data;

    // Salvar tokens no banco
    await updateGoogleTokens(user.id, accessToken, refreshToken, expiryDate);

    // Verificar se tem Notion configurado
    const hasNotion = !!user.notion_token;

    // Marcar onboarding como completo se tiver Notion configurado
    if (hasNotion) {
      await completeOnboarding(user.id);
    }

    // Enviar mensagem de confirmação no WhatsApp
    await sendTextMessage(state, formatGoogleConnectedMessage(hasNotion));

    res.status(200).send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
          <h1>✅ Google Calendar conectado!</h1>
          <p>Sua conta foi conectada com sucesso.</p>
          <p>Você já pode voltar para o WhatsApp e começar a agendar seus compromissos.</p>
          <br>
          <p style="color: #666;">Pode fechar esta janela.</p>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('Erro no callback do Google:', err);
    res.status(500).send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
          <h1>❌ Erro interno</h1>
          <p>Ocorreu um erro ao processar a autenticação.</p>
        </body>
      </html>
    `);
  }
});

export default router;
