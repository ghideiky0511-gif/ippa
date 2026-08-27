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
	'erp_integration.deactivated',
	'commercial_group.created',
	'commercial_group.updated',
	'commercial_group.activated',
	'commercial_group.deactivated',
	'commercial_group.member_added',
	'commercial_group.member_removed',
	'commercial_group.primary_member_changed',
	'provider_order.resend_requested',
	'user.updated',
	'order.manually_marked_paid',
	'order.manually_cancelled',
	'provider_order.cancel_requested',
	'payment_integration.configured',
	'payment_integration.activated',
	'payment_integration.deactivated');

-- DROP TYPE public."audit_entity_type";

CREATE TYPE public."audit_entity_type" AS ENUM (
	'client',
	'client_cart',
	'order_session',
	'user',
	'company',
	'erp_integration',
	'commercial_group',
	'provider_order',
	'order',
	'payment_integration');

-- DROP TYPE public."banner_media_type";

CREATE TYPE public."banner_media_type" AS ENUM (
	'image',
	'video');

-- DROP TYPE public.discount_source;

CREATE TYPE public.discount_source AS ENUM (
	'manual',
	'erp');

-- DROP TYPE public."discount_type";

CREATE TYPE public."discount_type" AS ENUM (
	'quantity',
	'products');

-- DROP TYPE public."freight_provider_kind";

CREATE TYPE public."freight_provider_kind" AS ENUM (
	'pickup',
	'fixed',
	'carrier');

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

-- DROP TYPE public."order_freight_method";

CREATE TYPE public."order_freight_method" AS ENUM (
	'transportadora',
	'correios',
	'excursao',
	'loja_vizinha',
	'retirada_local',
	'motoboy',
	'entrega_propria');

-- DROP TYPE public."order_freight_status";

CREATE TYPE public."order_freight_status" AS ENUM (
	'aguardando',
	'etiqueta_emitida',
	'em_transporte',
	'entregue',
	'devolvido',
	'cancelado');

-- DROP TYPE public."payment_charge_method";

CREATE TYPE public."payment_charge_method" AS ENUM (
	'pix',
	'boleto',
	'cartao');

-- DROP TYPE public."payment_charge_status";

CREATE TYPE public."payment_charge_status" AS ENUM (
	'pending',
	'processing',
	'authorized',
	'paid',
	'failed',
	'expired',
	'cancelled');

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
	'aguardando_pagamento',
	'cancelado');

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
-- DROP SEQUENCE public.order_item_events_id_seq;

CREATE SEQUENCE public.order_item_events_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.order_item_fulfillment_events_id_seq;

CREATE SEQUENCE public.order_item_fulfillment_events_id_seq
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
	NO CYCLE;-- public.platform_plans definition

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
ALTER TABLE public.platform_plans ENABLE ROW LEVEL SECURITY;


-- public.platform_users definition

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
ALTER TABLE public.platform_users ENABLE ROW LEVEL SECURITY;


-- public.schema_migrations definition

-- Drop table

-- DROP TABLE public.schema_migrations;

CREATE TABLE public.schema_migrations (
	"name" text NOT NULL,
	applied_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT schema_migrations_pkey PRIMARY KEY (name)
);


-- public.tenants definition

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


-- public.ai_tool_prompt_versions definition

-- Drop table

-- DROP TABLE public.ai_tool_prompt_versions;

CREATE TABLE public.ai_tool_prompt_versions (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	tool_key text NOT NULL,
	"version" int4 NOT NULL,
	instructions text NOT NULL,
	status text DEFAULT 'draft'::text NOT NULL,
	created_by_platform_user_id uuid NULL,
	activated_by_platform_user_id uuid NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	activated_at timestamptz NULL,
	CONSTRAINT ai_tool_prompt_versions_check CHECK ((((status = 'active'::text) AND (activated_at IS NOT NULL)) OR (status <> 'active'::text))),
	CONSTRAINT ai_tool_prompt_versions_instructions_check CHECK (((length(btrim(instructions)) >= 20) AND (length(btrim(instructions)) <= 20000))),
	CONSTRAINT ai_tool_prompt_versions_pkey PRIMARY KEY (id),
	CONSTRAINT ai_tool_prompt_versions_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text]))),
	CONSTRAINT ai_tool_prompt_versions_tenant_id_id_key UNIQUE (tenant_id, id),
	CONSTRAINT ai_tool_prompt_versions_tenant_id_tool_key_version_key UNIQUE (tenant_id, tool_key, version),
	CONSTRAINT ai_tool_prompt_versions_tool_key_check CHECK ((tool_key ~ '^[a-z][a-z0-9._-]{1,63}$'::text)),
	CONSTRAINT ai_tool_prompt_versions_version_check CHECK ((version > 0)),
	CONSTRAINT ai_tool_prompt_versions_activated_by_platform_user_id_fkey FOREIGN KEY (activated_by_platform_user_id) REFERENCES public.platform_users(id) ON DELETE SET NULL,
	CONSTRAINT ai_tool_prompt_versions_created_by_platform_user_id_fkey FOREIGN KEY (created_by_platform_user_id) REFERENCES public.platform_users(id) ON DELETE SET NULL,
	CONSTRAINT ai_tool_prompt_versions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
);
CREATE INDEX ai_tool_prompt_versions_history_idx ON public.ai_tool_prompt_versions USING btree (tenant_id, tool_key, version DESC);
CREATE UNIQUE INDEX ai_tool_prompt_versions_one_active_idx ON public.ai_tool_prompt_versions USING btree (tenant_id, tool_key) WHERE (status = 'active'::text);

-- Table Triggers

create trigger ai_tool_prompt_versions_immutable_content before
update
    on
    public.ai_tool_prompt_versions for each row execute function prevent_ai_tool_prompt_version_content_update();
ALTER TABLE public.ai_tool_prompt_versions ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY ai_tool_prompt_versions_tenant_read ON public.ai_tool_prompt_versions
 AS PERMISSIVE
 FOR SELECT
 TO ippa_app
 USING (((tenant_id = app_tenant_id()) AND (status = 'active'::text)));


-- public.commercial_groups definition

-- Drop table

-- DROP TABLE public.commercial_groups;

CREATE TABLE public.commercial_groups (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	"name" text NOT NULL,
	group_type text DEFAULT 'client'::text NOT NULL,
	is_active bool DEFAULT true NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT commercial_groups_group_type_check CHECK ((group_type = 'client'::text)),
	CONSTRAINT commercial_groups_pkey PRIMARY KEY (id),
	CONSTRAINT commercial_groups_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
);
CREATE INDEX commercial_groups_tenant_name_idx ON public.commercial_groups USING btree (tenant_id, name);
ALTER TABLE public.commercial_groups ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY commercial_groups_tenant_isolation ON public.commercial_groups
 AS PERMISSIVE
 FOR ALL
 TO ippa_app
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.companies definition

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
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.companies
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.external_api_request_log definition

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
ALTER TABLE public.external_api_request_log ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY external_api_request_log_tenant_isolation ON public.external_api_request_log
 AS PERMISSIVE
 FOR ALL
 TO ippa_app
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.freight_providers definition

-- Drop table

-- DROP TABLE public.freight_providers;

CREATE TABLE public.freight_providers (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	code text NOT NULL,
	"name" text NOT NULL,
	kind public."freight_provider_kind" NOT NULL,
	active bool DEFAULT true NOT NULL,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	credentials jsonb DEFAULT '{}'::jsonb NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT freight_providers_code_check CHECK ((code ~ '^[a-z0-9][a-z0-9_-]{0,62}$'::text)),
	CONSTRAINT freight_providers_configuration_check CHECK ((jsonb_typeof(configuration) = 'object'::text)),
	CONSTRAINT freight_providers_credentials_check CHECK ((jsonb_typeof(credentials) = 'object'::text)),
	CONSTRAINT freight_providers_pkey PRIMARY KEY (id),
	CONSTRAINT freight_providers_tenant_id_code_key UNIQUE (tenant_id, code),
	CONSTRAINT freight_providers_tenant_id_id_key UNIQUE (tenant_id, id),
	CONSTRAINT freight_providers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
);
CREATE INDEX freight_providers_tenant_active_idx ON public.freight_providers USING btree (tenant_id) WHERE active;
ALTER TABLE public.freight_providers ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.freight_providers
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.highlights definition

