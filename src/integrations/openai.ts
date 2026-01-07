import OpenAI, { toFile } from 'openai';
import { env } from '../config/env.js';
import type { ExtractedEvent, ServiceResponse } from '../types/index.js';

let openaiClient: OpenAI | null = null;

/**
 * Obtém o cliente OpenAI (singleton)
 */
function getOpenAI(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: env.openaiApiKey,
    });
  }
  return openaiClient;
}

/**
 * Transcreve um arquivo de áudio usando Whisper
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string = 'audio/ogg'
): Promise<ServiceResponse<string>> {
  try {
    const openai = getOpenAI();

    // Determinar extensão baseado no mime type
    const extension = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp3') ? 'mp3' : 'ogg';

    // Usar toFile do SDK para criar arquivo compatível
    const audioFile = await toFile(audioBuffer, `audio.${extension}`, { type: mimeType });

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'pt',
      response_format: 'text',
    });

    return { success: true, data: transcription };
  } catch (error) {
    console.error('Erro ao transcrever áudio:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro ao transcrever áudio',
    };
  }
}

/**
 * Extrai entidades de um texto usando GPT-4o
 */
export async function extractEventFromText(
  text: string,
  userTimezone: string = 'America/Sao_Paulo'
): Promise<ServiceResponse<ExtractedEvent>> {
  try {
    const openai = getOpenAI();

    const now = new Date();
    const currentDateTime = now.toLocaleString('pt-BR', {
      timeZone: userTimezone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const systemPrompt = `Você é um assistente especializado em extrair informações de compromissos de Departamento Pessoal (DP) de mensagens em português brasileiro.

CONTEXTO:
- Data e hora atual: ${currentDateTime}
- Timezone do usuário: ${userTimezone}

TAREFA:
Analise a mensagem do usuário e extraia as informações do compromisso/prazo de DP no formato JSON especificado.

REGRAS:
1. Para datas relativas (amanhã, próxima segunda, etc.), calcule a data absoluta baseando-se na data atual.
2. Se apenas a data for mencionada sem horário, use 09:00 como padrão.
3. Se a duração não for especificada, assuma 1 hora para reuniões e fim do dia (23:59) para prazos.
4. Identifique o tipo de evento: prazo (folha, férias, rescisão, etc.), reuniao, audiencia, compromisso ou outro.
5. IMPORTANTE: Extraia o nome da EMPRESA/CLIENTE se mencionado na mensagem.
6. Extraia local e participantes se mencionados.
7. Se não conseguir identificar uma data, retorne data_inicio como null.

EXEMPLOS DE EXTRAÇÃO DE EMPRESA:
- "Folha de pagamento empresa Eduardo G dia 30" → empresa: "Eduardo G"
- "Férias do funcionário João da empresa ABC Ltda" → empresa: "ABC Ltda"
- "Rescisão Maria - Padaria do Zé" → empresa: "Padaria do Zé"

FORMATO DE SAÍDA (JSON):
{
  "titulo": "string - título descritivo do compromisso",
  "data_inicio": "string ISO 8601 ou null se não identificado",
  "data_fim": "string ISO 8601 ou null",
  "descricao": "string ou null - detalhes adicionais",
  "tipo_evento": "audiencia|reuniao|prazo|compromisso|outro",
  "local": "string ou null",
  "participantes": ["array de strings"] ou null,
  "empresa": "string ou null - nome da empresa/cliente mencionado"
}

Responda APENAS com o JSON, sem markdown ou explicações.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Resposta vazia da IA');
    }

    const extracted = JSON.parse(content) as ExtractedEvent;

    // Validar se conseguiu extrair a data
    if (!extracted.data_inicio) {
      return {
        success: false,
        error: 'Não foi possível identificar a data do compromisso',
      };
    }

    return { success: true, data: extracted };
  } catch (error) {
    console.error('Erro ao extrair evento:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro ao processar mensagem',
    };
  }
}

/**
 * Identifica se a mensagem é um comando ou um agendamento
 */
export async function classifyMessage(
  text: string
): Promise<ServiceResponse<{ isCommand: boolean; command?: string; intent: string }>> {
  try {
    const openai = getOpenAI();

    const systemPrompt = `Classifique a mensagem do usuário em uma das categorias:

1. "ver_agenda" - usuário quer ver seus compromissos (ex: "ver agenda", "o que tenho hoje", "meus compromissos")
2. "ajuda" - usuário pede ajuda (ex: "ajuda", "help", "como funciona")
3. "agendamento" - usuário quer agendar algo (qualquer menção a datas, compromissos, reuniões, etc.)
4. "saudacao" - apenas saudação sem intenção clara (ex: "oi", "olá", "bom dia")
5. "outro" - não se encaixa em nenhuma categoria

Responda APENAS com JSON:
{
  "isCommand": boolean,
  "command": "ver_agenda|ajuda|null",
  "intent": "ver_agenda|ajuda|agendamento|saudacao|outro"
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      temperature: 0,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Resposta vazia da IA');
    }

    return { success: true, data: JSON.parse(content) };
  } catch (error) {
    console.error('Erro ao classificar mensagem:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro ao classificar mensagem',
    };
  }
}
