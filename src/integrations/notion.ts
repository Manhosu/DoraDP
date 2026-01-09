import { Client } from '@notionhq/client';
import type { ExtractedEvent, ServiceResponse } from '../types/index.js';

/**
 * Cria um cliente Notion autenticado
 */
function getNotionClient(token: string): Client {
  return new Client({
    auth: token,
  });
}

// Tipos simplificados para o Notion
interface NotionProperty {
  type: string;
  [key: string]: unknown;
}

interface NotionDatabase {
  id: string;
  properties?: Record<string, NotionProperty>;
  title?: Array<{ plain_text: string }>;
}

interface NotionPage {
  id: string;
  url?: string;
}

/**
 * Cria uma página na database do Notion com os dados do evento
 */
export async function createNotionPage(
  notionToken: string,
  databaseId: string,
  event: ExtractedEvent
): Promise<ServiceResponse<{ pageId: string; url: string }>> {
  try {
    const notion = getNotionClient(notionToken);

    // Buscar o schema da database para adaptar as propriedades
    const database = (await notion.databases.retrieve({
      database_id: databaseId,
    })) as unknown as NotionDatabase;

    // Verificar se temos acesso às propriedades
    if (!database.properties) {
      throw new Error('Sem acesso completo à database do Notion');
    }

    // Mapear as propriedades baseado no schema existente
    const properties: Record<string, unknown> = {};

    const dbProperties = database.properties;

    // Procurar por propriedades comuns e mapear
    for (const [propName, propConfig] of Object.entries(dbProperties)) {
      const propNameLower = propName.toLowerCase();

      // Título (obrigatório)
      if (propConfig.type === 'title') {
        properties[propName] = {
          title: [{ text: { content: event.titulo } }],
        };
      }

      // Data
      if (propConfig.type === 'date') {
        if (
          propNameLower.includes('data') ||
          propNameLower.includes('date') ||
          propNameLower.includes('prazo') ||
          propNameLower.includes('quando')
        ) {
          properties[propName] = {
            date: {
              start: event.data_inicio,
              end: event.data_fim || undefined,
            },
          };
        }
      }

      // Tipo de evento (select)
      if (propConfig.type === 'select') {
        if (
          propNameLower.includes('tipo') ||
          propNameLower.includes('type') ||
          propNameLower.includes('categoria')
        ) {
          properties[propName] = {
            select: { name: event.tipo_evento },
          };
        }
      }

      // Descrição (rich_text)
      if (propConfig.type === 'rich_text') {
        if (
          propNameLower.includes('descri') ||
          propNameLower.includes('description') ||
          propNameLower.includes('notas') ||
          propNameLower.includes('observa')
        ) {
          properties[propName] = {
            rich_text: [{ text: { content: event.descricao || '' } }],
          };
        }

        // Local
        if (propNameLower.includes('local') || propNameLower.includes('location')) {
          properties[propName] = {
            rich_text: [{ text: { content: event.local || '' } }],
          };
        }

        // Empresa/Cliente
        if (propNameLower.includes('empresa') || propNameLower.includes('cliente') || propNameLower.includes('company')) {
          properties[propName] = {
            rich_text: [{ text: { content: event.empresa || '' } }],
          };
        }
      }

      // Status (pode ser select ou status type)
      if (propConfig.type === 'status') {
        if (propNameLower.includes('status')) {
          properties[propName] = {
            status: { name: 'Não iniciada' },
          };
        }
      }

      // Status como Select (caso da database "lista de tarefas - DP")
      if (propConfig.type === 'select' && propNameLower === 'status') {
        properties[propName] = {
          select: { name: 'a fazer' },
        };
      }
    }

    // Criar a página
    const response = (await notion.pages.create({
      parent: { database_id: databaseId },
      properties: properties as Parameters<typeof notion.pages.create>[0]['properties'],
    })) as unknown as NotionPage;

    // Extrair URL da página
    const pageUrl = response.url || `https://notion.so/${response.id.replace(/-/g, '')}`;

    return {
      success: true,
      data: {
        pageId: response.id,
        url: pageUrl,
      },
    };
  } catch (error) {
    console.error('Erro ao criar página no Notion:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro ao criar página no Notion',
    };
  }
}

