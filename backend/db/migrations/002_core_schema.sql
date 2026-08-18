CREATE TYPE user_role AS ENUM ('administrador', 'vendedora', 'expedicao', 'entregador', 'cliente');
CREATE TYPE session_status AS ENUM ('aberto', 'fechado', 'aguardando_pagamento');

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  email text NOT NULL,
  name text NOT NULL,
  role user_role NOT NULL,
  password_hash text NOT NULL,
  client_id uuid,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);

CREATE TABLE user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  cpf_cnpj text,
  email text,
  cep text,
  street text,
  number text,
  complement text,
  neighborhood text,
  city text,
  state text,
  company_responsible text,
  store_name text,
  last_seller_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS DISTINCT (tenant_id, cpf_cnpj)
);

ALTER TABLE users ADD CONSTRAINT users_client_id_fk FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;

CREATE TABLE client_cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  cart_key text NOT NULL,
  product_id uuid,
  snapshot jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_id, cart_key)
);

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL,
  subcategory text,
  collection text,
  brand text,
  sku text,
  price numeric(12,2) NOT NULL CHECK (price >= 0),
  suggested_retail_price numeric(12,2),
  markup numeric(8,3),
  display_position integer,
  media jsonb NOT NULL DEFAULT '{}'::jsonb,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, sku)
);

CREATE TABLE product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  color text NOT NULL,
  size text NOT NULL,
  price numeric(12,2) NOT NULL CHECK (price >= 0),
  availability text NOT NULL CHECK (availability IN ('in_stock', 'preorder', 'backorder', 'out_of_stock')),
  available_from text,
  stock_qty integer CHECK (stock_qty >= 0),
  UNIQUE (tenant_id, product_id, color, size)
);

CREATE TABLE product_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('grade', 'pack')),
  label text NOT NULL,
  color text,
  price numeric(12,2) NOT NULL CHECK (price >= 0)
);

CREATE TABLE product_pack_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pack_id uuid NOT NULL REFERENCES product_packs(id) ON DELETE CASCADE,
  size text NOT NULL,
  color text,
  quantity integer NOT NULL CHECK (quantity > 0)
);

CREATE TABLE store_settings (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  default_markup numeric(8,3),
  assignment_strategy text,
  payment_link_expiration_minutes integer NOT NULL DEFAULT 15 CHECK (payment_link_expiration_minutes > 0),
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  similar_products_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE discounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  label text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  type text NOT NULL CHECK (type IN ('quantity', 'products')),
  percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (percent BETWEEN 0 AND 100)
);

CREATE TABLE discount_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  discount_id uuid NOT NULL REFERENCES discounts(id) ON DELETE CASCADE,
  min_qty integer NOT NULL CHECK (min_qty > 0),
  percent numeric(5,2) NOT NULL CHECK (percent BETWEEN 0 AND 100),
  UNIQUE (tenant_id, discount_id, min_qty)
);

CREATE TABLE discount_products (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  discount_id uuid NOT NULL REFERENCES discounts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  PRIMARY KEY (tenant_id, discount_id, product_id)
);

CREATE TABLE highlights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  label text NOT NULL
);

CREATE TABLE highlight_products (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  highlight_id uuid NOT NULL REFERENCES highlights(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, highlight_id, product_id)
);

CREATE TABLE home_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('banner', 'product')),
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  layout jsonb NOT NULL DEFAULT '{}'::jsonb,
  position integer NOT NULL DEFAULT 0
);

CREATE TABLE home_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  home_section_id uuid NOT NULL REFERENCES home_sections(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('image', 'video')),
  media_url text NOT NULL,
  title text,
  subtitle text,
  position integer NOT NULL DEFAULT 0
);

CREATE TABLE order_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_name text NOT NULL,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  seller_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  channel text NOT NULL CHECK (channel IN ('presencial', 'whatsapp', 'online')),
  status session_status NOT NULL DEFAULT 'aberto',
  shipping jsonb,
  payment_token_hash text UNIQUE,
  payment_token_created_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE order_session_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES order_sessions(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  product_id uuid,
  snapshot jsonb NOT NULL,
  UNIQUE (tenant_id, session_id, item_key)
);

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  seller_id uuid REFERENCES users(id) ON DELETE SET NULL,
  client_name text,
  channel text NOT NULL,
  total numeric(12,2) NOT NULL CHECK (total >= 0),
  shipping jsonb,
  payment_method text,
  discount jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  product_id uuid,
  snapshot jsonb NOT NULL
);

CREATE TABLE home_ai_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  prompt text NOT NULL,
  sections jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE session_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subject text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX users_tenant_role_idx ON users (tenant_id, role);
CREATE INDEX clients_tenant_name_idx ON clients (tenant_id, name);
CREATE INDEX products_tenant_position_idx ON products (tenant_id, display_position NULLS LAST);
CREATE INDEX product_variants_tenant_product_idx ON product_variants (tenant_id, product_id);
CREATE INDEX order_sessions_tenant_seller_status_idx ON order_sessions (tenant_id, seller_id, status);
CREATE INDEX orders_tenant_client_idx ON orders (tenant_id, client_id, created_at DESC);
CREATE INDEX orders_tenant_seller_idx ON orders (tenant_id, seller_id, created_at DESC);
