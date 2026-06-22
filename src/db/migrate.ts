import { readFileSync } from 'node:fs';
import { pool } from './pool.js';

const sql = readFileSync(new URL('./init.sql', import.meta.url), 'utf8');

async function migrate(): Promise<void> {
  await pool.query(sql);
  console.log('✓ Database schema applied');
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
