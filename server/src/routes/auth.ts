import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';

/** Starter categories — every one of them is editable and deletable. Colors follow the client palette (client/src/lib/palette.ts). */
const DEFAULT_CATEGORIES: Array<[string, string]> = [
  ['Work / office', '#5B8DEF'],
  ['Personal project', '#9B7EDE'],
  ['Health / fitness', '#4CAF82'],
  ['Leisure', '#56B3B4'],
  ['Social / family', '#E07A9B'],
  ['Travel / commute', '#A8B061'],
  ['Wasted / distracted', '#D96C6C'],
  ['Sleep / rest', '#7D8CA3'],
  ['Other', '#A09484'],
];

export default async function authRoutes(app: FastifyInstance) {
  app.post('/auth/register', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          timezone: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const { email, password, timezone } = req.body as { email: string; password: string; timezone?: string };
    const hash = await bcrypt.hash(password, 12);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const u = await client.query(
        'INSERT INTO users (email, password_hash, timezone) VALUES ($1, $2, COALESCE($3, $4)) RETURNING id, email, timezone',
        [email.toLowerCase(), hash, timezone ?? null, 'Asia/Kolkata']
      );
      const user = u.rows[0];
      for (const [name, color] of DEFAULT_CATEGORIES) {
        await client.query(
          'INSERT INTO categories (user_id, name, color) VALUES ($1, $2, $3)',
          [user.id, name, color]
        );
      }
      await client.query('COMMIT');
      const token = app.jwt.sign({ id: user.id, email: user.email });
      return { token, user };
    } catch (e: any) {
      await client.query('ROLLBACK');
      if (e.code === '23505') return reply.code(409).send({ error: { code: 'EMAIL_TAKEN', message: 'Email already registered' } });
      throw e;
    } finally {
      client.release();
    }
  });

  app.post('/auth/login', {
    schema: {
      body: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string' }, password: { type: 'string' } } },
    },
  }, async (req, reply) => {
    const { email, password } = req.body as { email: string; password: string };
    const r = await pool.query('SELECT id, email, password_hash FROM users WHERE email = $1', [email.toLowerCase()]);
    const user = r.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return reply.code(401).send({ error: { code: 'BAD_CREDENTIALS', message: 'Invalid email or password' } });
    }
    const token = app.jwt.sign({ id: user.id, email: user.email });
    return { token, user: { id: user.id, email: user.email } };
  });
}
