import { Pool } from 'pg';

let pool: Pool | undefined;

function databaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL não está configurada.');
  return value;
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
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
    });
    pool.on('error', (error) => console.error('Conexão PostgreSQL ociosa falhou.', error));
  }
  return pool;
}
