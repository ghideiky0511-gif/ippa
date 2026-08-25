-- DROP SCHEMA public;

CREATE SCHEMA public AUTHORIZATION pg_database_owner;

-- DROP TYPE public.order_status;

CREATE TYPE public.order_status AS ENUM (
	'pending',
	'confirmed',
	'preparing',
	'ready',
	'delivered',
	'cancelled');

-- DROP TYPE public.payment_status;

CREATE TYPE public.payment_status AS ENUM (
	'pending',
	'processing',
	'approved',
	'failed',
	'refunded',
	'cancelled');

-- DROP SEQUENCE public.addresses_id_seq;

CREATE SEQUENCE public.addresses_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.catalog_links_id_seq;

CREATE SEQUENCE public.catalog_links_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.categories_id_seq;

CREATE SEQUENCE public.categories_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.customers_id_seq;

CREATE SEQUENCE public.customers_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.order_items_id_seq;

CREATE SEQUENCE public.order_items_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.orders_id_seq;

CREATE SEQUENCE public.orders_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.payment_methods_id_seq;

CREATE SEQUENCE public.payment_methods_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.payments_id_seq;

CREATE SEQUENCE public.payments_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.products_id_seq;

CREATE SEQUENCE public.products_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.sellers_id_seq;

CREATE SEQUENCE public.sellers_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.stores_id_seq;

CREATE SEQUENCE public.stores_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;-- public.customers definição

-- Drop table

-- DROP TABLE public.customers;

CREATE TABLE public.customers (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	"name" varchar(150) NOT NULL,
	email varchar(255) NULL,
	phone varchar(20) NOT NULL,
	password_hash text NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT customers_email_key UNIQUE (email),
	CONSTRAINT customers_phone_key UNIQUE (phone),
	CONSTRAINT customers_pkey PRIMARY KEY (id)
);

-- Table Triggers

create trigger trg_customers_updated_at before
update
    on
    public.customers for each row execute function set_updated_at();


-- public.payment_methods definição

-- Drop table

-- DROP TABLE public.payment_methods;

CREATE TABLE public.payment_methods (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	code varchar(30) NOT NULL,
	"name" varchar(100) NOT NULL,
	is_active bool DEFAULT true NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT payment_methods_code_key UNIQUE (code),
	CONSTRAINT payment_methods_pkey PRIMARY KEY (id)
);


-- public.sellers definição

-- Drop table

-- DROP TABLE public.sellers;

CREATE TABLE public.sellers (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	"name" varchar(150) NOT NULL,
	email varchar(255) NOT NULL,
	phone varchar(20) NULL,
	password_hash text NOT NULL,
	is_active bool DEFAULT true NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT sellers_email_key UNIQUE (email),
	CONSTRAINT sellers_pkey PRIMARY KEY (id)
);

-- Table Triggers

create trigger trg_sellers_updated_at before
update
    on
    public.sellers for each row execute function set_updated_at();


-- public.addresses definição

-- Drop table

-- DROP TABLE public.addresses;

CREATE TABLE public.addresses (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	customer_id int8 NOT NULL,
	"label" varchar(50) NULL,
	street varchar(200) NOT NULL,
	"number" varchar(20) NULL,
	complement varchar(100) NULL,
	neighborhood varchar(100) NULL,
	city varchar(100) NOT NULL,
	state varchar(2) NOT NULL,
	zip_code varchar(9) NULL,
	is_default bool DEFAULT false NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT addresses_pkey PRIMARY KEY (id),
	CONSTRAINT addresses_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE
);
CREATE INDEX idx_addresses_customer_id ON public.addresses USING btree (customer_id);


-- public.seller_customers definição

-- Drop table

-- DROP TABLE public.seller_customers;

CREATE TABLE public.seller_customers (
	seller_id int8 NOT NULL,
	customer_id int8 NOT NULL,
	orders_count int4 DEFAULT 0 NOT NULL,
	first_order_at timestamptz DEFAULT now() NOT NULL,
	last_order_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT seller_customers_pkey PRIMARY KEY (seller_id, customer_id),
	CONSTRAINT seller_customers_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE,
	CONSTRAINT seller_customers_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.sellers(id) ON DELETE CASCADE
);
CREATE INDEX idx_seller_customers_customer_id ON public.seller_customers USING btree (customer_id);


-- public.stores definição

-- Drop table

-- DROP TABLE public.stores;

