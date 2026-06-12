import 'dotenv/config';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const run = async () => {
  await pool.query(
    'CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())'
  );
  for (const file of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    const done = await pool.query('SELECT 1 FROM _migrations WHERE name = $1', [file]);
    if (done.rowCount) continue;
    console.log('applying', file);
    const sql = readFileSync(join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  await pool.end();
  console.log('migrations up to date');
};
run().catch(e => { console.error(e); process.exit(1); });
