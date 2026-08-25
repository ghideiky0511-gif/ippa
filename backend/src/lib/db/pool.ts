import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import path from 'node:path';

let pool: Pool | undefined;
let controlPool: Pool | undefined;
let supabaseCa: string | undefined;

function databaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL não está configurada.');
  return value;
}

/** Supabase assina o pooler com uma CA própria, fora do bundle padrão do Node. */
function sslConfig(): { ca: string; rejectUnauthorized: true } | undefined {
  if (process.env.DATABASE_SSL !== 'true') return undefined;
  if (!supabaseCa) {
    supabaseCa = readFileSync(path.join(process.cwd(), 'db', 'certs', 'supabase-root-2021-ca.crt'), 'utf8');
  }
  return { ca: supabaseCa, rejectUnauthorized: true };
}

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl(),
      max: Number(process.env.DATABASE_POOL_MAX || 10),
      idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 30_000),
      connectionTimeoutMillis: Number(process.env.DATABASE_CONNECT_TIMEOUT_MS || 5_000),
      statement_timeout: Number(process.env.DATABASE_STATEMENT_TIMEOUT_MS || 10_000),
      application_name: 'ippa-backend',
      ssl: sslConfig(),
    });
    pool.on('error', (error) => console.error('Conexão PostgreSQL ociosa falhou.', error));
  }
  return pool;
}

export function getControlPool(): Pool {
  if (!controlPool) {
    const connectionString = process.env.CONTROL_DATABASE_URL;
    if (!connectionString) throw new Error('CONTROL_DATABASE_URL não está configurada.');
    controlPool = new Pool({
      connectionString,
      max: Number(process.env.CONTROL_DATABASE_POOL_MAX || 3),
      idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 30_000),
      connectionTimeoutMillis: Number(process.env.DATABASE_CONNECT_TIMEOUT_MS || 5_000),
      statement_timeout: Number(process.env.DATABASE_STATEMENT_TIMEOUT_MS || 10_000),
      application_name: 'ippa-control',
      ssl: sslConfig(),
    });
    controlPool.on('error', (error) => console.error('Conexão PostgreSQL do control plane falhou.', error));
  }
  return controlPool;
}
