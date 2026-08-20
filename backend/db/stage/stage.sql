-- DROP SCHEMA public;

CREATE SCHEMA public AUTHORIZATION pg_database_owner;

-- DROP TYPE public."audit_action";

CREATE TYPE public."audit_action" AS ENUM (
	'client.created',
	'client.updated',
	'client_cart.saved',
	'order_session.created',
	'authentication.logged_in',
	'authentication.logged_out',
	'user.created',
	'company.created',
	'company.updated',
	'erp_integration.configured',
	'erp_integration.activated',
	'erp_integration.deactivated');

-- DROP TYPE public."audit_entity_type";

CREATE TYPE public."audit_entity_type" AS ENUM (
	'client',
	'client_cart',
	'order_session',
	'user',
	'company',
	'erp_integration');

-- DROP TYPE public."banner_media_type";

CREATE TYPE public."banner_media_type" AS ENUM (
	'image',
	'video');

-- DROP TYPE public."classification_kind";

CREATE TYPE public."classification_kind" AS ENUM (
	'category',
	'subcategory',
	'collection',
	'brand');

-- DROP TYPE public."discount_type";

CREATE TYPE public."discount_type" AS ENUM (
	'quantity',
	'products');

-- DROP TYPE public."home_section_type";

CREATE TYPE public."home_section_type" AS ENUM (
	'banner',
	'product');

-- DROP TYPE public."inventory_location_kind";

CREATE TYPE public."inventory_location_kind" AS ENUM (
	'warehouse',
	'store',
	'virtual');

-- DROP TYPE public."inventory_movement_type";