CREATE TABLE public.stores (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	seller_id int8 NOT NULL,
	"name" varchar(150) NOT NULL,
	slug varchar(150) NOT NULL,
	description text NULL,
	phone varchar(20) NULL,
	logo_url text NULL,
	is_active bool DEFAULT true NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT stores_pkey PRIMARY KEY (id),
	CONSTRAINT stores_slug_key UNIQUE (slug),
	CONSTRAINT stores_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.sellers(id) ON DELETE CASCADE
);
CREATE INDEX idx_stores_seller_id ON public.stores USING btree (seller_id);

-- Table Triggers

create trigger trg_stores_updated_at before
update
    on
    public.stores for each row execute function set_updated_at();


-- public.catalog_links definição

-- Drop table

-- DROP TABLE public.catalog_links;

CREATE TABLE public.catalog_links (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	store_id int8 NOT NULL,
	seller_id int8 NULL,
	"token" uuid DEFAULT gen_random_uuid() NOT NULL,
	title varchar(150) NULL,
	expires_at timestamptz NOT NULL,
	is_active bool DEFAULT true NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT catalog_links_pkey PRIMARY KEY (id),
	CONSTRAINT catalog_links_token_key UNIQUE (token),
	CONSTRAINT catalog_links_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.sellers(id) ON DELETE SET NULL,
	CONSTRAINT catalog_links_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE
);
CREATE INDEX idx_catalog_links_seller_id ON public.catalog_links USING btree (seller_id);
CREATE INDEX idx_catalog_links_store_id ON public.catalog_links USING btree (store_id);
CREATE INDEX idx_catalog_links_token ON public.catalog_links USING btree (token);

-- Table Triggers

create trigger trg_catalog_links_validate_seller before
insert
    or
update
    on
    public.catalog_links for each row execute function validate_catalog_link_seller();


-- public.categories definição

-- Drop table

-- DROP TABLE public.categories;

CREATE TABLE public.categories (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	store_id int8 NOT NULL,
	"name" varchar(100) NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT categories_pkey PRIMARY KEY (id),
	CONSTRAINT categories_store_id_name_key UNIQUE (store_id, name),
	CONSTRAINT categories_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE
);
CREATE INDEX idx_categories_store_id ON public.categories USING btree (store_id);


-- public.orders definição

-- Drop table

-- DROP TABLE public.orders;

CREATE TABLE public.orders (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	store_id int8 NOT NULL,
	seller_id int8 NOT NULL,
	customer_id int8 NOT NULL,
	address_id int8 NULL,
	status public.order_status DEFAULT 'pending'::order_status NOT NULL,
	total_amount numeric(10, 2) DEFAULT 0 NOT NULL,
	notes text NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT orders_pkey PRIMARY KEY (id),
	CONSTRAINT orders_total_amount_check CHECK ((total_amount >= (0)::numeric)),
	CONSTRAINT orders_address_id_fkey FOREIGN KEY (address_id) REFERENCES public.addresses(id) ON DELETE SET NULL,
	CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE RESTRICT,
	CONSTRAINT orders_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.sellers(id) ON DELETE RESTRICT,
	CONSTRAINT orders_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT
);
CREATE INDEX idx_orders_customer_id ON public.orders USING btree (customer_id);
CREATE INDEX idx_orders_seller_id ON public.orders USING btree (seller_id);
CREATE INDEX idx_orders_status ON public.orders USING btree (status);
CREATE INDEX idx_orders_store_id ON public.orders USING btree (store_id);

-- Table Triggers

create trigger trg_orders_updated_at before
update
    on
    public.orders for each row execute function set_updated_at();
create trigger trg_orders_set_seller_id before
insert
    or
update
    of store_id on
    public.orders for each row execute function set_order_seller_id();
create trigger trg_orders_upsert_seller_customer after
insert
    on
    public.orders for each row execute function upsert_seller_customer();


-- public.payments definição

-- Drop table

-- DROP TABLE public.payments;

