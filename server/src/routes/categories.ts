import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';

const CATEGORY_COLS = 'id, name, color, is_system, (archived_at IS NOT NULL) AS archived';

/**
 * Categories are soft-deletable: DELETE on a category that activities still
 * reference archives it instead of removing the row, so every past day keeps
 * its name and color in reviews, analytics, and export. Archived categories
 * are returned with `archived: true` and the client hides them from logging
 * affordances; they can be restored (PATCH { archived: false }) or revived by
 * creating a category with the same name.
 */
export default async function categoryRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  app.get('/categories', async (req) => {
    const r = await pool.query(
      `SELECT ${CATEGORY_COLS} FROM categories WHERE user_id = $1 ORDER BY (archived_at IS NOT NULL), id`,
      [req.user.id]
    );
    return { categories: r.rows };
  });

  app.post('/categories', {
    schema: { body: { type: 'object', required: ['name', 'color'], properties: { name: { type: 'string', minLength: 1 }, color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' } } } },
  }, async (req, reply) => {
    const { name, color } = req.body as { name: string; color: string };
    // Re-creating a deleted (archived) category restores it — its history is still attached.
    const revived = await pool.query(
      `UPDATE categories SET archived_at = NULL, color = $3
       WHERE user_id = $1 AND lower(name) = lower($2) AND archived_at IS NOT NULL
       RETURNING ${CATEGORY_COLS}`,
      [req.user.id, name, color]
    );
    if (revived.rowCount) return reply.code(201).send(revived.rows[0]);
    try {
      const r = await pool.query(
        `INSERT INTO categories (user_id, name, color) VALUES ($1, $2, $3) RETURNING ${CATEGORY_COLS}`,
        [req.user.id, name, color]
      );
      return reply.code(201).send(r.rows[0]);
    } catch (e: any) {
      if (e.code === '23505') return reply.code(409).send({ error: { code: 'DUPLICATE_CATEGORY', message: 'Category name already exists' } });
      throw e;
    }
  });

  app.patch('/categories/:id', {
    schema: { body: { type: 'object', properties: { name: { type: 'string', minLength: 1 }, color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' }, archived: { type: 'boolean' } } } },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { name, color, archived } = req.body as { name?: string; color?: string; archived?: boolean };
    try {
      const r = await pool.query(
        `UPDATE categories SET
           name = COALESCE($3, name),
           color = COALESCE($4, color),
           archived_at = CASE WHEN $5::boolean IS NULL THEN archived_at
                              WHEN $5 THEN COALESCE(archived_at, now())
                              ELSE NULL END
         WHERE id = $1 AND user_id = $2 RETURNING ${CATEGORY_COLS}`,
        [id, req.user.id, name ?? null, color ?? null, archived ?? null]
      );
      if (!r.rowCount) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Category not found' } });
      return r.rows[0];
    } catch (e: any) {
      if (e.code === '23505') return reply.code(409).send({ error: { code: 'DUPLICATE_CATEGORY', message: 'Category name already exists' } });
      throw e;
    }
  });

  app.delete('/categories/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const cur = await pool.query('SELECT id FROM categories WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (!cur.rowCount) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Category not found' } });
    const used = await pool.query('SELECT 1 FROM activities WHERE category_id = $1 LIMIT 1', [id]);
    if (used.rowCount) {
      // In use by past days → archive so those days keep their colors & names everywhere.
      await pool.query('UPDATE categories SET archived_at = COALESCE(archived_at, now()) WHERE id = $1', [id]);
      return { deleted: false, archived: true };
    }
    await pool.query('DELETE FROM categories WHERE id = $1', [id]);
    return { deleted: true, archived: false };
  });
}
