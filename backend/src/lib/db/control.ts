import type { PoolClient } from 'pg';
import { getControlPool } from './pool';

export async function withControlTransaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getControlPool().connect();
  try {
    await client.query('BEGIN');
    const value = await operation(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