CREATE TABLE public.payments (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	order_id int8 NOT NULL,
	payment_method_id int8 NOT NULL,
	status public.payment_status DEFAULT 'pending'::payment_status NOT NULL,
	amount numeric(10, 2) NOT NULL,
	provider varchar(50) NULL,
	external_id varchar(150) NULL,
	installments int4 DEFAULT 1 NOT NULL,
	metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
	gateway_response jsonb NULL,
	paid_at timestamptz NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT payments_amount_check CHECK ((amount >= (0)::numeric)),
	CONSTRAINT payments_installments_check CHECK ((installments > 0)),
	CONSTRAINT payments_pkey PRIMARY KEY (id),
	CONSTRAINT payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE RESTRICT,
	CONSTRAINT payments_payment_method_id_fkey FOREIGN KEY (payment_method_id) REFERENCES public.payment_methods(id) ON DELETE RESTRICT
);
CREATE INDEX idx_payments_order_id ON public.payments USING btree (order_id);
CREATE INDEX idx_payments_payment_method_id ON public.payments USING btree (payment_method_id);
CREATE UNIQUE INDEX idx_payments_provider_external_id ON public.payments USING btree (provider, external_id) WHERE (external_id IS NOT NULL);
CREATE INDEX idx_payments_status ON public.payments USING btree (status);

-- Table Triggers

create trigger trg_payments_updated_at before
update
    on
    public.payments for each row execute function set_updated_at();
create trigger trg_payments_validate_method before
insert
    or
update
    of order_id,
    payment_method_id on
    public.payments for each row execute function validate_payment_method_enabled();


-- public.products definição

-- Drop table

-- DROP TABLE public.products;

CREATE TABLE public.products (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	store_id int8 NOT NULL,
	category_id int8 NULL,
	"name" varchar(150) NOT NULL,
	description text NULL,
	price numeric(10, 2) NOT NULL,
	image_url text NULL,
	stock_quantity int4 DEFAULT 0 NOT NULL,
	is_active bool DEFAULT true NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT products_pkey PRIMARY KEY (id),
	CONSTRAINT products_price_check CHECK ((price >= (0)::numeric)),
	CONSTRAINT products_stock_quantity_check CHECK ((stock_quantity >= 0)),
	CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL,
	CONSTRAINT products_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE
);
CREATE INDEX idx_products_category_id ON public.products USING btree (category_id);
CREATE INDEX idx_products_store_id ON public.products USING btree (store_id);

-- Table Triggers

create trigger trg_products_updated_at before
update
    on
    public.products for each row execute function set_updated_at();


-- public.store_payment_methods definição

-- Drop table

-- DROP TABLE public.store_payment_methods;

CREATE TABLE public.store_payment_methods (
	store_id int8 NOT NULL,
	payment_method_id int8 NOT NULL,
	is_enabled bool DEFAULT true NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT store_payment_methods_pkey PRIMARY KEY (store_id, payment_method_id),
	CONSTRAINT store_payment_methods_payment_method_id_fkey FOREIGN KEY (payment_method_id) REFERENCES public.payment_methods(id) ON DELETE CASCADE,
	CONSTRAINT store_payment_methods_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE
);
CREATE INDEX idx_store_payment_methods_payment_method_id ON public.store_payment_methods USING btree (payment_method_id);

-- Table Triggers

create trigger trg_store_payment_methods_updated_at before
update
    on
    public.store_payment_methods for each row execute function set_updated_at();


-- public.catalog_link_categories definição

-- Drop table

-- DROP TABLE public.catalog_link_categories;

CREATE TABLE public.catalog_link_categories (
	link_id int8 NOT NULL,
	category_id int8 NOT NULL,
	CONSTRAINT catalog_link_categories_pkey PRIMARY KEY (link_id, category_id),
	CONSTRAINT catalog_link_categories_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE,
	CONSTRAINT catalog_link_categories_link_id_fkey FOREIGN KEY (link_id) REFERENCES public.catalog_links(id) ON DELETE CASCADE
);
CREATE INDEX idx_catalog_link_categories_category_id ON public.catalog_link_categories USING btree (category_id);

-- Table Triggers

create trigger trg_catalog_link_categories_validate before
insert
    or
update
    on
    public.catalog_link_categories for each row execute function validate_catalog_link_category();


-- public.catalog_link_products definição

-- Drop table

-- DROP TABLE public.catalog_link_products;

CREATE TABLE public.catalog_link_products (
	link_id int8 NOT NULL,
	product_id int8 NOT NULL,
	CONSTRAINT catalog_link_products_pkey PRIMARY KEY (link_id, product_id),
	CONSTRAINT catalog_link_products_link_id_fkey FOREIGN KEY (link_id) REFERENCES public.catalog_links(id) ON DELETE CASCADE,
	CONSTRAINT catalog_link_products_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE
);
CREATE INDEX idx_catalog_link_products_product_id ON public.catalog_link_products USING btree (product_id);

