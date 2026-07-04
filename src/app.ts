import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import notesRoutes from './notes/notesRoutes.js';

export function buildApp(options: { logger?: boolean } = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? true });

  app.register(cors, { origin: true });

  app.get('/health', async () => ({ status: 'ok' }));

  app.register(notesRoutes);

  return app;
}