-- Drop table

-- DROP TABLE public.highlights;

CREATE TABLE public.highlights (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	"label" text NOT NULL,
	show_in_catalog bool DEFAULT false NOT NULL,
	CONSTRAINT highlights_pkey PRIMARY KEY (id),
	CONSTRAINT highlights_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
);
ALTER TABLE public.highlights ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.highlights
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.home_ai_history definition

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
ALTER TABLE public.home_ai_history ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.home_ai_history
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.inventory_reservations definition

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
ALTER TABLE public.inventory_reservations ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.inventory_reservations
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.inventory_sources definition

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
ALTER TABLE public.inventory_sources ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.inventory_sources
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.platform_sessions definition

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
ALTER TABLE public.platform_sessions ENABLE ROW LEVEL SECURITY;


-- public.products definition

-- Drop table

-- DROP TABLE public.products;

CREATE TABLE public.products (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	"name" text NOT NULL,
	description text DEFAULT ''::text NOT NULL,
	reference_id text NULL,
	price numeric(12, 2) NOT NULL,
	suggested_retail_price numeric(12, 2) NULL,
	markup numeric(8, 3) NULL,
	display_position int4 NULL,
	media jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	is_active bool DEFAULT true NOT NULL,
	source_origin text DEFAULT 'manual'::text NOT NULL,
	CONSTRAINT products_pkey PRIMARY KEY (id),
	CONSTRAINT products_price_check CHECK ((price >= (0)::numeric)),
	CONSTRAINT products_source_origin_check CHECK ((source_origin = ANY (ARRAY['manual'::text, 'bootstrap'::text, 'erp'::text]))),
	CONSTRAINT products_tenant_id_id_key UNIQUE (tenant_id, id),
	CONSTRAINT products_tenant_id_reference_id_key UNIQUE (tenant_id, reference_id),
	CONSTRAINT products_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
);
CREATE INDEX products_tenant_active_idx ON public.products USING btree (tenant_id, updated_at DESC) WHERE is_active;
CREATE INDEX products_tenant_position_idx ON public.products USING btree (tenant_id, display_position);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.products
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.session_events definition

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
ALTER TABLE public.session_events ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.session_events
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.tenant_contracts definition

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
ALTER TABLE public.tenant_contracts ENABLE ROW LEVEL SECURITY;


-- public.tenant_erp_integrations definition

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
ALTER TABLE public.tenant_erp_integrations ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.tenant_erp_integrations
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.tenant_order_counters definition

-- Drop table

-- DROP TABLE public.tenant_order_counters;

CREATE TABLE public.tenant_order_counters (
	tenant_id uuid NOT NULL,
	next_order_number int4 NOT NULL,
	CONSTRAINT tenant_order_counters_next_order_number_check CHECK ((next_order_number > 0)),
	CONSTRAINT tenant_order_counters_pkey PRIMARY KEY (tenant_id),
	CONSTRAINT tenant_order_counters_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
);
ALTER TABLE public.tenant_order_counters ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.tenant_order_counters
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.tenant_payment_integrations definition

-- Drop table

-- DROP TABLE public.tenant_payment_integrations;

