import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import {
  ValidationError,
  assertWithinParent,
  assertNoSiblingOverlap,
  assertDepth,
  findChildrenOutOfBounds,
  type Range,
} from '../services/validation.js';

interface ActivityInput {
  name: string;
  category_id: number;
  start_min: number;
  end_min: number;
  parent_id?: string | null;
}

const ACTIVITY_BODY = {
  type: 'object',
  required: ['name', 'category_id', 'start_min', 'end_min'],
  properties: {
    name: { type: 'string', minLength: 1 },
    category_id: { type: 'integer' },
    start_min: { type: 'integer', minimum: 0, maximum: 1439 },
    end_min: { type: 'integer', minimum: 1, maximum: 1440 },
    parent_id: { type: ['string', 'null'] },
  },
};

async function assertDayOwned(client: any, dayId: string, userId: string) {
  const r = await client.query('SELECT id FROM days WHERE id = $1 AND user_id = $2', [dayId, userId]);
  if (!r.rowCount) throw Object.assign(new Error('Day not found'), { statusCode: 404, code: 'NOT_FOUND' });
}

async function assertCategoryOwned(client: any, categoryId: number, userId: string) {
  const r = await client.query('SELECT id FROM categories WHERE id = $1 AND user_id = $2', [categoryId, userId]);
  if (!r.rowCount) throw new ValidationError('CATEGORY_FORBIDDEN' as any, 'Category does not belong to this user');
}

/** Validate one candidate (V1–V4, V6) against current DB state, inside a transaction. */
async function validatePlacement(client: any, dayId: string, userId: string, input: ActivityInput, excludeId: string | null) {
  await assertCategoryOwned(client, input.category_id, userId);
  const candidate: Range = { id: excludeId ?? undefined, startMin: input.start_min, endMin: input.end_min };

  if (input.end_min <= input.start_min) {
    throw new ValidationError('SIBLING_OVERLAP' as any, 'End must be after start'); // schema also blocks; defensive
  }

  if (input.parent_id) {
    const p = await client.query(
      'SELECT id, parent_id, start_min, end_min FROM activities WHERE id = $1 AND day_id = $2',
      [input.parent_id, dayId]
    );
    if (!p.rowCount) throw Object.assign(new Error('Parent activity not found'), { statusCode: 404, code: 'NOT_FOUND' });
    assertDepth(p.rows[0].parent_id !== null);                                   // V4
    assertWithinParent(candidate, { startMin: p.rows[0].start_min, endMin: p.rows[0].end_min }); // V1
  }

  const siblings = await client.query(
    `SELECT id, start_min, end_min FROM activities
     WHERE day_id = $1 AND parent_id IS NOT DISTINCT FROM $2 AND ($3::uuid IS NULL OR id <> $3)`,
    [dayId, input.parent_id ?? null, excludeId]
  );
  assertNoSiblingOverlap(
    candidate,
    siblings.rows.map((s: any) => ({ id: s.id, startMin: s.start_min, endMin: s.end_min }))
  ); // V2/V3
}

function sendValidationError(reply: any, e: ValidationError) {
  return reply.code(422).send({ error: { code: e.code, message: e.message, details: e.details ?? {} } });
}

