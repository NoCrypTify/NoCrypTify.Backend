import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import notesRoutes from './notes/notesRoutes.js';

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: true });

  app.register(cors, { origin: true });

  app.get('/health', async () => ({ status: 'ok' }));

  app.register(notesRoutes);

  return app;
}
