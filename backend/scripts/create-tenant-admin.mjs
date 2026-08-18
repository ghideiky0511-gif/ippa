import { Client } from 'pg';
import { hash } from '@node-rs/argon2';

const connectionString = process.env.MIGRATIONS_DATABASE_URL || process.env.DATABASE_URL;
const slug = process.env.TENANT_SLUG;
const name = process.env.TENANT_NAME || slug;
const adminName = process.env.TENANT_ADMIN_NAME;
const adminEmail = process.env.TENANT_ADMIN_EMAIL;
const adminPassword = process.env.TENANT_ADMIN_PASSWORD;

if (!connectionString) throw new Error('Defina MIGRATIONS_DATABASE_URL ou DATABASE_URL.');
if (!slug || !adminName || !adminEmail || !adminPassword) {
  throw new Error('Defina TENANT_SLUG, TENANT_ADMIN_NAME, TENANT_ADMIN_EMAIL e TENANT_ADMIN_PASSWORD.');
}

const client = new Client({ connectionString, application_name: 'ippa-create-tenant-admin' });
await client.connect();
try {
  await client.query('BEGIN');

  // Cria o tenant se ainda não existir; se já existir, só garante o nome.
  const tenantResult = await client.query(
    `INSERT INTO tenants (slug, name, active, status) VALUES ($1, $2, true, 'active')
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [slug, name],
  );
  const tenantId = tenantResult.rows[0].id;

  // Necessário para passar pela Row-Level Security ao gravar em `users`.
  await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
  await client.query("SELECT set_config('app.role', 'administrador', true)");

  const passwordHash = await hash(adminPassword);
  await client.query(
    `INSERT INTO users (tenant_id, email, name, role, password_hash, permissions)
     VALUES ($1, $2, $3, 'administrador', $4, '{"adminAccess": true, "catalogAreas": []}'::jsonb)
     ON CONFLICT (tenant_id, email) WHERE deleted_at IS NULL DO UPDATE
       SET name = EXCLUDED.name, role = EXCLUDED.role, password_hash = EXCLUDED.password_hash,
           permissions = EXCLUDED.permissions, deleted_at = NULL`,
    [tenantId, adminEmail.trim().toLowerCase(), adminName.trim(), passwordHash],
  );

  await client.query(
    `INSERT INTO store_settings (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING`,
    [tenantId],
  );
  const locationResult = await client.query(
    `INSERT INTO inventory_locations (tenant_id, code, name, kind, is_default)
     VALUES ($1, 'default', 'Depósito padrão', 'warehouse', true)
     ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [tenantId],
  );
  await client.query(
    `UPDATE store_settings
     SET default_inventory_location_id = COALESCE(default_inventory_location_id, $2)
     WHERE tenant_id = $1`,
    [tenantId, locationResult.rows[0].id],
  );

  await client.query('COMMIT');
  console.log(`Tenant "${slug}" e administrador ${adminEmail} prontos.`);
  console.log(`Login: http://localhost:3010/${slug}/workspace/login`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