export default async function activityRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  app.post('/days/:dayId/activities', { schema: { body: ACTIVITY_BODY } }, async (req, reply) => {
    const { dayId } = req.params as { dayId: string };
    const input = req.body as ActivityInput;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await assertDayOwned(client, dayId, req.user.id);
      await validatePlacement(client, dayId, req.user.id, input, null);
      const r = await client.query(
        `INSERT INTO activities (day_id, parent_id, name, category_id, start_min, end_min)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [dayId, input.parent_id ?? null, input.name, input.category_id, input.start_min, input.end_min]
      );
      await client.query('COMMIT');
      return reply.code(201).send(r.rows[0]);
    } catch (e: any) {
      await client.query('ROLLBACK');
      if (e instanceof ValidationError) return sendValidationError(reply, e);
      if (e.statusCode) return reply.code(e.statusCode).send({ error: { code: e.code, message: e.message } });
      throw e;
    } finally {
      client.release();
    }
  });

  // Batch create — all-or-nothing commit of a full logging session (Design Doc §4.3).
  // Items are inserted in order; an item may reference an earlier item as parent via client_parent_index.
  app.post('/days/:dayId/activities/batch', {
    schema: {
      body: {
        type: 'object',
        required: ['items'],
        properties: {
          items: {
            type: 'array',
            minItems: 1,
            maxItems: 100,
            items: { ...ACTIVITY_BODY, properties: { ...ACTIVITY_BODY.properties, client_parent_index: { type: ['integer', 'null'] } } },
          },
        },
      },
    },
  }, async (req, reply) => {
    const { dayId } = req.params as { dayId: string };
    const { items } = req.body as { items: Array<ActivityInput & { client_parent_index?: number | null }> };
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await assertDayOwned(client, dayId, req.user.id);
      const createdIds: string[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const parentId =
          item.client_parent_index != null
            ? createdIds[item.client_parent_index] ?? null
            : item.parent_id ?? null;
        if (item.client_parent_index != null && !parentId) {
          throw Object.assign(new Error(`Item ${i}: client_parent_index must reference an earlier item`), { statusCode: 400, code: 'BAD_PARENT_INDEX' });
        }
        const resolved = { ...item, parent_id: parentId };
        await validatePlacement(client, dayId, req.user.id, resolved, null);
        const r = await client.query(
          `INSERT INTO activities (day_id, parent_id, name, category_id, start_min, end_min, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [dayId, parentId, item.name, item.category_id, item.start_min, item.end_min, i]
        );
        createdIds.push(r.rows[0].id);
      }
      await client.query('COMMIT');
      return reply.code(201).send({ created: createdIds });
    } catch (e: any) {
      await client.query('ROLLBACK');
      if (e instanceof ValidationError) return sendValidationError(reply, e);
      if (e.statusCode) return reply.code(e.statusCode).send({ error: { code: e.code, message: e.message } });
      throw e;
    } finally {
      client.release();
    }
  });

  app.patch('/activities/:id', {
    schema: { body: { ...ACTIVITY_BODY, required: [] } },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const patch = req.body as Partial<ActivityInput>;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const cur = await client.query(
        `SELECT a.* FROM activities a JOIN days d ON d.id = a.day_id
         WHERE a.id = $1 AND d.user_id = $2 FOR UPDATE`,
        [id, req.user.id]
      );
      if (!cur.rowCount) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Activity not found' } });
      }
      const a = cur.rows[0];
      const next: ActivityInput = {
        name: patch.name ?? a.name,
        category_id: patch.category_id ?? a.category_id,
        start_min: patch.start_min ?? a.start_min,
        end_min: patch.end_min ?? a.end_min,
        parent_id: patch.parent_id !== undefined ? patch.parent_id : a.parent_id,
      };
      if (next.parent_id === id) {
        await client.query('ROLLBACK');
        return reply.code(422).send({ error: { code: 'MAX_DEPTH_EXCEEDED', message: 'Activity cannot be its own parent' } });
      }
      await validatePlacement(client, a.day_id, req.user.id, next, id);

      // V5 — children must still fit if this is a parent being moved/resized.
      const children = await client.query('SELECT id, start_min, end_min FROM activities WHERE parent_id = $1', [id]);
      const conflicting = findChildrenOutOfBounds(
        { startMin: next.start_min, endMin: next.end_min },
        children.rows.map((c: any) => ({ id: c.id, startMin: c.start_min, endMin: c.end_min }))
      );
      if (conflicting.length) {
        await client.query('ROLLBACK');
        return reply.code(409).send({
          error: {
            code: 'CHILDREN_CONFLICT',
            message: 'New time range would leave sub-activities outside the parent',
            details: { conflicting_child_ids: conflicting.map(c => c.id) },
          },
        });
      }

      const r = await client.query(
        `UPDATE activities SET name = $2, category_id = $3, start_min = $4, end_min = $5, parent_id = $6
         WHERE id = $1 RETURNING *`,
        [id, next.name, next.category_id, next.start_min, next.end_min, next.parent_id ?? null]
      );
      await client.query('COMMIT');
      return r.rows[0];
    } catch (e: any) {
      await client.query('ROLLBACK');
      if (e instanceof ValidationError) return sendValidationError(reply, e);
      if (e.statusCode) return reply.code(e.statusCode).send({ error: { code: e.code, message: e.message } });
      throw e;
    } finally {
      client.release();
    }
  });

  app.delete('/activities/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const r = await pool.query(
      `DELETE FROM activities a USING days d
       WHERE a.id = $1 AND a.day_id = d.id AND d.user_id = $2`,
      [id, req.user.id]
    );
    if (!r.rowCount) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Activity not found' } });
    return { deleted: true };
  });

  // Autocomplete (Design Doc §4.6)
  app.get('/activities/suggest', async (req) => {
    const { q } = req.query as { q?: string };
    if (!q || q.length < 2) return { suggestions: [] };
    const r = await pool.query(
      `SELECT a.name, a.category_id, c.name AS category_name, c.color AS category_color,
              COUNT(*)::int AS times_used, ROUND(AVG(a.duration_min))::int AS typical_duration_min
       FROM activities a
       JOIN days d ON d.id = a.day_id
       JOIN categories c ON c.id = a.category_id
       WHERE d.user_id = $1 AND a.name ILIKE $2 AND c.archived_at IS NULL
       GROUP BY a.name, a.category_id, c.name, c.color
       ORDER BY times_used DESC, a.name
       LIMIT 8`,
      [req.user.id, `${q}%`]
    );
    return { suggestions: r.rows };
  });
}
