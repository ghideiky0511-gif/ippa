-- Remove clients.parent_client_id (migration 026): a composição de
-- matriz/filiais usada no talão passa a vir de commercial_groups
-- (migration 027) — um client é "matriz" quando é o membro principal
-- (is_primary) de um grupo comercial ativo, e "filial" quando é membro não
-- principal do mesmo grupo. Isso substitui a hierarquia de 1 nível que
-- vivia direto na tabela clients por uma associação N:N mediada por tabela
-- própria, já com CRUD dedicado (ver services/commercialGroups).
--
-- Nenhuma linha tinha parent_client_id preenchido em produção até este
-- ponto (feature ainda não lançada, ver migration 026), então não há dado
-- a migrar para commercial_group_members antes do DROP.
DROP INDEX IF EXISTS clients_parent_client_id_idx;
ALTER TABLE clients DROP COLUMN IF EXISTS parent_client_id;
