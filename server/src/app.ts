import Fastify from 'fastify';
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
  return app;
}