CREATE TABLE public.tenant_payment_integrations (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	provider text NOT NULL,
	credentials_encrypted bytea NOT NULL,
	credentials_meta jsonb DEFAULT '{}'::jsonb NOT NULL,
	active bool DEFAULT false NOT NULL,
	webhook_secret text NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT tenant_payment_integrations_credentials_meta_check CHECK ((jsonb_typeof(credentials_meta) = 'object'::text)),
	CONSTRAINT tenant_payment_integrations_pkey PRIMARY KEY (id),
	CONSTRAINT tenant_payment_integrations_provider_check CHECK ((provider ~ '^[a-z0-9][a-z0-9_-]{0,62}$'::text)),
	CONSTRAINT tenant_payment_integrations_tenant_id_id_key UNIQUE (tenant_id, id),
	CONSTRAINT tenant_payment_integrations_tenant_id_provider_key UNIQUE (tenant_id, provider),
	CONSTRAINT tenant_payment_integrations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX tenant_payment_integrations_one_active_idx ON public.tenant_payment_integrations USING btree (tenant_id) WHERE active;
ALTER TABLE public.tenant_payment_integrations ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.tenant_payment_integrations
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.ai_tool_executions definition

-- Drop table

-- DROP TABLE public.ai_tool_executions;

CREATE TABLE public.ai_tool_executions (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	actor_id uuid NULL,
	actor_role text NULL,
	tool_key text NOT NULL,
	tool_version text NOT NULL,
	provider text DEFAULT 'openai'::text NOT NULL,
	model text NOT NULL,
	input_hash text NOT NULL,
	status text NOT NULL,
	"output" jsonb NULL,
	source_execution_id uuid NULL,
	provider_response_id text NULL,
	attempt_count int4 DEFAULT 0 NOT NULL,
	input_tokens int4 NULL,
	output_tokens int4 NULL,
	cached_input_tokens int4 NULL,
	duration_ms int4 NULL,
	error_code text NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	completed_at timestamptz NULL,
	prompt_revision text DEFAULT 'code:legacy'::text NOT NULL,
	prompt_version_id uuid NULL,
	CONSTRAINT ai_tool_executions_attempt_count_check CHECK ((attempt_count >= 0)),
	CONSTRAINT ai_tool_executions_cached_input_tokens_check CHECK (((cached_input_tokens IS NULL) OR (cached_input_tokens >= 0))),
	CONSTRAINT ai_tool_executions_duration_ms_check CHECK (((duration_ms IS NULL) OR (duration_ms >= 0))),
	CONSTRAINT ai_tool_executions_input_hash_check CHECK ((input_hash ~ '^[0-9a-f]{64}$'::text)),
	CONSTRAINT ai_tool_executions_input_tokens_check CHECK (((input_tokens IS NULL) OR (input_tokens >= 0))),
	CONSTRAINT ai_tool_executions_output_tokens_check CHECK (((output_tokens IS NULL) OR (output_tokens >= 0))),
	CONSTRAINT ai_tool_executions_pkey PRIMARY KEY (id),
	CONSTRAINT ai_tool_executions_status_check CHECK ((status = ANY (ARRAY['processing'::text, 'succeeded'::text, 'failed'::text, 'cached'::text]))),
	CONSTRAINT ai_tool_executions_tenant_id_id_key UNIQUE (tenant_id, id),
	CONSTRAINT ai_tool_executions_prompt_version_fk FOREIGN KEY (tenant_id,prompt_version_id) REFERENCES public.ai_tool_prompt_versions(tenant_id,id) ON DELETE SET NULL,
	CONSTRAINT ai_tool_executions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
	CONSTRAINT ai_tool_executions_tenant_id_source_execution_id_fkey FOREIGN KEY (tenant_id,source_execution_id) REFERENCES public.ai_tool_executions(tenant_id,id) ON DELETE SET NULL
);
CREATE INDEX ai_tool_executions_cache_idx ON public.ai_tool_executions USING btree (tenant_id, tool_key, tool_version, prompt_revision, model, input_hash, completed_at DESC) WHERE (status = 'succeeded'::text);
CREATE INDEX ai_tool_executions_history_idx ON public.ai_tool_executions USING btree (tenant_id, tool_key, created_at DESC);
ALTER TABLE public.ai_tool_executions ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY ai_tool_executions_tenant_isolation ON public.ai_tool_executions
 AS PERMISSIVE
 FOR ALL
 TO ippa_app
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.catalog_sync_configs definition

-- Drop table

-- DROP TABLE public.catalog_sync_configs;

CREATE TABLE public.catalog_sync_configs (
	tenant_id uuid NOT NULL,
	integration_id uuid NOT NULL,
	enabled bool DEFAULT false NOT NULL,
	classification_type_code int4 NULL,
	classification_codes _text DEFAULT '{}'::text[] NOT NULL,
	poll_interval_seconds int4 DEFAULT 300 NOT NULL,
	overlap_seconds int4 DEFAULT 120 NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT catalog_sync_configs_check CHECK (((NOT enabled) OR ((classification_type_code IS NOT NULL) AND (cardinality(classification_codes) > 0)))),
	CONSTRAINT catalog_sync_configs_overlap_seconds_check CHECK (((overlap_seconds >= 0) AND (overlap_seconds <= 3600))),
	CONSTRAINT catalog_sync_configs_pkey PRIMARY KEY (tenant_id, integration_id),
	CONSTRAINT catalog_sync_configs_poll_interval_seconds_check CHECK (((poll_interval_seconds >= 60) AND (poll_interval_seconds <= 86400))),
	CONSTRAINT catalog_sync_configs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
	CONSTRAINT catalog_sync_configs_tenant_id_integration_id_fkey FOREIGN KEY (tenant_id,integration_id) REFERENCES public.tenant_erp_integrations(tenant_id,id) ON DELETE CASCADE
);
ALTER TABLE public.catalog_sync_configs ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.catalog_sync_configs
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.catalog_sync_runs definition

-- Drop table

-- DROP TABLE public.catalog_sync_runs;

CREATE TABLE public.catalog_sync_runs (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	integration_id uuid NOT NULL,
	"mode" text NOT NULL,
	status text DEFAULT 'discovering'::text NOT NULL,
	window_start timestamptz NULL,
	window_end timestamptz NULL,
	discovered_count int4 DEFAULT 0 NOT NULL,
	processed_count int4 DEFAULT 0 NOT NULL,
	failed_count int4 DEFAULT 0 NOT NULL,
	error_message text NULL,
	started_at timestamptz DEFAULT now() NOT NULL,
	finished_at timestamptz NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT catalog_sync_runs_discovered_count_check CHECK ((discovered_count >= 0)),
	CONSTRAINT catalog_sync_runs_failed_count_check CHECK ((failed_count >= 0)),
	CONSTRAINT catalog_sync_runs_mode_check CHECK ((mode = ANY (ARRAY['incremental'::text, 'full'::text]))),
	CONSTRAINT catalog_sync_runs_pkey PRIMARY KEY (id),
	CONSTRAINT catalog_sync_runs_processed_count_check CHECK ((processed_count >= 0)),
	CONSTRAINT catalog_sync_runs_status_check CHECK ((status = ANY (ARRAY['discovering'::text, 'processing'::text, 'partial'::text, 'succeeded'::text, 'failed'::text]))),
	CONSTRAINT catalog_sync_runs_tenant_id_id_key UNIQUE (tenant_id, id),
	CONSTRAINT catalog_sync_runs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
	CONSTRAINT catalog_sync_runs_tenant_id_integration_id_fkey FOREIGN KEY (tenant_id,integration_id) REFERENCES public.tenant_erp_integrations(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX catalog_sync_runs_integration_started_idx ON public.catalog_sync_runs USING btree (tenant_id, integration_id, started_at DESC);
ALTER TABLE public.catalog_sync_runs ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.catalog_sync_runs
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.catalog_sync_states definition

-- Drop table

-- DROP TABLE public.catalog_sync_states;

CREATE TABLE public.catalog_sync_states (
	tenant_id uuid NOT NULL,
	integration_id uuid NOT NULL,
	checkpoint_at timestamptz NULL,
	next_incremental_at timestamptz DEFAULT now() NOT NULL,
	last_full_sync_at timestamptz NULL,
	lease_token uuid NULL,
	lease_until timestamptz NULL,
	last_error text NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT catalog_sync_states_pkey PRIMARY KEY (tenant_id, integration_id),
	CONSTRAINT catalog_sync_states_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
	CONSTRAINT catalog_sync_states_tenant_id_integration_id_fkey FOREIGN KEY (tenant_id,integration_id) REFERENCES public.tenant_erp_integrations(tenant_id,id) ON DELETE CASCADE
);
ALTER TABLE public.catalog_sync_states ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.catalog_sync_states
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.classification_types definition

-- Drop table

-- DROP TABLE public.classification_types;

CREATE TABLE public.classification_types (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	integration_id uuid NOT NULL,
	external_code text NOT NULL,
	"label" text NOT NULL,
	auxiliary_label text NULL,
	category_level int2 NULL,
	active bool DEFAULT true NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT classification_types_category_level_check CHECK (((category_level >= 1) AND (category_level <= 3))),
	CONSTRAINT classification_types_external_code_check CHECK ((btrim(external_code) <> ''::text)),
	CONSTRAINT classification_types_label_check CHECK ((btrim(label) <> ''::text)),
	CONSTRAINT classification_types_pkey PRIMARY KEY (id),
	CONSTRAINT classification_types_tenant_id_id_key UNIQUE (tenant_id, id),
	CONSTRAINT classification_types_tenant_id_integration_id_external_code_key UNIQUE (tenant_id, integration_id, external_code),
	CONSTRAINT classification_types_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
	CONSTRAINT classification_types_tenant_id_integration_id_fkey FOREIGN KEY (tenant_id,integration_id) REFERENCES public.tenant_erp_integrations(tenant_id,id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX classification_types_category_level_idx ON public.classification_types USING btree (tenant_id, integration_id, category_level) WHERE (category_level IS NOT NULL);
ALTER TABLE public.classification_types ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.classification_types
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.classifications definition

-- Drop table

-- DROP TABLE public.classifications;

CREATE TABLE public.classifications (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	classification_type_id uuid NOT NULL,
	parent_id uuid NULL,
	external_code text NOT NULL,
	"name" text NOT NULL,
	auxiliary_name text NULL,
	"position" int4 DEFAULT 0 NOT NULL,
	active bool DEFAULT true NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT classifications_external_code_check CHECK ((btrim(external_code) <> ''::text)),
	CONSTRAINT classifications_name_check CHECK ((btrim(name) <> ''::text)),
	CONSTRAINT classifications_pkey PRIMARY KEY (id),
	CONSTRAINT classifications_tenant_id_classification_type_id_parent_id__key UNIQUE NULLS NOT DISTINCT (tenant_id, classification_type_id, parent_id, external_code),
	CONSTRAINT classifications_tenant_id_id_classification_type_id_key UNIQUE (tenant_id, id, classification_type_id),
	CONSTRAINT classifications_tenant_id_id_key UNIQUE (tenant_id, id),
	CONSTRAINT classifications_tenant_id_classification_type_id_fkey FOREIGN KEY (tenant_id,classification_type_id) REFERENCES public.classification_types(tenant_id,id) ON DELETE CASCADE,
	CONSTRAINT classifications_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
	CONSTRAINT classifications_tenant_id_parent_id_fkey FOREIGN KEY (tenant_id,parent_id) REFERENCES public.classifications(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX classifications_tenant_type_parent_position_idx ON public.classifications USING btree (tenant_id, classification_type_id, parent_id, "position", name);
ALTER TABLE public.classifications ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.classifications
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.discounts definition

-- Drop table

-- DROP TABLE public.discounts;

CREATE TABLE public.discounts (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	"label" text NOT NULL,
	active bool DEFAULT true NOT NULL,
	"type" public."discount_type" NOT NULL,
	"percent" numeric(5, 2) DEFAULT 0 NOT NULL,
	"source" public.discount_source DEFAULT 'manual'::discount_source NOT NULL,
	product_id uuid NULL,
	CONSTRAINT discounts_percent_check CHECK (((percent >= (0)::numeric) AND (percent <= (100)::numeric))),
	CONSTRAINT discounts_pkey PRIMARY KEY (id),
	CONSTRAINT discounts_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE,
	CONSTRAINT discounts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX discounts_erp_product_unique ON public.discounts USING btree (tenant_id, product_id) WHERE (source = 'erp'::discount_source);
ALTER TABLE public.discounts ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.discounts
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.erp_external_references definition

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
	CONSTRAINT erp_external_references_entity_type_check CHECK ((entity_type = ANY (ARRAY['product'::text, 'product_variant'::text, 'order'::text, 'client'::text, 'company'::text]))),
	CONSTRAINT erp_external_references_metadata_check CHECK ((jsonb_typeof(metadata) = 'object'::text)),
	CONSTRAINT erp_external_references_pkey PRIMARY KEY (id),
	CONSTRAINT erp_external_references_tenant_id_integration_id_entity_ty_key1 UNIQUE (tenant_id, integration_id, entity_type, internal_id),
	CONSTRAINT erp_external_references_tenant_id_integration_id_entity_typ_key UNIQUE (tenant_id, integration_id, entity_type, external_id),
	CONSTRAINT erp_external_references_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
	CONSTRAINT erp_external_references_tenant_id_integration_id_fkey FOREIGN KEY (tenant_id,integration_id) REFERENCES public.tenant_erp_integrations(tenant_id,id) ON DELETE CASCADE
);
ALTER TABLE public.erp_external_references ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.erp_external_references
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.external_api_provider_status definition

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
ALTER TABLE public.external_api_provider_status ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY external_api_provider_status_tenant_isolation ON public.external_api_provider_status
 AS PERMISSIVE
 FOR ALL
 TO ippa_app
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.highlight_products definition

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
ALTER TABLE public.highlight_products ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.highlight_products
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.home_sections definition

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
ALTER TABLE public.home_sections ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.home_sections
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.inventory_locations definition

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
ALTER TABLE public.inventory_locations ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.inventory_locations
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.product_compositions definition

-- Drop table

-- DROP TABLE public.product_compositions;

CREATE TABLE public.product_compositions (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	product_id uuid NOT NULL,
	provider text NOT NULL,
	external_code text NOT NULL,
	description text NOT NULL,
	type_description text NULL,
	external_group_code text NULL,
	group_description text NULL,
	fetched_at timestamptz DEFAULT now() NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT product_compositions_pkey PRIMARY KEY (id),
	CONSTRAINT product_compositions_tenant_id_id_key UNIQUE (tenant_id, id),
	CONSTRAINT product_compositions_tenant_id_product_id_provider_external_key UNIQUE (tenant_id, product_id, provider, external_code),
	CONSTRAINT product_compositions_tenant_id_product_id_fkey FOREIGN KEY (tenant_id,product_id) REFERENCES public.products(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX product_compositions_tenant_product_idx ON public.product_compositions USING btree (tenant_id, product_id);
ALTER TABLE public.product_compositions ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.product_compositions
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.product_packs definition

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
ALTER TABLE public.product_packs ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.product_packs
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.product_variants definition

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
	is_active bool DEFAULT true NOT NULL,
	source_origin text DEFAULT 'manual'::text NOT NULL,
	bootstrap_external_code text NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT product_variants_pkey PRIMARY KEY (id),
	CONSTRAINT product_variants_price_check CHECK ((price >= (0)::numeric)),
	CONSTRAINT product_variants_source_origin_check CHECK ((source_origin = ANY (ARRAY['manual'::text, 'bootstrap'::text, 'erp'::text]))),
	CONSTRAINT product_variants_tenant_id_id_key UNIQUE (tenant_id, id),
	CONSTRAINT product_variants_tenant_id_product_id_color_size_key UNIQUE (tenant_id, product_id, color, size),
	CONSTRAINT product_variants_tenant_sku_key UNIQUE (tenant_id, sku),
	CONSTRAINT product_variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE,
	CONSTRAINT product_variants_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX product_variants_tenant_bootstrap_external_code_key ON public.product_variants USING btree (tenant_id, bootstrap_external_code) WHERE (bootstrap_external_code IS NOT NULL);
CREATE INDEX product_variants_tenant_product_active_idx ON public.product_variants USING btree (tenant_id, product_id) WHERE is_active;
CREATE INDEX product_variants_tenant_product_idx ON public.product_variants USING btree (tenant_id, product_id);
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.product_variants
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.store_settings definition

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
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.store_settings
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.variant_classifications definition

-- Drop table

-- DROP TABLE public.variant_classifications;

CREATE TABLE public.variant_classifications (
	tenant_id uuid NOT NULL,
	variant_id uuid NOT NULL,
	classification_id uuid NOT NULL,
	classification_type_id uuid NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT variant_classifications_pkey PRIMARY KEY (tenant_id, variant_id, classification_id),
	CONSTRAINT variant_classifications_tenant_id_classification_id_classi_fkey FOREIGN KEY (tenant_id,classification_id,classification_type_id) REFERENCES public.classifications(tenant_id,id,classification_type_id) ON DELETE CASCADE,
	CONSTRAINT variant_classifications_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
	CONSTRAINT variant_classifications_tenant_id_variant_id_fkey FOREIGN KEY (tenant_id,variant_id) REFERENCES public.product_variants(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX variant_classifications_classification_idx ON public.variant_classifications USING btree (tenant_id, classification_id, variant_id);
CREATE INDEX variant_classifications_variant_type_idx ON public.variant_classifications USING btree (tenant_id, variant_id, classification_type_id);
ALTER TABLE public.variant_classifications ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.variant_classifications
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.catalog_sync_items definition

-- Drop table

-- DROP TABLE public.catalog_sync_items;

CREATE TABLE public.catalog_sync_items (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	integration_id uuid NOT NULL,
	run_id uuid NOT NULL,
	reference_code text NOT NULL,
	status text DEFAULT 'pending'::text NOT NULL,
	attempts int4 DEFAULT 0 NOT NULL,
	next_attempt_at timestamptz DEFAULT now() NOT NULL,
	last_error text NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT catalog_sync_items_attempts_check CHECK (((attempts >= 0) AND (attempts <= 6))),
	CONSTRAINT catalog_sync_items_pkey PRIMARY KEY (id),
	CONSTRAINT catalog_sync_items_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'succeeded'::text, 'failed'::text]))),
	CONSTRAINT catalog_sync_items_tenant_id_run_id_reference_code_key UNIQUE (tenant_id, run_id, reference_code),
	CONSTRAINT catalog_sync_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
	CONSTRAINT catalog_sync_items_tenant_id_integration_id_fkey FOREIGN KEY (tenant_id,integration_id) REFERENCES public.tenant_erp_integrations(tenant_id,id) ON DELETE CASCADE,
	CONSTRAINT catalog_sync_items_tenant_id_run_id_fkey FOREIGN KEY (tenant_id,run_id) REFERENCES public.catalog_sync_runs(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX catalog_sync_items_due_idx ON public.catalog_sync_items USING btree (tenant_id, integration_id, next_attempt_at, created_at) WHERE (status = 'pending'::text);
ALTER TABLE public.catalog_sync_items ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.catalog_sync_items
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.discount_products definition

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
ALTER TABLE public.discount_products ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.discount_products
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.discount_tiers definition

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
ALTER TABLE public.discount_tiers ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.discount_tiers
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.home_banners definition

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
ALTER TABLE public.home_banners ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.home_banners
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.inventory_balances definition

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
ALTER TABLE public.inventory_balances ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.inventory_balances
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.inventory_external_references definition

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
ALTER TABLE public.inventory_external_references ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.inventory_external_references
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.inventory_movements definition

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
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.inventory_movements
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.inventory_reservation_items definition

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
ALTER TABLE public.inventory_reservation_items ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.inventory_reservation_items
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.product_composition_items definition

-- Drop table

-- DROP TABLE public.product_composition_items;

CREATE TABLE public.product_composition_items (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	composition_id uuid NOT NULL,
	external_code text NULL,
	material text NOT NULL,
	percentage numeric(5, 2) NOT NULL,
	sort_order int4 DEFAULT 0 NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT product_composition_items_percentage_check CHECK (((percentage >= (0)::numeric) AND (percentage <= (100)::numeric))),
	CONSTRAINT product_composition_items_pkey PRIMARY KEY (id),
	CONSTRAINT product_composition_items_tenant_id_composition_id_fkey FOREIGN KEY (tenant_id,composition_id) REFERENCES public.product_compositions(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX product_composition_items_tenant_composition_idx ON public.product_composition_items USING btree (tenant_id, composition_id);
ALTER TABLE public.product_composition_items ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.product_composition_items
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.product_pack_items definition

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
ALTER TABLE public.product_pack_items ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.product_pack_items
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.audit_events definition

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
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY audit_events_read ON public.audit_events
 AS PERMISSIVE
 FOR SELECT
 TO ippa_app
 USING ((tenant_id = app_tenant_id()));
CREATE POLICY audit_events_insert ON public.audit_events
 AS PERMISSIVE
 FOR INSERT
 TO ippa_app
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.client_account_confirmations definition

-- Drop table

-- DROP TABLE public.client_account_confirmations;

CREATE TABLE public.client_account_confirmations (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	client_id uuid NOT NULL,
	password_hash text NOT NULL,
	token_hash text NOT NULL,
	expires_at timestamptz NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT client_account_confirmations_pkey PRIMARY KEY (id),
	CONSTRAINT client_account_confirmations_tenant_id_client_id_key UNIQUE (tenant_id, client_id),
	CONSTRAINT client_account_confirmations_token_hash_key UNIQUE (token_hash)
);
CREATE INDEX client_account_confirmations_token_idx ON public.client_account_confirmations USING btree (token_hash);
ALTER TABLE public.client_account_confirmations ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.client_account_confirmations
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.client_cart_items definition

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
ALTER TABLE public.client_cart_items ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.client_cart_items
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.clients definition

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
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.clients
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.commercial_group_members definition

-- Drop table

-- DROP TABLE public.commercial_group_members;

CREATE TABLE public.commercial_group_members (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	group_id uuid NOT NULL,
	client_id uuid NOT NULL,
	is_primary bool DEFAULT false NOT NULL,
	is_active bool DEFAULT true NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT commercial_group_members_pkey PRIMARY KEY (id),
	CONSTRAINT commercial_group_members_tenant_id_group_id_client_id_key UNIQUE (tenant_id, group_id, client_id)
);
CREATE UNIQUE INDEX commercial_group_members_client_active_unique ON public.commercial_group_members USING btree (tenant_id, client_id) WHERE is_active;
CREATE INDEX commercial_group_members_client_idx ON public.commercial_group_members USING btree (tenant_id, client_id);
CREATE INDEX commercial_group_members_group_idx ON public.commercial_group_members USING btree (tenant_id, group_id);
CREATE UNIQUE INDEX commercial_group_members_group_primary_unique ON public.commercial_group_members USING btree (tenant_id, group_id) WHERE (is_primary AND is_active);
ALTER TABLE public.commercial_group_members ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY commercial_group_members_tenant_isolation ON public.commercial_group_members
 AS PERMISSIVE
 FOR ALL
 TO ippa_app
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.freight_quotes definition

-- Drop table

-- DROP TABLE public.freight_quotes;

CREATE TABLE public.freight_quotes (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	order_session_id uuid NOT NULL,
	provider_id uuid NULL,
	kind public."freight_provider_kind" NOT NULL,
	"label" text NOT NULL,
	price numeric(12, 2) NOT NULL,
	eta_label text NULL,
	destination_cep text NULL,
	external_quote_id text NULL,
	raw_response jsonb DEFAULT '{}'::jsonb NOT NULL,
	selected bool DEFAULT false NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT freight_quotes_pkey PRIMARY KEY (id),
	CONSTRAINT freight_quotes_price_check CHECK ((price >= (0)::numeric)),
	CONSTRAINT freight_quotes_raw_response_check CHECK ((jsonb_typeof(raw_response) = 'object'::text)),
	CONSTRAINT freight_quotes_tenant_id_id_key UNIQUE (tenant_id, id)
);
CREATE UNIQUE INDEX freight_quotes_one_selected_per_session_idx ON public.freight_quotes USING btree (tenant_id, order_session_id) WHERE selected;
CREATE INDEX freight_quotes_session_idx ON public.freight_quotes USING btree (tenant_id, order_session_id, created_at DESC);
ALTER TABLE public.freight_quotes ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.freight_quotes
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.notification_subscriptions definition

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
ALTER TABLE public.notification_subscriptions ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY notification_subscriptions_tenant_isolation ON public.notification_subscriptions
 AS PERMISSIVE
 FOR ALL
 TO ippa_app
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.notifications definition

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
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY notifications_tenant_isolation ON public.notifications
 AS PERMISSIVE
 FOR ALL
 TO ippa_app
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.order_books definition

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
ALTER TABLE public.order_books ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.order_books
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.order_freight_tracking_events definition

-- Drop table

-- DROP TABLE public.order_freight_tracking_events;

CREATE TABLE public.order_freight_tracking_events (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	order_freight_id uuid NOT NULL,
	status public."order_freight_status" NOT NULL,
	description text NULL,
	occurred_at timestamptz DEFAULT now() NOT NULL,
	raw_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT order_freight_tracking_events_pkey PRIMARY KEY (id),
	CONSTRAINT order_freight_tracking_events_raw_payload_check CHECK ((jsonb_typeof(raw_payload) = 'object'::text))
);
CREATE INDEX order_freight_tracking_events_freight_idx ON public.order_freight_tracking_events USING btree (tenant_id, order_freight_id, occurred_at DESC);
ALTER TABLE public.order_freight_tracking_events ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.order_freight_tracking_events
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.order_freights definition

-- Drop table

-- DROP TABLE public.order_freights;

CREATE TABLE public.order_freights (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	order_id uuid NOT NULL,
	provider_id uuid NULL,
	quote_id uuid NULL,
	kind public."freight_provider_kind" NOT NULL,
	"label" text NOT NULL,
	price numeric(12, 2) NOT NULL,
	eta_label text NULL,
	destination_cep text NULL,
	tracking_code text NULL,
	tracking_url text NULL,
	status public."order_freight_status" DEFAULT 'aguardando'::order_freight_status NOT NULL,
	shipped_at timestamptz NULL,
	delivered_at timestamptz NULL,
	cancelled_at timestamptz NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	"method" public."order_freight_method" NULL,
	CONSTRAINT order_freights_pkey PRIMARY KEY (id),
	CONSTRAINT order_freights_price_check CHECK ((price >= (0)::numeric)),
	CONSTRAINT order_freights_tenant_id_id_key UNIQUE (tenant_id, id),
	CONSTRAINT order_freights_tenant_id_order_id_key UNIQUE (tenant_id, order_id)
);
CREATE INDEX order_freights_tenant_pending_idx ON public.order_freights USING btree (tenant_id, status, updated_at DESC) WHERE (status <> ALL (ARRAY['entregue'::order_freight_status, 'cancelado'::order_freight_status]));
ALTER TABLE public.order_freights ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.order_freights
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.order_item_events definition

-- Drop table

-- DROP TABLE public.order_item_events;

CREATE TABLE public.order_item_events (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	tenant_id uuid NOT NULL,
	order_id uuid NOT NULL,
	item_key text NOT NULL,
	event_type text NOT NULL,
	qty_delta int4 NOT NULL,
	actor_id uuid NOT NULL,
	actor_role public."user_role" NOT NULL,
	occurred_at timestamptz DEFAULT now() NOT NULL,
	metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT order_item_events_event_type_check CHECK ((event_type = ANY (ARRAY['item_added'::text, 'item_removed'::text, 'qty_adjusted'::text]))),
	CONSTRAINT order_item_events_metadata_check CHECK ((jsonb_typeof(metadata) = 'object'::text)),
	CONSTRAINT order_item_events_pkey PRIMARY KEY (id),
	CONSTRAINT order_item_events_qty_delta_check CHECK ((qty_delta <> 0))
);
CREATE INDEX order_item_events_order_idx ON public.order_item_events USING btree (tenant_id, order_id, occurred_at DESC);
ALTER TABLE public.order_item_events ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.order_item_events
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.order_item_fulfillment_events definition

-- Drop table

-- DROP TABLE public.order_item_fulfillment_events;

CREATE TABLE public.order_item_fulfillment_events (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	tenant_id uuid NOT NULL,
	order_id uuid NOT NULL,
	item_key text NOT NULL,
	qty_delta int4 NOT NULL,
	external_reference text NULL,
	occurred_at timestamptz DEFAULT now() NOT NULL,
	metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT order_item_fulfillment_events_metadata_check CHECK ((jsonb_typeof(metadata) = 'object'::text)),
	CONSTRAINT order_item_fulfillment_events_pkey PRIMARY KEY (id),
	CONSTRAINT order_item_fulfillment_events_qty_delta_check CHECK ((qty_delta <> 0))
);
CREATE INDEX order_item_fulfillment_events_order_idx ON public.order_item_fulfillment_events USING btree (tenant_id, order_id, occurred_at DESC);
ALTER TABLE public.order_item_fulfillment_events ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.order_item_fulfillment_events
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.order_items definition

-- Drop table

-- DROP TABLE public.order_items;

CREATE TABLE public.order_items (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	order_id uuid NOT NULL,
	item_key text NOT NULL,
	product_id uuid NULL,
	"snapshot" jsonb NOT NULL,
	variant_id uuid NULL,
	qty int4 NOT NULL,
	unit_price numeric(12, 2) NULL,
	qty_separated int4 DEFAULT 0 NOT NULL,
	CONSTRAINT order_items_pkey PRIMARY KEY (id),
	CONSTRAINT order_items_qty_check CHECK ((qty > 0)),
	CONSTRAINT order_items_qty_separated_check CHECK ((qty_separated >= 0)),
	CONSTRAINT order_items_tenant_id_order_id_item_key_key UNIQUE (tenant_id, order_id, item_key),
	CONSTRAINT order_items_unit_price_check CHECK ((unit_price >= (0)::numeric))
);
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.order_items
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.order_session_items definition

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
ALTER TABLE public.order_session_items ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.order_session_items
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.order_session_participants definition

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
	CONSTRAINT order_session_participants_tenant_id_order_session_id_user__key UNIQUE (tenant_id, order_session_id, user_id)
);
CREATE INDEX order_session_participants_session_idx ON public.order_session_participants USING btree (tenant_id, order_session_id, last_joined_at DESC);
ALTER TABLE public.order_session_participants ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.order_session_participants
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.order_sessions definition

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
	payment_token_hash text NULL,
	payment_token_created_at timestamptz NULL,
	notes text NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	order_book_id uuid NOT NULL,
	order_id uuid NULL,
	freight_quote_id uuid NULL,
	freight_provider_id uuid NULL,
	freight_kind public."freight_provider_kind" NULL,
	freight_label text NULL,
	freight_price numeric(12, 2) NULL,
	freight_eta_label text NULL,
	CONSTRAINT order_sessions_freight_price_check CHECK (((freight_price IS NULL) OR (freight_price >= (0)::numeric))),
	CONSTRAINT order_sessions_payment_token_hash_key UNIQUE (payment_token_hash),
	CONSTRAINT order_sessions_pkey PRIMARY KEY (id)
);
CREATE INDEX order_sessions_order_idx ON public.order_sessions USING btree (tenant_id, order_id) WHERE (order_id IS NOT NULL);
CREATE INDEX order_sessions_tenant_book_status_idx ON public.order_sessions USING btree (tenant_id, order_book_id, status, updated_at DESC);
CREATE INDEX order_sessions_tenant_seller_status_idx ON public.order_sessions USING btree (tenant_id, seller_id, status);
ALTER TABLE public.order_sessions ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.order_sessions
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.orders definition

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
	payment_method text NULL,
	discount jsonb NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	status text DEFAULT 'novo'::text NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	order_number int4 NOT NULL,
	payment_status text DEFAULT 'unpaid'::text NOT NULL,
	paid_at timestamptz NULL,
	CONSTRAINT orders_payment_status_check CHECK ((payment_status = ANY (ARRAY['unpaid'::text, 'awaiting_confirmation'::text, 'paid'::text, 'payment_failed'::text]))),
	CONSTRAINT orders_pkey PRIMARY KEY (id),
	CONSTRAINT orders_status_check CHECK ((status = ANY (ARRAY['aberto'::text, 'aguardando_pagamento'::text, 'novo'::text, 'separado'::text, 'pago'::text, 'cancelado'::text]))),
	CONSTRAINT orders_total_check CHECK ((total >= (0)::numeric))
);
CREATE INDEX orders_tenant_client_idx ON public.orders USING btree (tenant_id, client_id, created_at DESC);
CREATE INDEX orders_tenant_client_paid_created_idx ON public.orders USING btree (tenant_id, client_id, created_at DESC) WHERE (status = 'pago'::text);
CREATE UNIQUE INDEX orders_tenant_order_number_key ON public.orders USING btree (tenant_id, order_number);
CREATE INDEX orders_tenant_paid_created_idx ON public.orders USING btree (tenant_id, created_at DESC) WHERE (status = 'pago'::text);
CREATE INDEX orders_tenant_seller_idx ON public.orders USING btree (tenant_id, seller_id, created_at DESC);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.orders
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.payment_charges definition

-- Drop table

-- DROP TABLE public.payment_charges;

CREATE TABLE public.payment_charges (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	integration_id uuid NOT NULL,
	provider text NOT NULL,
	order_id uuid NOT NULL,
	order_session_id uuid NULL,
	"method" public."payment_charge_method" NOT NULL,
	status public."payment_charge_status" DEFAULT 'pending'::payment_charge_status NOT NULL,
	amount numeric(12, 2) NOT NULL,
	external_id text NULL,
	external_status text NULL,
	pix_qr_code text NULL,
	pix_copy_paste text NULL,
	boleto_barcode text NULL,
	boleto_pdf_url text NULL,
	card_last_digits text NULL,
	card_brand text NULL,
	provider_expires_at timestamptz NULL,
	last_checked_at timestamptz NULL,
	next_check_at timestamptz NULL,
	paid_at timestamptz NULL,
	raw_create_response jsonb DEFAULT '{}'::jsonb NOT NULL,
	raw_last_webhook jsonb DEFAULT '{}'::jsonb NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT payment_charges_amount_check CHECK ((amount >= (0)::numeric)),
	CONSTRAINT payment_charges_pkey PRIMARY KEY (id),
	CONSTRAINT payment_charges_raw_create_response_check CHECK ((jsonb_typeof(raw_create_response) = 'object'::text)),
	CONSTRAINT payment_charges_raw_last_webhook_check CHECK ((jsonb_typeof(raw_last_webhook) = 'object'::text)),
	CONSTRAINT payment_charges_tenant_id_id_key UNIQUE (tenant_id, id)
);
CREATE UNIQUE INDEX payment_charges_external_idx ON public.payment_charges USING btree (tenant_id, provider, external_id) WHERE (external_id IS NOT NULL);
CREATE INDEX payment_charges_order_idx ON public.payment_charges USING btree (tenant_id, order_id, created_at DESC);
CREATE INDEX payment_charges_reconcile_idx ON public.payment_charges USING btree (tenant_id, status, next_check_at) WHERE (status = ANY (ARRAY['pending'::payment_charge_status, 'processing'::payment_charge_status]));
ALTER TABLE public.payment_charges ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.payment_charges
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.payment_webhook_events definition

-- Drop table

-- DROP TABLE public.payment_webhook_events;

CREATE TABLE public.payment_webhook_events (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NULL,
	provider text NOT NULL,
	external_event_id text NULL,
	charge_id uuid NULL,
	event_type text NOT NULL,
	signature_valid bool NOT NULL,
	payload jsonb DEFAULT '{}'::jsonb NOT NULL,
	processed_at timestamptz NULL,
	processing_error text NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT payment_webhook_events_payload_check CHECK ((jsonb_typeof(payload) = 'object'::text)),
	CONSTRAINT payment_webhook_events_pkey PRIMARY KEY (id)
);
CREATE INDEX payment_webhook_events_charge_idx ON public.payment_webhook_events USING btree (tenant_id, charge_id, created_at DESC);
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.payment_webhook_events
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.provider_order_attempts definition

-- Drop table

-- DROP TABLE public.provider_order_attempts;

CREATE TABLE public.provider_order_attempts (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	provider_order_id uuid NOT NULL,
	order_id uuid NOT NULL,
	provider text NOT NULL,
	attempt_number int4 NOT NULL,
	outcome text NOT NULL,
	external_id text NULL,
	"error" text NULL,
	payload jsonb DEFAULT '{}'::jsonb NOT NULL,
	response jsonb DEFAULT '{}'::jsonb NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT provider_order_attempts_outcome_check CHECK ((outcome = ANY (ARRAY['sent'::text, 'failed'::text, 'retry_pending'::text, 'retry_cancelling'::text]))),
	CONSTRAINT provider_order_attempts_payload_check CHECK ((jsonb_typeof(payload) = 'object'::text)),
	CONSTRAINT provider_order_attempts_pkey PRIMARY KEY (id),
	CONSTRAINT provider_order_attempts_response_check CHECK ((jsonb_typeof(response) = 'object'::text))
);
CREATE INDEX provider_order_attempts_order_idx ON public.provider_order_attempts USING btree (tenant_id, order_id, created_at DESC);
ALTER TABLE public.provider_order_attempts ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY provider_order_attempts_tenant_isolation ON public.provider_order_attempts
 AS PERMISSIVE
 FOR ALL
 TO ippa_app
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.provider_orders definition

-- Drop table

-- DROP TABLE public.provider_orders;

CREATE TABLE public.provider_orders (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id uuid NOT NULL,
	integration_id uuid NOT NULL,
	order_id uuid NOT NULL,
	provider text NOT NULL,
	external_id text NULL,
	status text DEFAULT 'pending'::text NOT NULL,
	attempts int4 DEFAULT 0 NOT NULL,
	next_attempt_at timestamptz DEFAULT now() NOT NULL,
	payload jsonb DEFAULT '{}'::jsonb NOT NULL,
	response jsonb DEFAULT '{}'::jsonb NOT NULL,
	last_error text NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT provider_orders_attempts_check CHECK ((attempts >= 0)),
	CONSTRAINT provider_orders_payload_check CHECK ((jsonb_typeof(payload) = 'object'::text)),
	CONSTRAINT provider_orders_pkey PRIMARY KEY (id),
	CONSTRAINT provider_orders_response_check CHECK ((jsonb_typeof(response) = 'object'::text)),
	CONSTRAINT provider_orders_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'cancelling'::text, 'sent'::text, 'failed'::text, 'cancelled'::text]))),
	CONSTRAINT provider_orders_tenant_id_order_id_key UNIQUE (tenant_id, order_id)
);
CREATE INDEX provider_orders_dispatch_idx ON public.provider_orders USING btree (tenant_id, status, next_attempt_at) WHERE (status = ANY (ARRAY['pending'::text, 'cancelling'::text]));
ALTER TABLE public.provider_orders ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY provider_orders_tenant_isolation ON public.provider_orders
 AS PERMISSIVE
 FOR ALL
 TO ippa_app
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.realtime_tickets definition

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
ALTER TABLE public.realtime_tickets ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.realtime_tickets
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.user_sessions definition

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
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.user_sessions
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.users definition

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
	avatar_key text NULL,
	CONSTRAINT users_pkey PRIMARY KEY (id)
);
CREATE INDEX users_tenant_active_role_idx ON public.users USING btree (tenant_id, role) WHERE (deleted_at IS NULL);
CREATE UNIQUE INDEX users_tenant_email_active_key ON public.users USING btree (tenant_id, email) WHERE (deleted_at IS NULL);
CREATE INDEX users_tenant_role_idx ON public.users USING btree (tenant_id, role);
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY tenant_isolation ON public.users
 AS PERMISSIVE
 FOR ALL
 USING ((tenant_id = app_tenant_id()))
 WITH CHECK ((tenant_id = app_tenant_id()));


-- public.audit_events foreign keys

ALTER TABLE public.audit_events ADD CONSTRAINT audit_events_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.user_sessions(id) ON DELETE SET NULL;
ALTER TABLE public.audit_events ADD CONSTRAINT audit_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


-- public.client_account_confirmations foreign keys

ALTER TABLE public.client_account_confirmations ADD CONSTRAINT client_account_confirmations_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;
ALTER TABLE public.client_account_confirmations ADD CONSTRAINT client_account_confirmations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


-- public.client_cart_items foreign keys

ALTER TABLE public.client_cart_items ADD CONSTRAINT client_cart_items_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;
ALTER TABLE public.client_cart_items ADD CONSTRAINT client_cart_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


-- public.clients foreign keys

ALTER TABLE public.clients ADD CONSTRAINT clients_last_seller_id_fkey FOREIGN KEY (last_seller_id) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.clients ADD CONSTRAINT clients_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


-- public.commercial_group_members foreign keys

ALTER TABLE public.commercial_group_members ADD CONSTRAINT commercial_group_members_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;
ALTER TABLE public.commercial_group_members ADD CONSTRAINT commercial_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.commercial_groups(id) ON DELETE CASCADE;
ALTER TABLE public.commercial_group_members ADD CONSTRAINT commercial_group_members_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


-- public.freight_quotes foreign keys

ALTER TABLE public.freight_quotes ADD CONSTRAINT freight_quotes_order_session_id_fkey FOREIGN KEY (order_session_id) REFERENCES public.order_sessions(id) ON DELETE CASCADE;
ALTER TABLE public.freight_quotes ADD CONSTRAINT freight_quotes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.freight_quotes ADD CONSTRAINT freight_quotes_tenant_id_provider_id_fkey FOREIGN KEY (tenant_id,provider_id) REFERENCES public.freight_providers(tenant_id,id) ON DELETE SET NULL;


-- public.notification_subscriptions foreign keys

ALTER TABLE public.notification_subscriptions ADD CONSTRAINT notification_subscriptions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.notification_subscriptions ADD CONSTRAINT notification_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


-- public.notifications foreign keys

ALTER TABLE public.notifications ADD CONSTRAINT notifications_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


-- public.order_books foreign keys

ALTER TABLE public.order_books ADD CONSTRAINT order_books_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.users(id) ON DELETE RESTRICT;
ALTER TABLE public.order_books ADD CONSTRAINT order_books_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


-- public.order_freight_tracking_events foreign keys

ALTER TABLE public.order_freight_tracking_events ADD CONSTRAINT order_freight_tracking_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.order_freight_tracking_events ADD CONSTRAINT order_freight_tracking_events_tenant_id_order_freight_id_fkey FOREIGN KEY (tenant_id,order_freight_id) REFERENCES public.order_freights(tenant_id,id) ON DELETE CASCADE;


-- public.order_freights foreign keys

ALTER TABLE public.order_freights ADD CONSTRAINT order_freights_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
ALTER TABLE public.order_freights ADD CONSTRAINT order_freights_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.order_freights ADD CONSTRAINT order_freights_tenant_id_provider_id_fkey FOREIGN KEY (tenant_id,provider_id) REFERENCES public.freight_providers(tenant_id,id) ON DELETE SET NULL;
ALTER TABLE public.order_freights ADD CONSTRAINT order_freights_tenant_id_quote_id_fkey FOREIGN KEY (tenant_id,quote_id) REFERENCES public.freight_quotes(tenant_id,id) ON DELETE SET NULL;


-- public.order_item_events foreign keys

ALTER TABLE public.order_item_events ADD CONSTRAINT order_item_events_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
ALTER TABLE public.order_item_events ADD CONSTRAINT order_item_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


-- public.order_item_fulfillment_events foreign keys

ALTER TABLE public.order_item_fulfillment_events ADD CONSTRAINT order_item_fulfillment_events_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
ALTER TABLE public.order_item_fulfillment_events ADD CONSTRAINT order_item_fulfillment_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


-- public.order_items foreign keys

ALTER TABLE public.order_items ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_tenant_id_variant_id_fkey FOREIGN KEY (tenant_id,variant_id) REFERENCES public.product_variants(tenant_id,id) ON DELETE RESTRICT;


-- public.order_session_items foreign keys

ALTER TABLE public.order_session_items ADD CONSTRAINT order_session_items_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.order_sessions(id) ON DELETE CASCADE;
ALTER TABLE public.order_session_items ADD CONSTRAINT order_session_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


-- public.order_session_participants foreign keys

ALTER TABLE public.order_session_participants ADD CONSTRAINT order_session_participants_order_session_id_fkey FOREIGN KEY (order_session_id) REFERENCES public.order_sessions(id) ON DELETE CASCADE;
ALTER TABLE public.order_session_participants ADD CONSTRAINT order_session_participants_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


-- public.order_sessions foreign keys

ALTER TABLE public.order_sessions ADD CONSTRAINT order_sessions_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;
ALTER TABLE public.order_sessions ADD CONSTRAINT order_sessions_freight_provider_fkey FOREIGN KEY (tenant_id,freight_provider_id) REFERENCES public.freight_providers(tenant_id,id) ON DELETE SET NULL;
ALTER TABLE public.order_sessions ADD CONSTRAINT order_sessions_freight_quote_fkey FOREIGN KEY (tenant_id,freight_quote_id) REFERENCES public.freight_quotes(tenant_id,id) ON DELETE SET NULL;
ALTER TABLE public.order_sessions ADD CONSTRAINT order_sessions_order_book_id_fkey FOREIGN KEY (order_book_id) REFERENCES public.order_books(id) ON DELETE RESTRICT;
ALTER TABLE public.order_sessions ADD CONSTRAINT order_sessions_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;
ALTER TABLE public.order_sessions ADD CONSTRAINT order_sessions_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.users(id) ON DELETE RESTRICT;
ALTER TABLE public.order_sessions ADD CONSTRAINT order_sessions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


-- public.orders foreign keys

ALTER TABLE public.orders ADD CONSTRAINT orders_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD CONSTRAINT orders_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD CONSTRAINT orders_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


-- public.payment_charges foreign keys

ALTER TABLE public.payment_charges ADD CONSTRAINT payment_charges_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
ALTER TABLE public.payment_charges ADD CONSTRAINT payment_charges_order_session_id_fkey FOREIGN KEY (order_session_id) REFERENCES public.order_sessions(id) ON DELETE SET NULL;
ALTER TABLE public.payment_charges ADD CONSTRAINT payment_charges_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.payment_charges ADD CONSTRAINT payment_charges_tenant_id_integration_id_fkey FOREIGN KEY (tenant_id,integration_id) REFERENCES public.tenant_payment_integrations(tenant_id,id) ON DELETE CASCADE;


-- public.payment_webhook_events foreign keys

ALTER TABLE public.payment_webhook_events ADD CONSTRAINT payment_webhook_events_charge_id_fkey FOREIGN KEY (charge_id) REFERENCES public.payment_charges(id) ON DELETE SET NULL;
ALTER TABLE public.payment_webhook_events ADD CONSTRAINT payment_webhook_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


-- public.provider_order_attempts foreign keys

ALTER TABLE public.provider_order_attempts ADD CONSTRAINT provider_order_attempts_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
ALTER TABLE public.provider_order_attempts ADD CONSTRAINT provider_order_attempts_provider_order_id_fkey FOREIGN KEY (provider_order_id) REFERENCES public.provider_orders(id) ON DELETE CASCADE;
ALTER TABLE public.provider_order_attempts ADD CONSTRAINT provider_order_attempts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


-- public.provider_orders foreign keys

ALTER TABLE public.provider_orders ADD CONSTRAINT provider_orders_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
ALTER TABLE public.provider_orders ADD CONSTRAINT provider_orders_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.provider_orders ADD CONSTRAINT provider_orders_tenant_id_integration_id_fkey FOREIGN KEY (tenant_id,integration_id) REFERENCES public.tenant_erp_integrations(tenant_id,id) ON DELETE CASCADE;


-- public.realtime_tickets foreign keys

ALTER TABLE public.realtime_tickets ADD CONSTRAINT realtime_tickets_order_session_id_fkey FOREIGN KEY (order_session_id) REFERENCES public.order_sessions(id) ON DELETE CASCADE;
ALTER TABLE public.realtime_tickets ADD CONSTRAINT realtime_tickets_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.realtime_tickets ADD CONSTRAINT realtime_tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


-- public.user_sessions foreign keys

ALTER TABLE public.user_sessions ADD CONSTRAINT user_sessions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.user_sessions ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


-- public.users foreign keys

ALTER TABLE public.users ADD CONSTRAINT users_client_id_fk FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;
ALTER TABLE public.users ADD CONSTRAINT users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;



-- DROP FUNCTION public.app_role();

CREATE OR REPLACE FUNCTION public.app_role()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$ SELECT NULLIF(current_setting('app.role', true), '') $function$
;

-- DROP FUNCTION public.app_tenant_id();

CREATE OR REPLACE FUNCTION public.app_tenant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $function$
;

-- DROP FUNCTION public.app_user_id();

CREATE OR REPLACE FUNCTION public.app_user_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
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

-- DROP FUNCTION public.hmac(bytea, bytea, text);

CREATE OR REPLACE FUNCTION public.hmac(bytea, bytea, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_hmac$function$
;

-- DROP FUNCTION public.hmac(text, text, text);

CREATE OR REPLACE FUNCTION public.hmac(text, text, text)
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

-- DROP FUNCTION public.prevent_ai_tool_prompt_version_content_update();

CREATE OR REPLACE FUNCTION public.prevent_ai_tool_prompt_version_content_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.tool_key IS DISTINCT FROM OLD.tool_key
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.instructions IS DISTINCT FROM OLD.instructions
     OR NEW.created_by_platform_user_id IS DISTINCT FROM OLD.created_by_platform_user_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'AI prompt version content is immutable';
  END IF;
  RETURN NEW;
END;
$function$
;
