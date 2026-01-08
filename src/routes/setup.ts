import { Router, Request, Response } from 'express';
import { getUserByWhatsAppNumber, updateNotionToken, completeOnboarding } from '../integrations/supabase.js';
import { sendTextMessage } from '../integrations/whatsapp.js';
import { formatNotionConnectedMessage } from '../utils/formatters.js';

const router = Router();

/**
 * GET /setup/notion - Página para configurar o Notion
 */
router.get('/notion', async (req: Request, res: Response) => {
  const whatsappNumber = req.query.whatsapp as string;

  if (!whatsappNumber) {
    res.status(400).send(renderPage('Erro', `
      <h1>❌ Erro</h1>
      <p>Número do WhatsApp não fornecido.</p>
    `));
    return;
  }

  // Verificar se usuário existe
  const userResult = await getUserByWhatsAppNumber(whatsappNumber);
  if (!userResult.success || !userResult.data) {
    res.status(404).send(renderPage('Usuário não encontrado', `
      <h1>❌ Usuário não encontrado</h1>
      <p>O número ${whatsappNumber} não está registrado.</p>
      <p>Envie uma mensagem no WhatsApp primeiro para se cadastrar.</p>
    `));
    return;
  }

  // Se já tem Notion configurado
  if (userResult.data.notion_token) {
    res.send(renderPage('Notion já configurado', `
      <h1>✅ Notion já está configurado!</h1>
      <p>Você já conectou sua conta do Notion.</p>
      <p>Pode fechar esta janela e voltar ao WhatsApp.</p>
    `));
    return;
  }

  // Exibir formulário
  res.send(renderPage('Configurar Notion - DoraDP', `
    <h1>🔗 Conectar Notion</h1>
    <p>Configure sua integração com o Notion para a DoraDP.</p>

    <div class="instructions">
      <h3>📋 Como obter o Token:</h3>
      <ol>
        <li>Acesse <a href="https://www.notion.so/my-integrations" target="_blank">notion.so/my-integrations</a></li>
        <li>Clique em "New integration"</li>
        <li>Dê um nome (ex: "DoraDP")</li>
        <li>Copie o "Internal Integration Token"</li>
        <li>Na sua database do Notion, clique em "..." → "Add connections" → selecione "DoraDP"</li>
      </ol>

      <h3>📋 Como obter o Database ID:</h3>
      <ol>
        <li>Abra sua database no Notion</li>
        <li>Copie o ID da URL: notion.so/<strong>DATABASE_ID</strong>?v=...</li>
        <li>O ID tem 32 caracteres (com ou sem hífens)</li>
      </ol>
    </div>

    <form method="POST" action="/setup/notion">
      <input type="hidden" name="whatsapp" value="${whatsappNumber}" />

      <div class="form-group">
        <label for="token">Token de Integração:</label>
        <input type="text" id="token" name="token" placeholder="secret_..." required />
      </div>

      <div class="form-group">
        <label for="database_id">Database ID:</label>
        <input type="text" id="database_id" name="database_id" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" required />
      </div>

      <button type="submit">Conectar Notion</button>
    </form>
  `));
});

/**
 * POST /setup/notion - Salvar configuração do Notion
 */
router.post('/notion', async (req: Request, res: Response) => {
  const { whatsapp, token, database_id } = req.body;

  if (!whatsapp || !token || !database_id) {
    res.status(400).send(renderPage('Erro', `
      <h1>❌ Erro</h1>
      <p>Todos os campos são obrigatórios.</p>
      <a href="/setup/notion?whatsapp=${whatsapp || ''}">Voltar</a>
    `));
    return;
  }

  // Validar formato do token
  if (!token.startsWith('secret_') && !token.startsWith('ntn_')) {
    res.status(400).send(renderPage('Erro', `
      <h1>❌ Token inválido</h1>
      <p>O token do Notion deve começar com "secret_" ou "ntn_".</p>
      <a href="/setup/notion?whatsapp=${whatsapp}">Voltar</a>
    `));
    return;
  }

  // Buscar usuário
  const userResult = await getUserByWhatsAppNumber(whatsapp);
  if (!userResult.success || !userResult.data) {
    res.status(404).send(renderPage('Erro', `
      <h1>❌ Usuário não encontrado</h1>
      <p>O número ${whatsapp} não está registrado.</p>
    `));
    return;
  }

  const user = userResult.data;

  // Limpar database_id (remover hífens se necessário e formatar)
  const cleanDatabaseId = database_id.replace(/-/g, '').trim();

  try {
    // Salvar no banco
    const updateResult = await updateNotionToken(user.id, token, cleanDatabaseId);

    if (!updateResult.success) {
      throw new Error(updateResult.error);
    }

    // Verificar se onboarding está completo (tem Google também)
    const hasGoogle = !!user.google_access_token;
    if (hasGoogle) {
      await completeOnboarding(user.id);
    }

    // Enviar mensagem no WhatsApp
    await sendTextMessage(whatsapp, formatNotionConnectedMessage(hasGoogle));

    // Página de sucesso
    res.send(renderPage('Notion Conectado!', `
      <h1>✅ Notion conectado com sucesso!</h1>
      <p>Sua integração foi configurada.</p>
      ${hasGoogle
        ? '<p><strong>Tudo pronto!</strong> Você já pode usar a DoraDP pelo WhatsApp.</p>'
        : '<p>Agora falta configurar o <strong>Google Calendar</strong>.</p>'
      }
      <p style="color: #666; margin-top: 20px;">Pode fechar esta janela.</p>
    `));
  } catch (error) {
    console.error('Erro ao salvar Notion:', error);
    res.status(500).send(renderPage('Erro', `
      <h1>❌ Erro ao salvar</h1>
      <p>Ocorreu um erro ao salvar a configuração.</p>
      <p>Erro: ${error instanceof Error ? error.message : 'Desconhecido'}</p>
      <a href="/setup/notion?whatsapp=${whatsapp}">Tentar novamente</a>
    `));
  }
});

/**
 * Renderiza uma página HTML
 */
function renderPage(title: string, content: string): string {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      padding: 40px;
      max-width: 500px;
      width: 100%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    h1 {
      color: #333;
      margin-bottom: 20px;
      font-size: 24px;
    }
    p {
      color: #666;
      margin-bottom: 15px;
      line-height: 1.6;
    }
    .instructions {
      background: #f8f9fa;
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
    }
    .instructions h3 {
      color: #333;
      font-size: 14px;
      margin-bottom: 10px;
    }
    .instructions ol {
      margin-left: 20px;
      color: #555;
      font-size: 13px;
    }
    .instructions li {
      margin-bottom: 8px;
    }
    .instructions a {
      color: #667eea;
    }
    .form-group {
      margin-bottom: 20px;
    }
    label {
      display: block;
      margin-bottom: 8px;
      color: #333;
      font-weight: 500;
    }
    input[type="text"] {
      width: 100%;
      padding: 12px 16px;
      border: 2px solid #e1e5eb;
      border-radius: 8px;
      font-size: 14px;
      transition: border-color 0.2s;
    }
    input[type="text"]:focus {
      outline: none;
      border-color: #667eea;
    }
    button {
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    button:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }
    a {
      color: #667eea;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
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
