import { Router, Request, Response } from 'express';
import axios from 'axios';
import { getAuthUrl, exchangeCodeForTokens } from '../integrations/google-calendar.js';
import { listDatabases } from '../integrations/notion.js';
import { getUserByWhatsAppNumber, updateGoogleTokens, updateNotionToken, completeOnboarding } from '../integrations/supabase.js';
import { sendTextMessage } from '../integrations/whatsapp.js';
import { formatGoogleConnectedMessage, formatNotionConnectedMessage } from '../utils/formatters.js';
import { env } from '../config/env.js';

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

// ==================== NOTION OAuth ====================

/**
 * GET /auth/notion - Inicia o fluxo OAuth do Notion
 */
router.get('/notion', (req: Request, res: Response) => {
  const whatsappNumber = req.query.whatsapp as string;

  if (!whatsappNumber) {
    res.status(400).json({ error: 'Parâmetro whatsapp é obrigatório' });
    return;
  }

  if (!env.notionClientId) {
    res.status(500).json({ error: 'Notion OAuth não configurado' });
    return;
  }

  // Codificar o estado como base64 para evitar problemas de parsing
  const stateEncoded = Buffer.from(`wa:${whatsappNumber}`).toString('base64');

  const authUrl = new URL('https://api.notion.com/v1/oauth/authorize');
  authUrl.searchParams.set('client_id', env.notionClientId);
  authUrl.searchParams.set('redirect_uri', env.notionRedirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('owner', 'user');
  authUrl.searchParams.set('state', stateEncoded);

  console.log('=== Notion OAuth Debug ===');
  console.log('WhatsApp:', whatsappNumber);
  console.log('State encoded:', stateEncoded);
  console.log('Auth URL:', authUrl.toString());
  console.log('==========================');

  res.redirect(authUrl.toString());
});

/**
 * GET /auth/notion/callback - Callback do OAuth do Notion
 */
router.get('/notion/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string;
  const stateEncoded = req.query.state as string;
  const error = req.query.error as string;

  if (error) {
    res.status(400).send(renderNotionPage('Erro', `
      <h1>Erro na autenticacao</h1>
      <p>Voce cancelou a autorizacao ou ocorreu um erro.</p>
      <p>Erro: ${error}</p>
    `));
    return;
  }

  if (!code || !stateEncoded) {
    res.status(400).send(renderNotionPage('Erro', `
      <h1>Erro na autenticacao</h1>
      <p>Parametros invalidos na resposta do Notion.</p>
    `));
    return;
  }

  try {
    // Decodificar o state (formato: "wa:NUMERO")
    const stateDecoded = Buffer.from(stateEncoded, 'base64').toString('utf-8');
    const whatsappNumber = stateDecoded.replace('wa:', '');

    // Buscar usuário pelo WhatsApp number
    const userResult = await getUserByWhatsAppNumber(whatsappNumber);
    if (!userResult.success || !userResult.data) {
      res.status(404).send(renderNotionPage('Erro', `
        <h1>Usuario nao encontrado</h1>
        <p>O numero do WhatsApp nao esta registrado no sistema.</p>
      `));
      return;
    }

    const user = userResult.data;

    // Trocar código por access token
    const tokenResponse = await axios.post(
      'https://api.notion.com/v1/oauth/token',
      {
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: env.notionRedirectUri,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        auth: {
          username: env.notionClientId || '',
          password: env.notionClientSecret || '',
        },
      }
    );

    const { access_token, workspace_id, duplicated_template_id } = tokenResponse.data;

    if (!access_token) {
      throw new Error('Token não recebido do Notion');
    }

    // Buscar databases disponíveis automaticamente
    let databaseId = duplicated_template_id || '';
    let databaseName = '';

    const dbResult = await listDatabases(access_token);
    const databases = dbResult.data || [];
    const firstDb = databases[0];
    if (dbResult.success && firstDb) {
      // Usar a primeira database encontrada
      databaseId = firstDb.id;
      databaseName = firstDb.name;
      console.log(`Notion: Database detectada automaticamente: ${databaseName} (${databaseId})`);
    } else {
      console.log('Notion: Nenhuma database encontrada, usando workspace_id');
      databaseId = workspace_id || '';
    }

    // Salvar token e database_id no banco
    await updateNotionToken(user.id, access_token, databaseId);

    // Verificar se tem Google configurado
    const hasGoogle = !!user.google_access_token;

    // Marcar onboarding como completo se tiver Google configurado
    if (hasGoogle) {
      await completeOnboarding(user.id);
    }

    // Mensagem de sucesso com info da database
    const dbInfo = databaseName ? `\n\nDatabase conectada: *${databaseName}*` : '';
    const noDatabaseWarning = !databaseName && dbResult.success ? '\n\n⚠️ Nenhuma database encontrada. Compartilhe uma database com a integração DoraDP no Notion.' : '';

    // Enviar mensagem de confirmação no WhatsApp
    await sendTextMessage(whatsappNumber, formatNotionConnectedMessage(hasGoogle) + dbInfo + noDatabaseWarning);

    res.status(200).send(renderNotionPage('Sucesso', `
      <h1>Notion conectado!</h1>
      <p>Sua conta foi conectada com sucesso.</p>
      ${databaseName ? `<p>Database: <strong>${databaseName}</strong></p>` : ''}
      ${!databaseName ? '<p style="color: orange;">⚠️ Nenhuma database encontrada. Compartilhe uma database com a integração DoraDP no Notion.</p>' : ''}
      ${hasGoogle
        ? '<p><strong>Tudo pronto!</strong> Voce ja pode usar a DoraDP pelo WhatsApp.</p>'
        : '<p>Agora falta conectar o <strong>Google Calendar</strong>.</p>'
      }
      <p style="color: #666; margin-top: 20px;">Pode fechar esta janela.</p>
    `));
  } catch (err) {
    console.error('Erro no callback do Notion:', err);
    res.status(500).send(renderNotionPage('Erro', `
      <h1>Erro interno</h1>
      <p>Ocorreu um erro ao processar a autenticacao.</p>
      <p>${err instanceof Error ? err.message : 'Erro desconhecido'}</p>
    `));
  }
});

/**
 * Renderiza página HTML para Notion OAuth
 */
function renderNotionPage(title: string, content: string): string {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - DoraDP</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 20px;
      margin: 0;
    }
    .container {
      background: white;
      border-radius: 16px;
      padding: 40px;
      max-width: 500px;
      width: 100%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      text-align: center;
    }
    h1 { color: #333; margin-bottom: 20px; }
    p { color: #666; margin-bottom: 15px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="container">
    ${content}
  </div>
</body>
</html>
  `;
}

export default router;
