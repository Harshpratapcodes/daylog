import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { buildTree, computeGaps, type ActivityRow } from '../services/dayTree.js';

const ACTIVITY_ROWS_SQL = `
  SELECT a.id, a.parent_id, a.name, a.start_min, a.end_min, a.duration_min,
         c.id AS category_id, c.name AS category_name, c.color AS category_color
  FROM activities a
  JOIN categories c ON c.id = a.category_id
  WHERE a.day_id = $1
  ORDER BY a.start_min, a.sort_order`;

export async function loadDayResponse(dayRow: any) {
  const rows = await pool.query<ActivityRow>(ACTIVITY_ROWS_SQL, [dayRow.id]);
  const tree = buildTree(rows.rows);
  const computed = computeGaps(tree);
  return {
    id: dayRow.id,
    log_date: dayRow.log_date,
    status: dayRow.status,
    reflection_note: dayRow.reflection_note,
    activities: tree,
    computed: { total_logged_min: computed.total_logged_min, unaccounted_min: computed.unaccounted_min, gaps: computed.gaps },
  };
}

export default async function dayRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  app.get('/days', async (req) => {
    const { from, to } = req.query as { from?: string; to?: string };
    const r = await pool.query(
      `SELECT d.id, d.log_date, d.status,
              COALESCE(SUM(a.duration_min) FILTER (WHERE a.parent_id IS NULL), 0)::int AS total_logged_min
       FROM days d
       LEFT JOIN activities a ON a.day_id = d.id
       WHERE d.user_id = $1
         AND ($2::date IS NULL OR d.log_date >= $2)
         AND ($3::date IS NULL OR d.log_date <= $3)
       GROUP BY d.id ORDER BY d.log_date DESC`,
      [req.user.id, from ?? null, to ?? null]
    );
    return { days: r.rows };
  });

  app.get('/days/:date', async (req, reply) => {
    const { date } = req.params as { date: string };
    const r = await pool.query(
      'SELECT id, log_date, status, reflection_note FROM days WHERE user_id = $1 AND log_date = $2',
      [req.user.id, date]
    );
    if (!r.rowCount) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'No log for this date' } });
    return loadDayResponse(r.rows[0]);
  });

  app.post('/days', {
    schema: { body: { type: 'object', required: ['log_date'], properties: { log_date: { type: 'string', format: 'date' } } } },
  }, async (req) => {
    const { log_date } = req.body as { log_date: string };
    const r = await pool.query(
      `INSERT INTO days (user_id, log_date) VALUES ($1, $2)
       ON CONFLICT (user_id, log_date) DO UPDATE SET user_id = EXCLUDED.user_id
       RETURNING id, log_date, status, reflection_note`,
      [req.user.id, log_date]
    );
    return loadDayResponse(r.rows[0]);
  });

  app.patch('/days/:id', {
    schema: {
      body: {
        type: 'object',
        properties: {
          reflection_note: { type: ['string', 'null'] },
          status: { type: 'string', enum: ['draft', 'finalized'] },
        },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { reflection_note, status } = req.body as { reflection_note?: string | null; status?: string };
    const r = await pool.query(
      `UPDATE days SET
         reflection_note = COALESCE($3, reflection_note),
         status = COALESCE($4, status),
         finalized_at = CASE WHEN $4 = 'finalized' THEN now() WHEN $4 = 'draft' THEN NULL ELSE finalized_at END
       WHERE id = $1 AND user_id = $2
       RETURNING id, log_date, status, reflection_note`,
      [id, req.user.id, reflection_note ?? null, status ?? null]
    );
    if (!r.rowCount) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Day not found' } });
    return loadDayResponse(r.rows[0]);
  });

  app.delete('/days/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const r = await pool.query('DELETE FROM days WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (!r.rowCount) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Day not found' } });
    return { deleted: true };
  });
}
