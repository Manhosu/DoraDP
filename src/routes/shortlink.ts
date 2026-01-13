import { Router, Request, Response } from 'express';
import { env } from '../config/env.js';

const router = Router();

/**
 * GET /g/:phone - Redireciona para OAuth do Google
 * Link curto: /g/5541999999999
 */
router.get('/g/:phone', (req: Request, res: Response) => {
  const phone = req.params.phone;

  if (!phone || phone.length < 10) {
    res.status(400).send('Número inválido');
    return;
  }

  res.redirect(`/auth/google?whatsapp=${phone}`);
});

export default router;