-- Table Triggers

create trigger trg_catalog_link_products_validate before
insert
    or
update
    on
    public.catalog_link_products for each row execute function validate_catalog_link_product();


-- public.order_items definição

-- Drop table

-- DROP TABLE public.order_items;

CREATE TABLE public.order_items (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	order_id int8 NOT NULL,
	product_id int8 NOT NULL,
	quantity int4 NOT NULL,
	unit_price numeric(10, 2) NOT NULL,
	subtotal numeric(10, 2) GENERATED ALWAYS AS ((quantity::numeric * unit_price)) STORED NULL,
	CONSTRAINT order_items_pkey PRIMARY KEY (id),
	CONSTRAINT order_items_quantity_check CHECK ((quantity > 0)),
	CONSTRAINT order_items_unit_price_check CHECK ((unit_price >= (0)::numeric)),
	CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE,
	CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT
);
CREATE INDEX idx_order_items_order_id ON public.order_items USING btree (order_id);
CREATE INDEX idx_order_items_product_id ON public.order_items USING btree (product_id);



-- DROP FUNCTION public.armor(bytea);

CREATE OR REPLACE FUNCTION public.armor(bytea)
 RETURNS text
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_armor$function$
;

-- DROP FUNCTION public.armor(bytea, _text, _text);

CREATE OR REPLACE FUNCTION public.armor(bytea, text[], text[])
 RETURNS text
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_armor$function$
;

-- DROP FUNCTION public.crypt(text, text);

CREATE OR REPLACE FUNCTION public.crypt(text, text)
 RETURNS text
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_crypt$function$
;

-- DROP FUNCTION public.dearmor(text);

