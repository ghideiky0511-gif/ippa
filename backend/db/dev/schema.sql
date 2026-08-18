-- DROP SCHEMA public;

CREATE SCHEMA public AUTHORIZATION pg_database_owner;

-- DROP TYPE public.audit_action;

CREATE TYPE public.audit_action AS ENUM (
	'client.created',
	'client.updated',
	'client_cart.saved',
	'order_session.created',
	'authentication.logged_in',
	'authentication.logged_out',
	'user.created');

-- DROP TYPE public.audit_entity_type;

CREATE TYPE public.audit_entity_type AS ENUM (
	'client',
	'client_cart',
	'order_session',
	'user');

-- DROP TYPE public.banner_media_type;

CREATE TYPE public.banner_media_type AS ENUM (
	'image',
	'video');

-- DROP TYPE public.classification_kind;

CREATE TYPE public.classification_kind AS ENUM (
	'category',
	'subcategory',
	'collection',
	'brand');

-- DROP TYPE public.discount_type;

CREATE TYPE public.discount_type AS ENUM (
	'quantity',
	'products');

-- DROP TYPE public.home_section_type;

CREATE TYPE public.home_section_type AS ENUM (
	'banner',
	'product');

-- DROP TYPE public.inventory_location_kind;

CREATE TYPE public.inventory_location_kind AS ENUM (
	'warehouse',
	'store',
	'virtual');

-- DROP TYPE public.inventory_movement_type;

CREATE TYPE public.inventory_movement_type AS ENUM (
	'initial',
	'receipt',
	'sale',
	'return',
	'adjustment',
	'transfer_in',
	'transfer_out',
	'reservation',
	'release',
	'integration_sync');

-- DROP TYPE public.inventory_reservation_status;

CREATE TYPE public.inventory_reservation_status AS ENUM (
	'active',
	'released',
	'consumed',
	'expired');

-- DROP TYPE public.inventory_source_kind;

CREATE TYPE public.inventory_source_kind AS ENUM (
	'manual',
	'erp',
	'marketplace');

-- DROP TYPE public.order_channel;

CREATE TYPE public.order_channel AS ENUM (
	'presencial',
	'whatsapp',
	'online');

-- DROP TYPE public.session_status;

CREATE TYPE public.session_status AS ENUM (
	'aberto',
	'fechado',
	'aguardando_pagamento');

-- DROP TYPE public.user_role;

CREATE TYPE public.user_role AS ENUM (
	'administrador',
	'vendedora',
	'expedicao',
	'entregador',
	'cliente');

-- DROP TYPE public.variant_availability_mode;

CREATE TYPE public.variant_availability_mode AS ENUM (
	'in_stock',
	'preorder',
	'backorder',
	'out_of_stock');

-- DROP SEQUENCE public.session_events_id_seq;

CREATE SEQUENCE public.session_events_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;-- public.schema_migrations definição

-- Drop table

-- DROP TABLE public.schema_migrations;

CREATE TABLE public.schema_migrations (
	name text NOT NULL,
	applied_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT schema_migrations_pkey PRIMARY KEY (name)
);


-- public.tenants definição

-- Drop table

-- DROP TABLE public.tenants;