CREATE TYPE public."inventory_movement_type" AS ENUM (
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

-- DROP TYPE public."inventory_reservation_status";

CREATE TYPE public."inventory_reservation_status" AS ENUM (
	'active',
	'released',
	'consumed',
	'expired');

-- DROP TYPE public."inventory_source_kind";

CREATE TYPE public."inventory_source_kind" AS ENUM (
	'manual',
	'erp',
	'marketplace');

-- DROP TYPE public."order_channel";

CREATE TYPE public."order_channel" AS ENUM (
	'presencial',
	'whatsapp',
	'online');

-- DROP TYPE public."platform_plan_code";

CREATE TYPE public."platform_plan_code" AS ENUM (
	'trial',
	'essential',
	'professional',
	'enterprise');

-- DROP TYPE public."session_status";

CREATE TYPE public."session_status" AS ENUM (
	'aberto',
	'fechado',
	'aguardando_pagamento');

-- DROP TYPE public."tenant_contract_billing_cycle";

CREATE TYPE public."tenant_contract_billing_cycle" AS ENUM (
	'monthly',
	'annual',
	'custom');

-- DROP TYPE public."tenant_contract_status";

CREATE TYPE public."tenant_contract_status" AS ENUM (
	'draft',
	'trialing',
	'active',
	'past_due',
	'suspended',
	'cancelled',
	'expired');

-- DROP TYPE public."tenant_status";

CREATE TYPE public."tenant_status" AS ENUM (
	'active',
	'inactive',
	'archived');

-- DROP TYPE public."user_role";

CREATE TYPE public."user_role" AS ENUM (
	'administrador',
	'vendedora',
	'expedicao',
	'entregador',
	'cliente');

-- DROP TYPE public."variant_availability_mode";

CREATE TYPE public."variant_availability_mode" AS ENUM (
	'in_stock',
	'preorder',
	'backorder',
	'out_of_stock');

-- DROP SEQUENCE public.external_api_request_log_id_seq;

CREATE SEQUENCE public.external_api_request_log_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.session_events_id_seq;

CREATE SEQUENCE public.session_events_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;-- public.platform_plans definição

-- Drop table

-- DROP TABLE public.platform_plans;

CREATE TABLE public.platform_plans (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	code public."platform_plan_code" NOT NULL,
	"name" text NOT NULL,
	active bool DEFAULT true NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT platform_plans_code_key UNIQUE (code),
	CONSTRAINT platform_plans_pkey PRIMARY KEY (id)
);


-- public.platform_users definição

-- Drop table

-- DROP TABLE public.platform_users;

CREATE TABLE public.platform_users (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	email text NOT NULL,
	"name" text NOT NULL,
	password_hash text NOT NULL,
	active bool DEFAULT true NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT platform_users_email_key UNIQUE (email),
	CONSTRAINT platform_users_pkey PRIMARY KEY (id)
);


-- public.schema_migrations definição

-- Drop table

-- DROP TABLE public.schema_migrations;

CREATE TABLE public.schema_migrations (
	"name" text NOT NULL,
	applied_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT schema_migrations_pkey PRIMARY KEY (name)
);


-- public.tenants definição

-- Drop table

-- DROP TABLE public.tenants;

CREATE TABLE public.tenants (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	slug text NOT NULL,
	"name" text NOT NULL,
	active bool DEFAULT true NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	status public."tenant_status" DEFAULT 'active'::tenant_status NOT NULL,
	CONSTRAINT tenants_pkey PRIMARY KEY (id),
	CONSTRAINT tenants_reserved_slug_check CHECK ((slug <> 'control'::text)),
	CONSTRAINT tenants_slug_check CHECK ((slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'::text)),
	CONSTRAINT tenants_slug_key UNIQUE (slug)
);


-- public.classification_types definição

-- Drop table

-- DROP TABLE public.classification_types;

CREATE TABLE public.classification_types (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	kind public."classification_kind" NOT NULL,
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


-- public.companies definição

-- Drop table

-- DROP TABLE public.companies;

CREATE TABLE public.companies (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	cnpj text NOT NULL,
	razao_social text NOT NULL,
	nome_fantasia text NULL,
	inscricao_estadual text NULL,
	is_matriz bool DEFAULT false NOT NULL,
	cep text NULL,
	street text NULL,
	"number" text NULL,
	complement text NULL,
	neighborhood text NULL,
	city text NULL,
	state text NULL,
	active bool DEFAULT true NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT companies_pkey PRIMARY KEY (id),
	CONSTRAINT companies_tenant_id_cnpj_key UNIQUE (tenant_id, cnpj),
	CONSTRAINT companies_tenant_id_id_key UNIQUE (tenant_id, id),
	CONSTRAINT companies_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX companies_one_matriz_per_tenant_idx ON public.companies USING btree (tenant_id) WHERE is_matriz;


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


-- public.external_api_request_log definição

-- Drop table

-- DROP TABLE public.external_api_request_log;

CREATE TABLE public.external_api_request_log (
	id bigserial NOT NULL,
	tenant_id uuid NOT NULL,
	provider text NOT NULL,
	operation text NOT NULL,
	"method" text NOT NULL,
	endpoint text NOT NULL,
	endpoint_path text NULL,
	status_code int4 NULL,
	success bool NOT NULL,
	attempt_count int4 DEFAULT 1 NOT NULL,
	wait_ms int4 DEFAULT 0 NOT NULL,
	duration_ms int4 DEFAULT 0 NOT NULL,
	request_payload jsonb NULL,
	response_body text NULL,
	error_message text NULL,
	error_class text NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT external_api_request_log_attempt_count_check CHECK ((attempt_count >= 1)),
	CONSTRAINT external_api_request_log_duration_ms_check CHECK ((duration_ms >= 0)),
	CONSTRAINT external_api_request_log_pkey PRIMARY KEY (id),
	CONSTRAINT external_api_request_log_wait_ms_check CHECK ((wait_ms >= 0)),
	CONSTRAINT external_api_request_log_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
);
CREATE INDEX external_api_request_log_tenant_provider_idx ON public.external_api_request_log USING btree (tenant_id, provider, created_at DESC);


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


-- public.platform_sessions definição

-- Drop table

-- DROP TABLE public.platform_sessions;

CREATE TABLE public.platform_sessions (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	user_id uuid NOT NULL,
	token_hash text NOT NULL,
	expires_at timestamptz NOT NULL,
	revoked_at timestamptz NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT platform_sessions_pkey PRIMARY KEY (id),
	CONSTRAINT platform_sessions_token_hash_key UNIQUE (token_hash),
	CONSTRAINT platform_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE
);
CREATE INDEX platform_sessions_active_token_idx ON public.platform_sessions USING btree (token_hash, expires_at) WHERE (revoked_at IS NULL);


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
	reference_id text NULL,
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
	CONSTRAINT products_tenant_id_reference_id_key UNIQUE (tenant_id, reference_id),
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


-- public.tenant_contracts definição

-- Drop table

-- DROP TABLE public.tenant_contracts;

CREATE TABLE public.tenant_contracts (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	plan_id uuid NOT NULL,
	status public."tenant_contract_status" DEFAULT 'draft'::tenant_contract_status NOT NULL,
	billing_cycle public."tenant_contract_billing_cycle" DEFAULT 'monthly'::tenant_contract_billing_cycle NOT NULL,
	currency bpchar(3) DEFAULT 'BRL'::bpchar NOT NULL,
	price_cents int4 NULL,
	starts_at timestamptz NULL,
	ends_at timestamptz NULL,
	cancelled_at timestamptz NULL,
	external_reference text NULL,
	terms jsonb DEFAULT '{}'::jsonb NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT tenant_contracts_check CHECK (((ends_at IS NULL) OR (starts_at IS NULL) OR (ends_at > starts_at))),
	CONSTRAINT tenant_contracts_currency_check CHECK ((currency ~ '^[A-Z]{3}$'::text)),
	CONSTRAINT tenant_contracts_pkey PRIMARY KEY (id),
	CONSTRAINT tenant_contracts_price_cents_check CHECK (((price_cents IS NULL) OR (price_cents >= 0))),
	CONSTRAINT tenant_contracts_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.platform_plans(id) ON DELETE RESTRICT,
	CONSTRAINT tenant_contracts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT
);
CREATE INDEX tenant_contracts_current_by_tenant_idx ON public.tenant_contracts USING btree (tenant_id, created_at DESC) WHERE (status = ANY (ARRAY['draft'::tenant_contract_status, 'trialing'::tenant_contract_status, 'active'::tenant_contract_status, 'past_due'::tenant_contract_status, 'suspended'::tenant_contract_status]));


-- public.tenant_erp_integrations definição

-- Drop table

-- DROP TABLE public.tenant_erp_integrations;

CREATE TABLE public.tenant_erp_integrations (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	provider text NOT NULL,
	credentials jsonb DEFAULT '{}'::jsonb NOT NULL,
	active bool DEFAULT true NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT tenant_erp_integrations_credentials_check CHECK ((jsonb_typeof(credentials) = 'object'::text)),
	CONSTRAINT tenant_erp_integrations_pkey PRIMARY KEY (id),
	CONSTRAINT tenant_erp_integrations_provider_check CHECK ((provider ~ '^[a-z0-9][a-z0-9_-]{0,62}$'::text)),
	CONSTRAINT tenant_erp_integrations_tenant_id_id_key UNIQUE (tenant_id, id),
	CONSTRAINT tenant_erp_integrations_tenant_provider_key UNIQUE (tenant_id, provider),
	CONSTRAINT tenant_erp_integrations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX tenant_erp_integrations_one_active_idx ON public.tenant_erp_integrations USING btree (tenant_id) WHERE active;


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


-- public.erp_external_references definição

-- Drop table

-- DROP TABLE public.erp_external_references;

CREATE TABLE public.erp_external_references (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	integration_id uuid NOT NULL,
	entity_type text NOT NULL,
	internal_id uuid NOT NULL,
	external_id text NOT NULL,
	metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT erp_external_references_entity_type_check CHECK ((entity_type = ANY (ARRAY['product'::text, 'order'::text, 'client'::text, 'company'::text]))),
	CONSTRAINT erp_external_references_metadata_check CHECK ((jsonb_typeof(metadata) = 'object'::text)),
	CONSTRAINT erp_external_references_pkey PRIMARY KEY (id),
	CONSTRAINT erp_external_references_tenant_id_integration_id_entity_ty_key1 UNIQUE (tenant_id, integration_id, entity_type, internal_id),
	CONSTRAINT erp_external_references_tenant_id_integration_id_entity_typ_key UNIQUE (tenant_id, integration_id, entity_type, external_id),
	CONSTRAINT erp_external_references_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
	CONSTRAINT erp_external_references_tenant_id_integration_id_fkey FOREIGN KEY (tenant_id,integration_id) REFERENCES public.tenant_erp_integrations(tenant_id,id) ON DELETE CASCADE
);


-- public.external_api_provider_status definição

-- Drop table

-- DROP TABLE public.external_api_provider_status;

CREATE TABLE public.external_api_provider_status (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	provider text NOT NULL,
	status text DEFAULT 'desconhecido'::text NOT NULL,
	last_success_at timestamptz NULL,
	last_error_at timestamptz NULL,
	last_error_code text NULL,
	last_error_summary text NULL,
	last_request_log_id int8 NULL,
	expected_back_online_at timestamptz NULL,
	public_message text NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT external_api_provider_status_pkey PRIMARY KEY (id),
	CONSTRAINT external_api_provider_status_status_check CHECK ((status = ANY (ARRAY['operacional'::text, 'degradado'::text, 'indisponivel'::text, 'manutencao'::text, 'desconhecido'::text]))),
	CONSTRAINT external_api_provider_status_tenant_id_provider_key UNIQUE (tenant_id, provider),
	CONSTRAINT external_api_provider_status_last_request_log_id_fkey FOREIGN KEY (last_request_log_id) REFERENCES public.external_api_request_log(id) ON DELETE SET NULL,
	CONSTRAINT external_api_provider_status_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
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
	vesti_catalog_slug text NULL,
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


-- public.notification_subscriptions definição

-- Drop table

-- DROP TABLE public.notification_subscriptions;

CREATE TABLE public.notification_subscriptions (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	user_id uuid NOT NULL,
	installation_id varchar(120) NOT NULL,
	endpoint text NOT NULL,
	p256dh varchar(255) NOT NULL,
	auth varchar(255) NOT NULL,
	user_agent text NULL,
	active bool DEFAULT true NOT NULL,
	last_seen_at timestamptz DEFAULT now() NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT notification_subscriptions_pkey PRIMARY KEY (id),
	CONSTRAINT notification_subscriptions_tenant_id_endpoint_key UNIQUE (tenant_id, endpoint),
	CONSTRAINT notification_subscriptions_tenant_id_installation_id_key UNIQUE (tenant_id, installation_id)
);
CREATE INDEX notification_subscriptions_user_active_idx ON public.notification_subscriptions USING btree (tenant_id, user_id) WHERE active;


-- public.notifications definição

-- Drop table

-- DROP TABLE public.notifications;

CREATE TABLE public.notifications (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	user_id uuid NOT NULL,
	"module" varchar(100) NOT NULL,
	"event" varchar(120) NOT NULL,
	title varchar(180) NOT NULL,
	body text NOT NULL,
	url text DEFAULT '/'::text NOT NULL,
	tag varchar(120) NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	read_at timestamptz NULL,
	delivery_status varchar(20) DEFAULT 'pending'::character varying NOT NULL,
	attempts int4 DEFAULT 0 NOT NULL,
	next_attempt_at timestamptz DEFAULT now() NOT NULL,
	processed_at timestamptz NULL,
	delivery_error text NULL,
	provider_response jsonb DEFAULT '{}'::jsonb NOT NULL,
	idempotency_key varchar(128) NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT notifications_attempts_check CHECK ((attempts >= 0)),
	CONSTRAINT notifications_data_check CHECK ((jsonb_typeof(data) = 'object'::text)),
	CONSTRAINT notifications_delivery_status_check CHECK (((delivery_status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'sent'::character varying, 'failed'::character varying])::text[]))),
	CONSTRAINT notifications_pkey PRIMARY KEY (id),
	CONSTRAINT notifications_provider_response_check CHECK ((jsonb_typeof(provider_response) = 'object'::text)),
	CONSTRAINT notifications_tenant_id_idempotency_key_key UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX notifications_dispatch_idx ON public.notifications USING btree (tenant_id, delivery_status, next_attempt_at) WHERE ((delivery_status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying])::text[]));
CREATE INDEX notifications_inbox_idx ON public.notifications USING btree (tenant_id, user_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON public.notifications USING btree (tenant_id, user_id, created_at DESC) WHERE (read_at IS NULL);


-- public.order_books definição

-- Drop table

-- DROP TABLE public.order_books;

CREATE TABLE public.order_books (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	seller_id uuid NOT NULL,
	"name" text NOT NULL,
	status text DEFAULT 'aberto'::text NOT NULL,
	is_active bool DEFAULT true NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT order_books_pkey PRIMARY KEY (id),
	CONSTRAINT order_books_status_check CHECK ((status = ANY (ARRAY['aberto'::text, 'fechado'::text])))
);
CREATE UNIQUE INDEX order_books_one_active_per_seller_idx ON public.order_books USING btree (tenant_id, seller_id) WHERE (is_active AND (status = 'aberto'::text));
CREATE INDEX order_books_tenant_seller_updated_idx ON public.order_books USING btree (tenant_id, seller_id, updated_at DESC);


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
	order_book_id uuid NOT NULL,
	CONSTRAINT order_sessions_payment_token_hash_key UNIQUE (payment_token_hash),
	CONSTRAINT order_sessions_pkey PRIMARY KEY (id)
);
CREATE INDEX order_sessions_tenant_book_status_idx ON public.order_sessions USING btree (tenant_id, order_book_id, status, updated_at DESC);


-- public.order_session_participants definiÃ§Ã£o

-- Drop table

-- DROP TABLE public.order_session_participants;

CREATE TABLE public.order_session_participants (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	order_session_id uuid NOT NULL,
	user_id uuid NOT NULL,
	first_joined_at timestamptz DEFAULT now() NOT NULL,
	last_joined_at timestamptz DEFAULT now() NOT NULL,
	last_left_at timestamptz NULL,
	join_count int4 DEFAULT 1 NOT NULL,
	CONSTRAINT order_session_participants_join_count_check CHECK ((join_count > 0)),
	CONSTRAINT order_session_participants_pkey PRIMARY KEY (id),
	CONSTRAINT order_session_participants_tenant_id_order_session_id_user_id_key UNIQUE (tenant_id, order_session_id, user_id)
);
CREATE INDEX order_session_participants_session_idx ON public.order_session_participants USING btree (tenant_id, order_session_id, last_joined_at DESC);
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


-- public.realtime_tickets definição

-- Drop table

-- DROP TABLE public.realtime_tickets;

CREATE TABLE public.realtime_tickets (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	order_session_id uuid NOT NULL,
	user_id uuid NOT NULL,
	"role" text NOT NULL,
	token_hash text NOT NULL,
	expires_at timestamptz NOT NULL,
	used_at timestamptz NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT realtime_tickets_pkey PRIMARY KEY (id)
);
CREATE INDEX realtime_tickets_session_idx ON public.realtime_tickets USING btree (order_session_id);
CREATE UNIQUE INDEX realtime_tickets_token_hash_idx ON public.realtime_tickets USING btree (token_hash);


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
	deleted_at timestamptz NULL,
	CONSTRAINT users_pkey PRIMARY KEY (id)
);
CREATE INDEX users_tenant_active_role_idx ON public.users USING btree (tenant_id, role) WHERE (deleted_at IS NULL);
CREATE UNIQUE INDEX users_tenant_email_active_key ON public.users USING btree (tenant_id, email) WHERE (deleted_at IS NULL);
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


-- public.notification_subscriptions chaves estrangeiras

ALTER TABLE public.notification_subscriptions ADD CONSTRAINT notification_subscriptions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.notification_subscriptions ADD CONSTRAINT notification_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


-- public.notifications chaves estrangeiras

ALTER TABLE public.notifications ADD CONSTRAINT notifications_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


-- public.order_books chaves estrangeiras

ALTER TABLE public.order_books ADD CONSTRAINT order_books_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.users(id) ON DELETE RESTRICT;
ALTER TABLE public.order_books ADD CONSTRAINT order_books_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


-- public.order_items chaves estrangeiras

ALTER TABLE public.order_items ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


-- public.order_session_items chaves estrangeiras

ALTER TABLE public.order_session_items ADD CONSTRAINT order_session_items_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.order_sessions(id) ON DELETE CASCADE;
ALTER TABLE public.order_session_items ADD CONSTRAINT order_session_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


-- public.order_sessions chaves estrangeiras

ALTER TABLE public.order_sessions ADD CONSTRAINT order_sessions_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;
ALTER TABLE public.order_sessions ADD CONSTRAINT order_sessions_order_book_id_fkey FOREIGN KEY (order_book_id) REFERENCES public.order_books(id) ON DELETE RESTRICT;
ALTER TABLE public.order_sessions ADD CONSTRAINT order_sessions_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.users(id) ON DELETE RESTRICT;
ALTER TABLE public.order_sessions ADD CONSTRAINT order_sessions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


-- public.order_session_participants chaves estrangeiras

ALTER TABLE public.order_session_participants ADD CONSTRAINT order_session_participants_order_session_id_fkey FOREIGN KEY (order_session_id) REFERENCES public.order_sessions(id) ON DELETE CASCADE;
ALTER TABLE public.order_session_participants ADD CONSTRAINT order_session_participants_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


-- public.orders chaves estrangeiras

ALTER TABLE public.orders ADD CONSTRAINT orders_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD CONSTRAINT orders_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD CONSTRAINT orders_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


-- public.realtime_tickets chaves estrangeiras

ALTER TABLE public.realtime_tickets ADD CONSTRAINT realtime_tickets_order_session_id_fkey FOREIGN KEY (order_session_id) REFERENCES public.order_sessions(id) ON DELETE CASCADE;
ALTER TABLE public.realtime_tickets ADD CONSTRAINT realtime_tickets_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.realtime_tickets ADD CONSTRAINT realtime_tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


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
