import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { buildTree, type ActivityRow } from '../services/dayTree.js';
import { categoryBreakdown, contextSwitchCount, longestFocusBlockMin } from '../services/analytics.js';

const ROWS_SQL = `
  SELECT a.id, a.parent_id, a.name, a.start_min, a.end_min, a.duration_min,
         c.id AS category_id, c.name AS category_name, c.color AS category_color
  FROM activities a JOIN categories c ON c.id = a.category_id
  WHERE a.day_id = $1 ORDER BY a.start_min, a.sort_order`;

async function dayAnalytics(dayId: string) {
  const rows = await pool.query<ActivityRow>(ROWS_SQL, [dayId]);
  const tree = buildTree(rows.rows);
  return {
    category_breakdown_min: categoryBreakdown(tree),
    context_switches: contextSwitchCount(tree),
    longest_focus_block_min: longestFocusBlockMin(tree),
  };
}

export default async function analyticsRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  app.get('/analytics/day/:date', async (req, reply) => {
    const { date } = req.params as { date: string };
    const d = await pool.query('SELECT id FROM days WHERE user_id = $1 AND log_date = $2', [req.user.id, date]);
    if (!d.rowCount) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'No log for this date' } });
    return { date, ...(await dayAnalytics(d.rows[0].id)) };
  });

  app.get('/analytics/range', async (req) => {
    const { from, to } = req.query as { from?: string; to?: string };
    const days = await pool.query(
      `SELECT id, log_date FROM days WHERE user_id = $1
         AND ($2::date IS NULL OR log_date >= $2) AND ($3::date IS NULL OR log_date <= $3)
       ORDER BY log_date`,
      [req.user.id, from ?? null, to ?? null]
    );
    const series = [];
    const categoryTotals: Record<string, number> = {};
    for (const d of days.rows) {
      const a = await dayAnalytics(d.id);
      series.push({ date: d.log_date, ...a });
      for (const [cat, min] of Object.entries(a.category_breakdown_min)) {
        categoryTotals[cat] = (categoryTotals[cat] ?? 0) + min;
      }
    }
    const recurring = await pool.query(
      `SELECT a.name, SUM(a.duration_min)::int AS total_min, COUNT(*)::int AS sessions,
              ROUND(AVG(a.duration_min))::int AS avg_session_min
       FROM activities a JOIN days d ON d.id = a.day_id
       WHERE d.user_id = $1
         AND ($2::date IS NULL OR d.log_date >= $2) AND ($3::date IS NULL OR d.log_date <= $3)
       GROUP BY a.name HAVING COUNT(*) > 1
       ORDER BY total_min DESC LIMIT 10`,
      [req.user.id, from ?? null, to ?? null]
    );
    return { series, category_totals_min: categoryTotals, recurring_activities: recurring.rows };
  });

  // Export (Design Doc §4.6)
  app.get('/export', async (req) => {
    const days = await pool.query('SELECT * FROM days WHERE user_id = $1 ORDER BY log_date', [req.user.id]);
    const activities = await pool.query(
      `SELECT a.* FROM activities a JOIN days d ON d.id = a.day_id WHERE d.user_id = $1 ORDER BY d.log_date, a.start_min`,
      [req.user.id]
    );
    const categories = await pool.query('SELECT id, name, color, is_system FROM categories WHERE user_id = $1', [req.user.id]);
    return { exported_at: new Date().toISOString(), days: days.rows, activities: activities.rows, categories: categories.rows };
  });
}
