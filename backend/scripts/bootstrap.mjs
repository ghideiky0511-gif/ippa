import { Client } from 'pg';
import { hash } from '@node-rs/argon2';

const connectionString = process.env.MIGRATIONS_DATABASE_URL || process.env.DATABASE_URL;
const slug = process.env.INITIAL_TENANT_SLUG;
const name = process.env.INITIAL_TENANT_NAME;
const adminEmail = process.env.INITIAL_ADMIN_EMAIL;
const adminPassword = process.env.INITIAL_ADMIN_PASSWORD;

if (!connectionString) throw new Error('Defina MIGRATIONS_DATABASE_URL ou DATABASE_URL.');
if (!slug || !name || !adminEmail || !adminPassword) {
  throw new Error('Defina INITIAL_TENANT_SLUG, INITIAL_TENANT_NAME, INITIAL_ADMIN_EMAIL e INITIAL_ADMIN_PASSWORD.');
}

const client = new Client({ connectionString, application_name: 'ippa-bootstrap' });
await client.connect();
try {
  await client.query('BEGIN');
  const tenantResult = await client.query(
    `INSERT INTO tenants (slug, name) VALUES ($1, $2)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [slug, name],
  );
  const tenantId = tenantResult.rows[0].id;
  await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
  await client.query("SELECT set_config('app.role', 'administrador', true)");
  const passwordHash = await hash(adminPassword);
  await client.query(
    `INSERT INTO users (tenant_id, email, name, role, password_hash)
     VALUES ($1, $2, $3, 'administrador', $4)
     ON CONFLICT (tenant_id, email) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, password_hash = EXCLUDED.password_hash`,
    [tenantId, adminEmail.trim().toLowerCase(), 'Administrador', passwordHash],
  );
  await client.query(
    `INSERT INTO store_settings (tenant_id)
     VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING`,
    [tenantId],
  );
  await client.query('COMMIT');
  console.log(`Bootstrap concluído para o tenant ${slug}.`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
