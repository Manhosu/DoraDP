import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';

/**
 * Valida a assinatura do webhook do WhatsApp
 * O WhatsApp envia um header X-Hub-Signature-256 com HMAC SHA256 do payload
 */
export function validateWhatsAppSignature(
  payload: string,
  signature: string | undefined
): boolean {
  if (!env.whatsappAppSecret) {
    // Se não tiver app secret configurado, pula validação (desenvolvimento)
    console.warn('WHATSAPP_APP_SECRET não configurado - pulando validação de assinatura');
    return true;
  }

  if (!signature) {
    return false;
  }

  // Formato: sha256=xxxxx
  const expectedSignature = signature.replace('sha256=', '');

  const hmac = crypto.createHmac('sha256', env.whatsappAppSecret);
  hmac.update(payload);
  const calculatedSignature = hmac.digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(calculatedSignature)
  );
}

/**
 * Middleware para validar assinatura do WhatsApp
 */
export function whatsappSignatureMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Apenas validar em POST requests
  if (req.method !== 'POST') {
    next();
    return;
  }

  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  const payload = JSON.stringify(req.body);

  if (!validateWhatsAppSignature(payload, signature)) {
    console.error('Assinatura do webhook inválida');
    res.status(401).json({ error: 'Assinatura inválida' });
    return;
  }

  next();
}

// --- Rate Limiting ---

interface RateLimitEntry {
  count: number;
  firstRequest: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Configurações de rate limit
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minuto
const RATE_LIMIT_MAX_REQUESTS = 30; // 30 requests por minuto por IP/número

/**
 * Limpa entradas expiradas do rate limit store
 */
function cleanupRateLimitStore(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now - entry.firstRequest > RATE_LIMIT_WINDOW_MS) {
      rateLimitStore.delete(key);
    }
  }
}

// Limpar a cada 5 minutos
setInterval(cleanupRateLimitStore, 5 * 60 * 1000);

/**
 * Verifica se uma chave atingiu o rate limit
 */
export function checkRateLimit(key: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now - entry.firstRequest > RATE_LIMIT_WINDOW_MS) {
    // Nova janela
    rateLimitStore.set(key, { count: 1, firstRequest: now });
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1 };
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - entry.count };
}

/**
 * Middleware de rate limiting
 */
export function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Usar IP como chave (em produção, pode usar também o número do WhatsApp)
  const key = req.ip || req.socket.remoteAddress || 'unknown';

  const { allowed, remaining } = checkRateLimit(key);

  // Adicionar headers de rate limit
  res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX_REQUESTS);
  res.setHeader('X-RateLimit-Remaining', remaining);

  if (!allowed) {
    console.warn(`Rate limit excedido para ${key}`);
    res.status(429).json({
      error: 'Muitas requisições. Tente novamente em alguns instantes.',
    });
    return;
  }

  next();
}

/**
 * Rate limit específico por número de WhatsApp (para usar no handler de mensagens)
 */
export function checkWhatsAppRateLimit(whatsappNumber: string): boolean {
  const key = `whatsapp:${whatsappNumber}`;
  const { allowed } = checkRateLimit(key);
  return allowed;
}
