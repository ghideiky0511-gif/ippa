-- Grupos comerciais: agrupam clientes (CPF/CNPJ) já cadastrados em `clients`
-- sob uma entidade só, com um membro marcado como principal. Diferente de
-- clients.parent_client_id (hierarquia matriz/filial de 1 nível, vínculo
-- 1:N direto na própria tabela clients) — aqui é uma associação N:N mediada
-- por uma tabela própria, para agrupar documentos que pertencem à mesma
-- entidade/família. As duas coexistem sem se substituir.
--
-- group_type fixo em 'client' nesta versão (sem fornecedor/supplier, sem
-- payment conditions, sem service_scope). CHECK simples em vez de enum:
-- alargar para incluir 'supplier' no futuro é só trocar esta constraint,
-- sem migrar tipo de coluna.

-- audit_action e audit_entity_type são enums (migration 004) — os valores
-- novos precisam existir antes que recordAuditEvent grave ações
-- commercial_group.*.
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'commercial_group.created';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'commercial_group.updated';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'commercial_group.activated';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'commercial_group.deactivated';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'commercial_group.member_added';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'commercial_group.member_removed';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'commercial_group.primary_member_changed';
ALTER TYPE audit_entity_type ADD VALUE IF NOT EXISTS 'commercial_group';

CREATE TABLE commercial_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  group_type text NOT NULL DEFAULT 'client' CHECK (group_type = 'client'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Um "membro" é um client existente (o "documento" do grupo). Sem tabela
-- própria de CPF/CNPJ/nome — isso já é o cadastro de clients.
CREATE TABLE commercial_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES commercial_groups(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Nunca duas linhas para o mesmo par grupo/cliente, ativa ou não —
  -- reativar um membro removido é UPDATE na linha existente, não INSERT novo.
  UNIQUE (tenant_id, group_id, client_id)
);

CREATE INDEX commercial_groups_tenant_name_idx ON commercial_groups (tenant_id, name);
CREATE INDEX commercial_group_members_group_idx ON commercial_group_members (tenant_id, group_id);
CREATE INDEX commercial_group_members_client_idx ON commercial_group_members (tenant_id, client_id);

-- Invariante 1: um client só pode estar ativo em um grupo comercial por vez.
CREATE UNIQUE INDEX commercial_group_members_client_active_unique
  ON commercial_group_members (tenant_id, client_id) WHERE is_active;

-- Invariante 2: no máximo um membro principal ativo por grupo.
CREATE UNIQUE INDEX commercial_group_members_group_primary_unique
  ON commercial_group_members (tenant_id, group_id) WHERE is_primary AND is_active;

ALTER TABLE commercial_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_groups FORCE ROW LEVEL SECURITY;
CREATE POLICY commercial_groups_tenant_isolation ON commercial_groups
  FOR ALL TO ippa_app
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

ALTER TABLE commercial_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_group_members FORCE ROW LEVEL SECURITY;
CREATE POLICY commercial_group_members_tenant_isolation ON commercial_group_members
  FOR ALL TO ippa_app
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON commercial_groups, commercial_group_members TO ippa_app;