CREATE OR REPLACE FUNCTION public.dearmor(text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_dearmor$function$
;

-- DROP FUNCTION public.decrypt(bytea, bytea, text);

CREATE OR REPLACE FUNCTION public.decrypt(bytea, bytea, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_decrypt$function$
;

-- DROP FUNCTION public.decrypt_iv(bytea, bytea, bytea, text);

CREATE OR REPLACE FUNCTION public.decrypt_iv(bytea, bytea, bytea, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_decrypt_iv$function$
;

-- DROP FUNCTION public.digest(bytea, text);

CREATE OR REPLACE FUNCTION public.digest(bytea, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_digest$function$
;

-- DROP FUNCTION public.digest(text, text);

CREATE OR REPLACE FUNCTION public.digest(text, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_digest$function$
;

-- DROP FUNCTION public.encrypt(bytea, bytea, text);

CREATE OR REPLACE FUNCTION public.encrypt(bytea, bytea, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_encrypt$function$
;

-- DROP FUNCTION public.encrypt_iv(bytea, bytea, bytea, text);

CREATE OR REPLACE FUNCTION public.encrypt_iv(bytea, bytea, bytea, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_encrypt_iv$function$
;

-- DROP FUNCTION public.fips_mode();

CREATE OR REPLACE FUNCTION public.fips_mode()
 RETURNS boolean
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_check_fipsmode$function$
;

-- DROP FUNCTION public.gen_random_bytes(int4);

CREATE OR REPLACE FUNCTION public.gen_random_bytes(integer)
 RETURNS bytea
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_random_bytes$function$
;

-- DROP FUNCTION public.gen_random_uuid();

CREATE OR REPLACE FUNCTION public.gen_random_uuid()
 RETURNS uuid
 LANGUAGE c
 PARALLEL SAFE
AS '$libdir/pgcrypto', $function$pg_random_uuid$function$
;

-- DROP FUNCTION public.gen_salt(text, int4);

CREATE OR REPLACE FUNCTION public.gen_salt(text, integer)
 RETURNS text
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_gen_salt_rounds$function$
;

-- DROP FUNCTION public.gen_salt(text);

CREATE OR REPLACE FUNCTION public.gen_salt(text)
 RETURNS text
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_gen_salt$function$
;

-- DROP FUNCTION public.hmac(text, text, text);

CREATE OR REPLACE FUNCTION public.hmac(text, text, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_hmac$function$
;

-- DROP FUNCTION public.hmac(bytea, bytea, text);

CREATE OR REPLACE FUNCTION public.hmac(bytea, bytea, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_hmac$function$
;

-- DROP FUNCTION public.pgp_armor_headers(in text, out text, out text);

CREATE OR REPLACE FUNCTION public.pgp_armor_headers(text, OUT key text, OUT value text)
 RETURNS SETOF record
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_armor_headers$function$
;

-- DROP FUNCTION public.pgp_key_id(bytea);

CREATE OR REPLACE FUNCTION public.pgp_key_id(bytea)
 RETURNS text
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_key_id_w$function$
;

-- DROP FUNCTION public.pgp_pub_decrypt(bytea, bytea, text);

CREATE OR REPLACE FUNCTION public.pgp_pub_decrypt(bytea, bytea, text)
 RETURNS text
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_pub_decrypt_text$function$
;

-- DROP FUNCTION public.pgp_pub_decrypt(bytea, bytea, text, text);

CREATE OR REPLACE FUNCTION public.pgp_pub_decrypt(bytea, bytea, text, text)
 RETURNS text
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_pub_decrypt_text$function$
;

-- DROP FUNCTION public.pgp_pub_decrypt(bytea, bytea);

CREATE OR REPLACE FUNCTION public.pgp_pub_decrypt(bytea, bytea)
 RETURNS text
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_pub_decrypt_text$function$
;

-- DROP FUNCTION public.pgp_pub_decrypt_bytea(bytea, bytea, text, text);

CREATE OR REPLACE FUNCTION public.pgp_pub_decrypt_bytea(bytea, bytea, text, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_pub_decrypt_bytea$function$
;

-- DROP FUNCTION public.pgp_pub_decrypt_bytea(bytea, bytea, text);

CREATE OR REPLACE FUNCTION public.pgp_pub_decrypt_bytea(bytea, bytea, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_pub_decrypt_bytea$function$
;

-- DROP FUNCTION public.pgp_pub_decrypt_bytea(bytea, bytea);

CREATE OR REPLACE FUNCTION public.pgp_pub_decrypt_bytea(bytea, bytea)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_pub_decrypt_bytea$function$
;

-- DROP FUNCTION public.pgp_pub_encrypt(text, bytea, text);

CREATE OR REPLACE FUNCTION public.pgp_pub_encrypt(text, bytea, text)
 RETURNS bytea
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_pub_encrypt_text$function$
;

-- DROP FUNCTION public.pgp_pub_encrypt(text, bytea);

CREATE OR REPLACE FUNCTION public.pgp_pub_encrypt(text, bytea)
 RETURNS bytea
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_pub_encrypt_text$function$
;

-- DROP FUNCTION public.pgp_pub_encrypt_bytea(bytea, bytea);

CREATE OR REPLACE FUNCTION public.pgp_pub_encrypt_bytea(bytea, bytea)
 RETURNS bytea
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_pub_encrypt_bytea$function$
;

-- DROP FUNCTION public.pgp_pub_encrypt_bytea(bytea, bytea, text);

CREATE OR REPLACE FUNCTION public.pgp_pub_encrypt_bytea(bytea, bytea, text)
 RETURNS bytea
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_pub_encrypt_bytea$function$
;

-- DROP FUNCTION public.pgp_sym_decrypt(bytea, text, text);

CREATE OR REPLACE FUNCTION public.pgp_sym_decrypt(bytea, text, text)
 RETURNS text
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_sym_decrypt_text$function$
;

-- DROP FUNCTION public.pgp_sym_decrypt(bytea, text);

CREATE OR REPLACE FUNCTION public.pgp_sym_decrypt(bytea, text)
 RETURNS text
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_sym_decrypt_text$function$
;

-- DROP FUNCTION public.pgp_sym_decrypt_bytea(bytea, text, text);

CREATE OR REPLACE FUNCTION public.pgp_sym_decrypt_bytea(bytea, text, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_sym_decrypt_bytea$function$
;

-- DROP FUNCTION public.pgp_sym_decrypt_bytea(bytea, text);

CREATE OR REPLACE FUNCTION public.pgp_sym_decrypt_bytea(bytea, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_sym_decrypt_bytea$function$
;

-- DROP FUNCTION public.pgp_sym_encrypt(text, text);

CREATE OR REPLACE FUNCTION public.pgp_sym_encrypt(text, text)
 RETURNS bytea
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_sym_encrypt_text$function$
;

-- DROP FUNCTION public.pgp_sym_encrypt(text, text, text);

CREATE OR REPLACE FUNCTION public.pgp_sym_encrypt(text, text, text)
 RETURNS bytea
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_sym_encrypt_text$function$
;

-- DROP FUNCTION public.pgp_sym_encrypt_bytea(bytea, text);

CREATE OR REPLACE FUNCTION public.pgp_sym_encrypt_bytea(bytea, text)
 RETURNS bytea
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_sym_encrypt_bytea$function$
;

-- DROP FUNCTION public.pgp_sym_encrypt_bytea(bytea, text, text);

CREATE OR REPLACE FUNCTION public.pgp_sym_encrypt_bytea(bytea, text, text)
 RETURNS bytea
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_sym_encrypt_bytea$function$
;

-- DROP FUNCTION public.set_order_seller_id();

CREATE OR REPLACE FUNCTION public.set_order_seller_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    SELECT seller_id INTO NEW.seller_id
    FROM stores
    WHERE id = NEW.store_id;

    IF NEW.seller_id IS NULL THEN
        RAISE EXCEPTION 'Loja % não encontrada ou sem vendedor associado', NEW.store_id;
    END IF;

    RETURN NEW;
END;
$function$
;

-- DROP FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$
;

-- DROP FUNCTION public.upsert_seller_customer();

CREATE OR REPLACE FUNCTION public.upsert_seller_customer()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    INSERT INTO seller_customers (seller_id, customer_id, orders_count, first_order_at, last_order_at)
    VALUES (NEW.seller_id, NEW.customer_id, 1, NEW.created_at, NEW.created_at)
    ON CONFLICT (seller_id, customer_id)
    DO UPDATE SET
        orders_count  = seller_customers.orders_count + 1,
        last_order_at = NEW.created_at;

    RETURN NEW;
END;
$function$
;

-- DROP FUNCTION public.validate_catalog_link_category();

CREATE OR REPLACE FUNCTION public.validate_catalog_link_category()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_link_store_id     BIGINT;
    v_category_store_id BIGINT;
BEGIN
    SELECT store_id INTO v_link_store_id FROM catalog_links WHERE id = NEW.link_id;
    SELECT store_id INTO v_category_store_id FROM categories WHERE id = NEW.category_id;

    IF v_link_store_id IS DISTINCT FROM v_category_store_id THEN
        RAISE EXCEPTION 'Categoria % não pertence à mesma loja do link %', NEW.category_id, NEW.link_id;
    END IF;
    RETURN NEW;
END;
$function$
;

-- DROP FUNCTION public.validate_catalog_link_product();

CREATE OR REPLACE FUNCTION public.validate_catalog_link_product()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_link_store_id    BIGINT;
    v_product_store_id BIGINT;
BEGIN
    SELECT store_id INTO v_link_store_id FROM catalog_links WHERE id = NEW.link_id;
    SELECT store_id INTO v_product_store_id FROM products WHERE id = NEW.product_id;

    IF v_link_store_id IS DISTINCT FROM v_product_store_id THEN
        RAISE EXCEPTION 'Produto % não pertence à mesma loja do link %', NEW.product_id, NEW.link_id;
    END IF;
    RETURN NEW;
END;
$function$
;

-- DROP FUNCTION public.validate_catalog_link_seller();

CREATE OR REPLACE FUNCTION public.validate_catalog_link_seller()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_store_seller_id BIGINT;
BEGIN
    IF NEW.seller_id IS NOT NULL THEN
        SELECT seller_id INTO v_store_seller_id FROM stores WHERE id = NEW.store_id;
        IF v_store_seller_id IS DISTINCT FROM NEW.seller_id THEN
            RAISE EXCEPTION 'seller_id % não é o vendedor da loja %', NEW.seller_id, NEW.store_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$function$
;

-- DROP FUNCTION public.validate_payment_method_enabled();

CREATE OR REPLACE FUNCTION public.validate_payment_method_enabled()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_store_id   BIGINT;
    v_is_enabled BOOLEAN;
BEGIN
    SELECT store_id INTO v_store_id FROM orders WHERE id = NEW.order_id;

    SELECT is_enabled INTO v_is_enabled
    FROM store_payment_methods
    WHERE store_id = v_store_id AND payment_method_id = NEW.payment_method_id;

    IF v_is_enabled IS NOT TRUE THEN
        RAISE EXCEPTION 'Forma de pagamento % não está habilitada para a loja %', NEW.payment_method_id, v_store_id;
    END IF;

    RETURN NEW;
END;
$function$
;
