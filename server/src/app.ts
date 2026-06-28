import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import authPlugin from './plugins/auth.js';
import authRoutes from './routes/auth.js';
import dayRoutes from './routes/days.js';
import activityRoutes from './routes/activities.js';
import categoryRoutes from './routes/categories.js';
import analyticsRoutes from './routes/analytics.js';

export function buildApp() {
  const app = Fastify({ logger: true });
  app.register(authPlugin);
  app.register(async (api) => {
    api.register(authRoutes);
    api.register(dayRoutes);
    api.register(activityRoutes);
    api.register(categoryRoutes);
    api.register(analyticsRoutes);
  }, { prefix: '/api/v1' });
  app.get('/health', async () => ({ ok: true }));

  // In production the built client is served from the same origin, so the
  // client's relative /api/v1 calls work without CORS. Self-gates on the
  // build output existing, so local dev (Vite proxy) is unaffected.
  const clientDist = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'client', 'dist');
  if (existsSync(clientDist)) {
    app.register(fastifyStatic, { root: clientDist });
    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url?.startsWith('/api')) {
        reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
        return;
      }
      reply.sendFile('index.html'); // SPA fallback for client-side routes
    });
  }

  return app;
}
