import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: { id: string; email: string };
  }
}

export default fp(async (app: FastifyInstance) => {
  await app.register(jwt, { secret: process.env.JWT_SECRET ?? 'dev-secret-change-me' });
  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Invalid or missing token' } });
    }
  });
});