/**
 * Verifica se o token do Notion é válido e tem acesso à database
 */
export async function validateNotionAccess(
  notionToken: string,
  databaseId: string
): Promise<ServiceResponse<{ databaseName: string }>> {
  try {
    const notion = getNotionClient(notionToken);

    const database = (await notion.databases.retrieve({
      database_id: databaseId,
    })) as unknown as NotionDatabase;

    // Extrair o nome da database
    let databaseName = 'Database';
    if (database.title && database.title.length > 0 && database.title[0]) {
      databaseName = database.title[0].plain_text;
    }

    return {
      success: true,
      data: { databaseName },
    };
  } catch (error) {
    console.error('Erro ao validar acesso ao Notion:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro ao acessar Notion',
    };
  }
}

/**
 * Lista as databases disponíveis para o token
 */
export async function listDatabases(
  notionToken: string
): Promise<ServiceResponse<Array<{ id: string; name: string }>>> {
  try {
    const notion = getNotionClient(notionToken);

    // Buscar todas as páginas e databases, depois filtrar
    const response = await notion.search({
      page_size: 100,
    });

    const databases: Array<{ id: string; name: string }> = [];

    for (const result of response.results) {
      // Filtrar apenas databases (usando cast para evitar erro de tipos)
      const obj = result as unknown as { object: string; id: string; title?: Array<{ plain_text: string }> };
      if (obj.object === 'database') {
        let name = 'Sem nome';
        if (obj.title && obj.title.length > 0 && obj.title[0]) {
          name = obj.title[0].plain_text;
        }
        databases.push({ id: obj.id, name });
      }
    }

    return { success: true, data: databases };
  } catch (error) {
    console.error('Erro ao listar databases:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro ao listar databases',
    };
  }
}

/**
 * Cria uma database DoraDP automaticamente no workspace do usuário
 */
export async function createDoraDatabase(
  notionToken: string
): Promise<ServiceResponse<{ id: string; name: string }>> {
  try {
    const notion = getNotionClient(notionToken);

    // Primeiro, buscar uma página onde podemos criar a database
    const searchResponse = await notion.search({
      filter: { property: 'object', value: 'page' },
      page_size: 1,
    });

    let parentPageId: string | null = null;

    if (searchResponse.results.length > 0) {
      const page = searchResponse.results[0] as unknown as { id: string };
      parentPageId = page.id;
    }

    const databaseName = 'DoraDP - Agenda DP';

    // Se não encontrou página pai, criar uma página raiz primeiro
    if (!parentPageId) {
      const newPage = await notion.pages.create({
        parent: { workspace: true } as Parameters<typeof notion.pages.create>[0]['parent'],
        properties: {
          title: { title: [{ text: { content: 'DoraDP' } }] },
        },
      }) as unknown as { id: string };
      parentPageId = newPage.id;
    }

    // Criar a database com os campos necessários
    const database = await notion.databases.create({
      parent: { type: 'page_id', page_id: parentPageId },
      title: [{ type: 'text', text: { content: databaseName } }],
      properties: {
        Nome: { title: {} },
        Data: { date: {} },
        Tipo: {
          select: {
            options: [
              { name: 'audiencia', color: 'red' },
              { name: 'reuniao', color: 'blue' },
              { name: 'prazo', color: 'yellow' },
              { name: 'compromisso', color: 'green' },
              { name: 'outro', color: 'gray' },
            ],
          },
        },
        Status: {
          select: {
            options: [
              { name: 'a fazer', color: 'red' },
              { name: 'em andamento', color: 'yellow' },
              { name: 'concluído', color: 'green' },
            ],
          },
        },
        Descrição: { rich_text: {} },
        Local: { rich_text: {} },
        Empresa: { rich_text: {} },
      },
    } as unknown as Parameters<typeof notion.databases.create>[0]) as unknown as { id: string };

    console.log(`Notion: Database criada automaticamente: ${databaseName} (${database.id})`);

    return {
      success: true,
      data: { id: database.id, name: databaseName },
    };
  } catch (error) {
    console.error('Erro ao criar database no Notion:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro ao criar database',
    };
  }
}
