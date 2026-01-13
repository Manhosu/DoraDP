import express from 'express';
import { env } from './config/env.js';
import { webhookRouter, authRouter, adminRouter, testRouter, shortlinkRouter } from './routes/index.js';
import { startReminderScheduler } from './services/reminder-scheduler.js';

const app = express();

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging de requisições (simples)
app.use((req, _res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: env.nodeEnv,
    version: '1.0.0',
  });
});

// Rotas
app.use('/webhook', webhookRouter);
app.use('/auth', authRouter);
app.use('/admin', adminRouter);
app.use('/test', testRouter);
app.use('/', shortlinkRouter); // Links curtos: /g/:phone

// Rota raiz
app.get('/', (_req, res) => {
  res.json({
    name: 'DoraDP - Assistente de Departamento Pessoal',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      webhook: '/webhook',
      auth: '/auth/google',
      admin: '/admin (requer autenticação)',
      test: '/test (apenas em desenvolvimento)',
    },
  });
});

// Error handler global
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Erro não tratado:', err);
  res.status(500).json({
    error: 'Erro interno do servidor',
    message: env.nodeEnv === 'development' ? err.message : undefined,
  });
});

// Iniciar servidor
const PORT = env.port;

app.listen(PORT, () => {
  console.log('');
  console.log('='.repeat(50));
  console.log('🚀 DoraDP - Assistente de Departamento Pessoal');
  console.log('='.repeat(50));
  console.log(`📍 Servidor: http://localhost:${PORT}`);
  console.log(`🌍 Ambiente: ${env.nodeEnv}`);
  console.log('');
  console.log('📌 Endpoints:');
  console.log(`   GET  /health          - Health check`);
  console.log(`   POST /webhook         - Webhook WhatsApp`);
  console.log(`   GET  /auth/google     - OAuth Google`);
  console.log(`   *    /admin/*         - Administração`);
  if (env.nodeEnv === 'development') {
    console.log(`   *    /test/*          - Testes (dev only)`);
  }
  console.log('='.repeat(50));
  console.log('');

  // Iniciar scheduler de lembretes
  startReminderScheduler();
});

export default app;