CREATE TABLE public.tenants (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	slug text NOT NULL,
	name text NOT NULL,
	active bool DEFAULT true NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT tenants_pkey PRIMARY KEY (id),
	CONSTRAINT tenants_slug_check CHECK ((slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'::text)),
	CONSTRAINT tenants_slug_key UNIQUE (slug)
);


-- public.classification_types definição

-- Drop table

-- DROP TABLE public.classification_types;

CREATE TABLE public.classification_types (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	kind public.classification_kind NOT NULL,
	"label" text NOT NULL,
	hierarchical bool DEFAULT false NOT NULL,
	active bool DEFAULT true NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT classification_types_pkey PRIMARY KEY (id),
	CONSTRAINT classification_types_tenant_id_id_key UNIQUE (tenant_id, id),
	CONSTRAINT classification_types_tenant_id_kind_key UNIQUE (tenant_id, kind),
	CONSTRAINT classification_types_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
);


-- public.classifications definição

-- Drop table

-- DROP TABLE public.classifications;

CREATE TABLE public.classifications (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	classification_type_id uuid NOT NULL,
	parent_id uuid NULL,
	"name" text NOT NULL,
	slug text NOT NULL,
	"position" int4 DEFAULT 0 NOT NULL,
	active bool DEFAULT true NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT classifications_pkey PRIMARY KEY (id),
	CONSTRAINT classifications_slug_check CHECK ((slug ~ '^[a-z0-9][a-z0-9-]{0,126}$'::text)),
	CONSTRAINT classifications_tenant_id_classification_type_id_parent_id__key UNIQUE NULLS NOT DISTINCT (tenant_id, classification_type_id, parent_id, slug),
	CONSTRAINT classifications_tenant_id_id_classification_type_id_key UNIQUE (tenant_id, id, classification_type_id),
	CONSTRAINT classifications_tenant_id_id_key UNIQUE (tenant_id, id),
	CONSTRAINT classifications_tenant_id_classification_type_id_fkey FOREIGN KEY (tenant_id,classification_type_id) REFERENCES public.classification_types(tenant_id,id) ON DELETE CASCADE,
	CONSTRAINT classifications_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
	CONSTRAINT classifications_tenant_id_parent_id_fkey FOREIGN KEY (tenant_id,parent_id) REFERENCES public.classifications(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX classifications_tenant_type_parent_position_idx ON public.classifications USING btree (tenant_id, classification_type_id, parent_id, "position", name);


-- public.discounts definição

-- Drop table

-- DROP TABLE public.discounts;

CREATE TABLE public.discounts (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	"label" text NOT NULL,
	active bool DEFAULT true NOT NULL,
	"type" public."discount_type" NOT NULL,
	"percent" numeric(5, 2) DEFAULT 0 NOT NULL,
	CONSTRAINT discounts_percent_check CHECK (((percent >= (0)::numeric) AND (percent <= (100)::numeric))),
	CONSTRAINT discounts_pkey PRIMARY KEY (id),
	CONSTRAINT discounts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
);


-- public.highlights definição

-- Drop table

-- DROP TABLE public.highlights;

CREATE TABLE public.highlights (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT highlights_pkey PRIMARY KEY (id),
	CONSTRAINT highlights_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
);


-- public.home_ai_history definição

-- Drop table

-- DROP TABLE public.home_ai_history;

CREATE TABLE public.home_ai_history (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	prompt text NOT NULL,
	sections jsonb NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT home_ai_history_pkey PRIMARY KEY (id),
	CONSTRAINT home_ai_history_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
);


-- public.inventory_reservations definição

-- Drop table

-- DROP TABLE public.inventory_reservations;

CREATE TABLE public.inventory_reservations (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	reference_type text NOT NULL,
	reference_id uuid NOT NULL,
	status public."inventory_reservation_status" DEFAULT 'active'::inventory_reservation_status NOT NULL,
	expires_at timestamptz NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	released_at timestamptz NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT inventory_reservations_pkey PRIMARY KEY (id),
	CONSTRAINT inventory_reservations_reference_type_check CHECK ((reference_type = ANY (ARRAY['cart'::text, 'order_session'::text, 'order'::text]))),
	CONSTRAINT inventory_reservations_tenant_id_id_key UNIQUE (tenant_id, id),
	CONSTRAINT inventory_reservations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
);
CREATE INDEX inventory_reservations_active_expiry_idx ON public.inventory_reservations USING btree (tenant_id, expires_at) WHERE (status = 'active'::inventory_reservation_status);


-- public.inventory_sources definição

-- Drop table

-- DROP TABLE public.inventory_sources;

CREATE TABLE public.inventory_sources (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	kind public."inventory_source_kind" NOT NULL,
	code text NOT NULL,
	"name" text NOT NULL,
	active bool DEFAULT true NOT NULL,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT inventory_sources_code_check CHECK ((code ~ '^[a-z0-9][a-z0-9-]{0,62}$'::text)),
	CONSTRAINT inventory_sources_configuration_check CHECK ((jsonb_typeof(configuration) = 'object'::text)),
	CONSTRAINT inventory_sources_pkey PRIMARY KEY (id),
	CONSTRAINT inventory_sources_tenant_id_code_key UNIQUE (tenant_id, code),
	CONSTRAINT inventory_sources_tenant_id_id_key UNIQUE (tenant_id, id),
	CONSTRAINT inventory_sources_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
);


-- public.products definição

-- Drop table

-- DROP TABLE public.products;

CREATE TABLE public.products (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	"name" text NOT NULL,
	description text DEFAULT ''::text NOT NULL,
	category text NULL,
	subcategory text NULL,
	collection text NULL,
	brand text NULL,
	sku text NULL,
	price numeric(12, 2) NOT NULL,
	suggested_retail_price numeric(12, 2) NULL,
	markup numeric(8, 3) NULL,
	display_position int4 NULL,
	media jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT products_pkey PRIMARY KEY (id),
	CONSTRAINT products_price_check CHECK ((price >= (0)::numeric)),
	CONSTRAINT products_tenant_id_id_key UNIQUE (tenant_id, id),
	CONSTRAINT products_tenant_id_sku_key UNIQUE (tenant_id, sku),
	CONSTRAINT products_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
);
CREATE INDEX products_tenant_position_idx ON public.products USING btree (tenant_id, display_position);


-- public.session_events definição

-- Drop table

-- DROP TABLE public.session_events;

CREATE TABLE public.session_events (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	tenant_id uuid NOT NULL,
	subject text NOT NULL,
	payload jsonb NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT session_events_pkey PRIMARY KEY (id),
	CONSTRAINT session_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
);


-- public.discount_products definição

-- Drop table

-- DROP TABLE public.discount_products;

CREATE TABLE public.discount_products (
	tenant_id uuid NOT NULL,
	discount_id uuid NOT NULL,
	product_id uuid NOT NULL,
	CONSTRAINT discount_products_pkey PRIMARY KEY (tenant_id, discount_id, product_id),
	CONSTRAINT discount_products_discount_id_fkey FOREIGN KEY (discount_id) REFERENCES public.discounts(id) ON DELETE CASCADE,
	CONSTRAINT discount_products_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE,
	CONSTRAINT discount_products_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
);


-- public.discount_tiers definição

-- Drop table

-- DROP TABLE public.discount_tiers;

CREATE TABLE public.discount_tiers (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	discount_id uuid NOT NULL,
	min_qty int4 NOT NULL,
	"percent" numeric(5, 2) NOT NULL,
	CONSTRAINT discount_tiers_min_qty_check CHECK ((min_qty > 0)),
	CONSTRAINT discount_tiers_percent_check CHECK (((percent >= (0)::numeric) AND (percent <= (100)::numeric))),
	CONSTRAINT discount_tiers_pkey PRIMARY KEY (id),
	CONSTRAINT discount_tiers_tenant_id_discount_id_min_qty_key UNIQUE (tenant_id, discount_id, min_qty),
	CONSTRAINT discount_tiers_discount_id_fkey FOREIGN KEY (discount_id) REFERENCES public.discounts(id) ON DELETE CASCADE,
	CONSTRAINT discount_tiers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
);


-- public.highlight_products definição

-- Drop table

-- DROP TABLE public.highlight_products;

CREATE TABLE public.highlight_products (
	tenant_id uuid NOT NULL,
	highlight_id uuid NOT NULL,
	product_id uuid NOT NULL,
	"position" int4 DEFAULT 0 NOT NULL,
	CONSTRAINT highlight_products_pkey PRIMARY KEY (tenant_id, highlight_id, product_id),
	CONSTRAINT highlight_products_highlight_id_fkey FOREIGN KEY (highlight_id) REFERENCES public.highlights(id) ON DELETE CASCADE,
	CONSTRAINT highlight_products_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE,
	CONSTRAINT highlight_products_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
);


-- public.home_sections definição

-- Drop table

-- DROP TABLE public.home_sections;

CREATE TABLE public.home_sections (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	"type" public."home_section_type" NOT NULL,
	product_id uuid NULL,
	layout jsonb DEFAULT '{}'::jsonb NOT NULL,
	"position" int4 DEFAULT 0 NOT NULL,
	CONSTRAINT home_sections_pkey PRIMARY KEY (id),
	CONSTRAINT home_sections_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL,
	CONSTRAINT home_sections_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
);


-- public.inventory_locations definição

-- Drop table

-- DROP TABLE public.inventory_locations;

CREATE TABLE public.inventory_locations (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	source_id uuid NULL,
	code text NOT NULL,
	"name" text NOT NULL,
	kind public."inventory_location_kind" DEFAULT 'warehouse'::inventory_location_kind NOT NULL,
	is_default bool DEFAULT false NOT NULL,
	active bool DEFAULT true NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT inventory_locations_code_check CHECK ((code ~ '^[a-z0-9][a-z0-9-]{0,62}$'::text)),
	CONSTRAINT inventory_locations_pkey PRIMARY KEY (id),
	CONSTRAINT inventory_locations_tenant_id_code_key UNIQUE (tenant_id, code),
	CONSTRAINT inventory_locations_tenant_id_id_key UNIQUE (tenant_id, id),
	CONSTRAINT inventory_locations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
	CONSTRAINT inventory_locations_tenant_id_source_id_fkey FOREIGN KEY (tenant_id,source_id) REFERENCES public.inventory_sources(tenant_id,id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX inventory_locations_one_default_per_tenant_idx ON public.inventory_locations USING btree (tenant_id) WHERE is_default;


-- public.product_classifications definição

-- Drop table

-- DROP TABLE public.product_classifications;

CREATE TABLE public.product_classifications (
	tenant_id uuid NOT NULL,
	product_id uuid NOT NULL,
	classification_id uuid NOT NULL,
	classification_type_id uuid NOT NULL,
	is_primary bool DEFAULT true NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT product_classifications_pkey PRIMARY KEY (tenant_id, product_id, classification_id),
	CONSTRAINT product_classifications_tenant_id_classification_id_classi_fkey FOREIGN KEY (tenant_id,classification_id,classification_type_id) REFERENCES public.classifications(tenant_id,id,classification_type_id) ON DELETE CASCADE,
	CONSTRAINT product_classifications_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
	CONSTRAINT product_classifications_tenant_id_product_id_fkey FOREIGN KEY (tenant_id,product_id) REFERENCES public.products(tenant_id,id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX product_classifications_primary_idx ON public.product_classifications USING btree (tenant_id, product_id, classification_type_id) WHERE is_primary;


-- public.product_packs definição

-- Drop table

-- DROP TABLE public.product_packs;

CREATE TABLE public.product_packs (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	product_id uuid NOT NULL,
	"scope" text NOT NULL,
	"label" text NOT NULL,
	color text NULL,
	price numeric(12, 2) NOT NULL,
	CONSTRAINT product_packs_pkey PRIMARY KEY (id),
	CONSTRAINT product_packs_price_check CHECK ((price >= (0)::numeric)),
	CONSTRAINT product_packs_scope_check CHECK ((scope = ANY (ARRAY['grade'::text, 'pack'::text]))),
	CONSTRAINT product_packs_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE,
	CONSTRAINT product_packs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
);


-- public.product_variants definição

-- Drop table

-- DROP TABLE public.product_variants;

CREATE TABLE public.product_variants (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	product_id uuid NOT NULL,
	color text NOT NULL,
	"size" text NOT NULL,
	price numeric(12, 2) NOT NULL,
	availability public."variant_availability_mode" NOT NULL,
	available_from text NULL,
	sku text NULL,
	track_inventory bool DEFAULT false NOT NULL,
	CONSTRAINT product_variants_pkey PRIMARY KEY (id),
	CONSTRAINT product_variants_price_check CHECK ((price >= (0)::numeric)),
	CONSTRAINT product_variants_tenant_id_id_key UNIQUE (tenant_id, id),
	CONSTRAINT product_variants_tenant_id_product_id_color_size_key UNIQUE (tenant_id, product_id, color, size),
	CONSTRAINT product_variants_tenant_sku_key UNIQUE (tenant_id, sku),
	CONSTRAINT product_variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE,
	CONSTRAINT product_variants_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
);
CREATE INDEX product_variants_tenant_product_idx ON public.product_variants USING btree (tenant_id, product_id);


-- public.store_settings definição

-- Drop table

-- DROP TABLE public.store_settings;

CREATE TABLE public.store_settings (
	tenant_id uuid NOT NULL,
	default_markup numeric(8, 3) NULL,
	assignment_strategy text NULL,
	payment_link_expiration_minutes int4 DEFAULT 15 NOT NULL,
	features jsonb DEFAULT '{}'::jsonb NOT NULL,
	similar_products_settings jsonb DEFAULT '{}'::jsonb NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	default_inventory_location_id uuid NULL,
	CONSTRAINT store_settings_payment_link_expiration_minutes_check CHECK ((payment_link_expiration_minutes > 0)),
	CONSTRAINT store_settings_pkey PRIMARY KEY (tenant_id),
	CONSTRAINT store_settings_default_inventory_location_fk FOREIGN KEY (tenant_id,default_inventory_location_id) REFERENCES public.inventory_locations(tenant_id,id) ON DELETE RESTRICT,
	CONSTRAINT store_settings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
);


-- public.home_banners definição

-- Drop table

-- DROP TABLE public.home_banners;

CREATE TABLE public.home_banners (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	home_section_id uuid NOT NULL,
	"type" public."banner_media_type" NOT NULL,
	media_url text NOT NULL,
	title text NULL,
	subtitle text NULL,
	"position" int4 DEFAULT 0 NOT NULL,
	CONSTRAINT home_banners_pkey PRIMARY KEY (id),
	CONSTRAINT home_banners_home_section_id_fkey FOREIGN KEY (home_section_id) REFERENCES public.home_sections(id) ON DELETE CASCADE,
	CONSTRAINT home_banners_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
);


-- public.inventory_balances definição

-- Drop table

-- DROP TABLE public.inventory_balances;

CREATE TABLE public.inventory_balances (
	tenant_id uuid NOT NULL,
	variant_id uuid NOT NULL,
	location_id uuid NOT NULL,
	on_hand_qty int4 DEFAULT 0 NOT NULL,
	reserved_qty int4 DEFAULT 0 NOT NULL,
	available_qty int4 GENERATED ALWAYS AS (on_hand_qty - reserved_qty) STORED NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT inventory_balances_check CHECK (((reserved_qty >= 0) AND (reserved_qty <= on_hand_qty))),
	CONSTRAINT inventory_balances_on_hand_qty_check CHECK ((on_hand_qty >= 0)),
	CONSTRAINT inventory_balances_pkey PRIMARY KEY (tenant_id, variant_id, location_id),
	CONSTRAINT inventory_balances_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
	CONSTRAINT inventory_balances_tenant_id_location_id_fkey FOREIGN KEY (tenant_id,location_id) REFERENCES public.inventory_locations(tenant_id,id) ON DELETE CASCADE,
	CONSTRAINT inventory_balances_tenant_id_variant_id_fkey FOREIGN KEY (tenant_id,variant_id) REFERENCES public.product_variants(tenant_id,id) ON DELETE CASCADE
);


-- public.inventory_external_references definição

-- Drop table

-- DROP TABLE public.inventory_external_references;

CREATE TABLE public.inventory_external_references (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	source_id uuid NOT NULL,
	variant_id uuid NOT NULL,
	external_id text NOT NULL,
	metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT inventory_external_references_metadata_check CHECK ((jsonb_typeof(metadata) = 'object'::text)),
	CONSTRAINT inventory_external_references_pkey PRIMARY KEY (id),
	CONSTRAINT inventory_external_references_tenant_id_source_id_external__key UNIQUE (tenant_id, source_id, external_id),
	CONSTRAINT inventory_external_references_tenant_id_source_id_variant_i_key UNIQUE (tenant_id, source_id, variant_id),
	CONSTRAINT inventory_external_references_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
	CONSTRAINT inventory_external_references_tenant_id_source_id_fkey FOREIGN KEY (tenant_id,source_id) REFERENCES public.inventory_sources(tenant_id,id) ON DELETE CASCADE,
	CONSTRAINT inventory_external_references_tenant_id_variant_id_fkey FOREIGN KEY (tenant_id,variant_id) REFERENCES public.product_variants(tenant_id,id) ON DELETE CASCADE
);


-- public.inventory_movements definição

-- Drop table

-- DROP TABLE public.inventory_movements;

CREATE TABLE public.inventory_movements (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	variant_id uuid NOT NULL,
	location_id uuid NOT NULL,
	source_id uuid NULL,
	movement_type public."inventory_movement_type" NOT NULL,
	on_hand_delta int4 DEFAULT 0 NOT NULL,
	reserved_delta int4 DEFAULT 0 NOT NULL,
	external_reference text NULL,
	idempotency_key uuid NULL,
	occurred_at timestamptz DEFAULT now() NOT NULL,
	metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT inventory_movements_check CHECK (((on_hand_delta <> 0) OR (reserved_delta <> 0))),
	CONSTRAINT inventory_movements_metadata_check CHECK ((jsonb_typeof(metadata) = 'object'::text)),
	CONSTRAINT inventory_movements_pkey PRIMARY KEY (id),
	CONSTRAINT inventory_movements_tenant_id_idempotency_key_key UNIQUE (tenant_id, idempotency_key),
	CONSTRAINT inventory_movements_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
	CONSTRAINT inventory_movements_tenant_id_location_id_fkey FOREIGN KEY (tenant_id,location_id) REFERENCES public.inventory_locations(tenant_id,id) ON DELETE RESTRICT,
	CONSTRAINT inventory_movements_tenant_id_source_id_fkey FOREIGN KEY (tenant_id,source_id) REFERENCES public.inventory_sources(tenant_id,id) ON DELETE SET NULL,
	CONSTRAINT inventory_movements_tenant_id_variant_id_fkey FOREIGN KEY (tenant_id,variant_id) REFERENCES public.product_variants(tenant_id,id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX inventory_movements_external_reference_idx ON public.inventory_movements USING btree (tenant_id, source_id, external_reference) WHERE ((source_id IS NOT NULL) AND (external_reference IS NOT NULL));
CREATE INDEX inventory_movements_tenant_variant_occurred_idx ON public.inventory_movements USING btree (tenant_id, variant_id, occurred_at DESC);


-- public.inventory_reservation_items definição

-- Drop table

-- DROP TABLE public.inventory_reservation_items;

CREATE TABLE public.inventory_reservation_items (
	tenant_id uuid NOT NULL,
	reservation_id uuid NOT NULL,
	variant_id uuid NOT NULL,
	location_id uuid NOT NULL,
	quantity int4 NOT NULL,
	CONSTRAINT inventory_reservation_items_pkey PRIMARY KEY (tenant_id, reservation_id, variant_id, location_id),
	CONSTRAINT inventory_reservation_items_quantity_check CHECK ((quantity > 0)),
	CONSTRAINT inventory_reservation_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
	CONSTRAINT inventory_reservation_items_tenant_id_location_id_fkey FOREIGN KEY (tenant_id,location_id) REFERENCES public.inventory_locations(tenant_id,id) ON DELETE RESTRICT,
	CONSTRAINT inventory_reservation_items_tenant_id_reservation_id_fkey FOREIGN KEY (tenant_id,reservation_id) REFERENCES public.inventory_reservations(tenant_id,id) ON DELETE CASCADE,
	CONSTRAINT inventory_reservation_items_tenant_id_variant_id_fkey FOREIGN KEY (tenant_id,variant_id) REFERENCES public.product_variants(tenant_id,id) ON DELETE RESTRICT
);


-- public.product_pack_items definição

-- Drop table

-- DROP TABLE public.product_pack_items;

CREATE TABLE public.product_pack_items (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	pack_id uuid NOT NULL,
	"size" text NOT NULL,
	color text NULL,
	quantity int4 NOT NULL,
	CONSTRAINT product_pack_items_pkey PRIMARY KEY (id),
	CONSTRAINT product_pack_items_quantity_check CHECK ((quantity > 0)),
	CONSTRAINT product_pack_items_pack_id_fkey FOREIGN KEY (pack_id) REFERENCES public.product_packs(id) ON DELETE CASCADE,
	CONSTRAINT product_pack_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
);


-- public.audit_events definição

-- Drop table

-- DROP TABLE public.audit_events;

CREATE TABLE public.audit_events (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	"action" public."audit_action" NOT NULL,
	entity_type public."audit_entity_type" NOT NULL,
	entity_id uuid NOT NULL,
	actor_id uuid NOT NULL,
	actor_role public."user_role" NOT NULL,
	actor_name text NOT NULL,
	metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
	occurred_at timestamptz DEFAULT now() NOT NULL,
	request_id uuid NOT NULL,
	session_id uuid NULL,
	ip_address inet NULL,
	user_agent text NULL,
	CONSTRAINT audit_events_metadata_check CHECK ((jsonb_typeof(metadata) = 'object'::text)),
	CONSTRAINT audit_events_pkey PRIMARY KEY (id)
);
CREATE INDEX audit_events_tenant_action_idx ON public.audit_events USING btree (tenant_id, action, occurred_at DESC);
CREATE INDEX audit_events_tenant_actor_idx ON public.audit_events USING btree (tenant_id, actor_id, occurred_at DESC);
CREATE INDEX audit_events_tenant_entity_idx ON public.audit_events USING btree (tenant_id, entity_type, entity_id, occurred_at DESC);
CREATE INDEX audit_events_tenant_request_idx ON public.audit_events USING btree (tenant_id, request_id, occurred_at DESC);


-- public.client_cart_items definição

-- Drop table

-- DROP TABLE public.client_cart_items;

CREATE TABLE public.client_cart_items (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	client_id uuid NOT NULL,
	cart_key text NOT NULL,
	product_id uuid NULL,
	"snapshot" jsonb NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT client_cart_items_pkey PRIMARY KEY (id),
	CONSTRAINT client_cart_items_tenant_id_client_id_cart_key_key UNIQUE (tenant_id, client_id, cart_key)
);


-- public.clients definição

-- Drop table

-- DROP TABLE public.clients;

CREATE TABLE public.clients (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	"name" text NOT NULL,
	cpf_cnpj text NULL,
	email text NULL,
	cep text NULL,
	street text NULL,
	"number" text NULL,
	complement text NULL,
	neighborhood text NULL,
	city text NULL,
	state text NULL,
	company_responsible text NULL,
	store_name text NULL,
	last_seller_id uuid NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT clients_pkey PRIMARY KEY (id),
	CONSTRAINT clients_tenant_document_unique UNIQUE (tenant_id, cpf_cnpj)
);
CREATE INDEX clients_tenant_name_idx ON public.clients USING btree (tenant_id, name);


-- public.order_items definição

-- Drop table

-- DROP TABLE public.order_items;

CREATE TABLE public.order_items (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	order_id uuid NOT NULL,
	item_key text NOT NULL,
	product_id uuid NULL,
	"snapshot" jsonb NOT NULL,
	CONSTRAINT order_items_pkey PRIMARY KEY (id)
);


-- public.order_session_items definição

-- Drop table

-- DROP TABLE public.order_session_items;

CREATE TABLE public.order_session_items (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	session_id uuid NOT NULL,
	item_key text NOT NULL,
	product_id uuid NULL,
	"snapshot" jsonb NOT NULL,
	CONSTRAINT order_session_items_pkey PRIMARY KEY (id),
	CONSTRAINT order_session_items_tenant_id_session_id_item_key_key UNIQUE (tenant_id, session_id, item_key)
);


-- public.order_sessions definição

-- Drop table

-- DROP TABLE public.order_sessions;

CREATE TABLE public.order_sessions (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	client_name text NOT NULL,
	client_id uuid NULL,
	seller_id uuid NOT NULL,
	channel public."order_channel" NOT NULL,
	status public."session_status" DEFAULT 'aberto'::session_status NOT NULL,
	shipping jsonb NULL,
	payment_token_hash text NULL,
	payment_token_created_at timestamptz NULL,
	notes text NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT order_sessions_payment_token_hash_key UNIQUE (payment_token_hash),
	CONSTRAINT order_sessions_pkey PRIMARY KEY (id)
);
CREATE INDEX order_sessions_tenant_seller_status_idx ON public.order_sessions USING btree (tenant_id, seller_id, status);


-- public.orders definição

-- Drop table

-- DROP TABLE public.orders;

CREATE TABLE public.orders (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	client_id uuid NULL,
	seller_id uuid NULL,
	client_name text NULL,
	channel public."order_channel" NOT NULL,
	total numeric(12, 2) NOT NULL,
	shipping jsonb NULL,
	payment_method text NULL,
	discount jsonb NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT orders_pkey PRIMARY KEY (id),
	CONSTRAINT orders_total_check CHECK ((total >= (0)::numeric))
);
CREATE INDEX orders_tenant_client_idx ON public.orders USING btree (tenant_id, client_id, created_at DESC);
CREATE INDEX orders_tenant_seller_idx ON public.orders USING btree (tenant_id, seller_id, created_at DESC);


-- public.user_sessions definição

-- Drop table

-- DROP TABLE public.user_sessions;

CREATE TABLE public.user_sessions (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	user_id uuid NOT NULL,
	token_hash text NOT NULL,
	expires_at timestamptz NOT NULL,
	revoked_at timestamptz NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT user_sessions_pkey PRIMARY KEY (id),
	CONSTRAINT user_sessions_token_hash_key UNIQUE (token_hash)
);


-- public.users definição

-- Drop table

-- DROP TABLE public.users;

CREATE TABLE public.users (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	email text NOT NULL,
	"name" text NOT NULL,
	"role" public."user_role" NOT NULL,
	password_hash text NOT NULL,
	client_id uuid NULL,
	permissions jsonb DEFAULT '{}'::jsonb NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT users_pkey PRIMARY KEY (id),
	CONSTRAINT users_tenant_id_email_key UNIQUE (tenant_id, email)
);
CREATE INDEX users_tenant_role_idx ON public.users USING btree (tenant_id, role);


-- public.audit_events chaves estrangeiras

ALTER TABLE public.audit_events ADD CONSTRAINT audit_events_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.user_sessions(id) ON DELETE SET NULL;
ALTER TABLE public.audit_events ADD CONSTRAINT audit_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


-- public.client_cart_items chaves estrangeiras

ALTER TABLE public.client_cart_items ADD CONSTRAINT client_cart_items_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;
ALTER TABLE public.client_cart_items ADD CONSTRAINT client_cart_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


-- public.clients chaves estrangeiras

ALTER TABLE public.clients ADD CONSTRAINT clients_last_seller_id_fkey FOREIGN KEY (last_seller_id) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.clients ADD CONSTRAINT clients_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


-- public.order_items chaves estrangeiras

ALTER TABLE public.order_items ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


-- public.order_session_items chaves estrangeiras

ALTER TABLE public.order_session_items ADD CONSTRAINT order_session_items_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.order_sessions(id) ON DELETE CASCADE;
ALTER TABLE public.order_session_items ADD CONSTRAINT order_session_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


-- public.order_sessions chaves estrangeiras

ALTER TABLE public.order_sessions ADD CONSTRAINT order_sessions_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;
ALTER TABLE public.order_sessions ADD CONSTRAINT order_sessions_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.users(id) ON DELETE RESTRICT;
ALTER TABLE public.order_sessions ADD CONSTRAINT order_sessions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


-- public.orders chaves estrangeiras

ALTER TABLE public.orders ADD CONSTRAINT orders_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD CONSTRAINT orders_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD CONSTRAINT orders_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


-- public.user_sessions chaves estrangeiras

ALTER TABLE public.user_sessions ADD CONSTRAINT user_sessions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.user_sessions ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


-- public.users chaves estrangeiras

ALTER TABLE public.users ADD CONSTRAINT users_client_id_fk FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;
ALTER TABLE public.users ADD CONSTRAINT users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;



-- DROP FUNCTION public.app_role();

CREATE OR REPLACE FUNCTION public.app_role()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$ SELECT NULLIF(current_setting('app.role', true), '') $function$
;

-- DROP FUNCTION public.app_tenant_id();

CREATE OR REPLACE FUNCTION public.app_tenant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $function$
;

-- DROP FUNCTION public.app_user_id();

CREATE OR REPLACE FUNCTION public.app_user_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $function$
;

-- DROP FUNCTION public.armor(bytea, _text, _text);

CREATE OR REPLACE FUNCTION public.armor(bytea, text[], text[])
 RETURNS text
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_armor$function$
;

-- DROP FUNCTION public.armor(bytea);

CREATE OR REPLACE FUNCTION public.armor(bytea)
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

-- DROP FUNCTION public.digest(text, text);

CREATE OR REPLACE FUNCTION public.digest(text, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_digest$function$
;

-- DROP FUNCTION public.digest(bytea, text);

CREATE OR REPLACE FUNCTION public.digest(bytea, text)
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

-- DROP FUNCTION public.gen_salt(text);

CREATE OR REPLACE FUNCTION public.gen_salt(text)
 RETURNS text
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_gen_salt$function$
;

-- DROP FUNCTION public.gen_salt(text, int4);

CREATE OR REPLACE FUNCTION public.gen_salt(text, integer)
 RETURNS text
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_gen_salt_rounds$function$
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

-- DROP FUNCTION public.pgp_pub_decrypt(bytea, bytea);

CREATE OR REPLACE FUNCTION public.pgp_pub_decrypt(bytea, bytea)
 RETURNS text
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_pub_decrypt_text$function$
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

-- DROP FUNCTION public.pgp_pub_decrypt_bytea(bytea, bytea, text, text);

CREATE OR REPLACE FUNCTION public.pgp_pub_decrypt_bytea(bytea, bytea, text, text)
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

-- DROP FUNCTION public.pgp_pub_decrypt_bytea(bytea, bytea, text);

CREATE OR REPLACE FUNCTION public.pgp_pub_decrypt_bytea(bytea, bytea, text)
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

-- DROP FUNCTION public.pgp_pub_encrypt_bytea(bytea, bytea, text);

CREATE OR REPLACE FUNCTION public.pgp_pub_encrypt_bytea(bytea, bytea, text)
 RETURNS bytea
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_pub_encrypt_bytea$function$
;

-- DROP FUNCTION public.pgp_pub_encrypt_bytea(bytea, bytea);

CREATE OR REPLACE FUNCTION public.pgp_pub_encrypt_bytea(bytea, bytea)
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

-- DROP FUNCTION public.pgp_sym_encrypt(text, text, text);

CREATE OR REPLACE FUNCTION public.pgp_sym_encrypt(text, text, text)
 RETURNS bytea
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_sym_encrypt_text$function$
;

-- DROP FUNCTION public.pgp_sym_encrypt(text, text);

CREATE OR REPLACE FUNCTION public.pgp_sym_encrypt(text, text)
 RETURNS bytea
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_sym_encrypt_text$function$
;

-- DROP FUNCTION public.pgp_sym_encrypt_bytea(bytea, text, text);

CREATE OR REPLACE FUNCTION public.pgp_sym_encrypt_bytea(bytea, text, text)
 RETURNS bytea
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_sym_encrypt_bytea$function$
;

-- DROP FUNCTION public.pgp_sym_encrypt_bytea(bytea, text);

CREATE OR REPLACE FUNCTION public.pgp_sym_encrypt_bytea(bytea, text)
 RETURNS bytea
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_sym_encrypt_bytea$function$
;
