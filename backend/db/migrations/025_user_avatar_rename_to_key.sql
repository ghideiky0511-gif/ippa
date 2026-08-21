-- A migration 024 foi editada depois de já aplicada em bancos existentes
-- (coluna criada como avatar_url, renomeada para avatar_key no arquivo).
-- Como o rastreamento de migrations é por nome de arquivo, ela não é
-- reexecutada só porque o conteúdo mudou; esta migration nova alinha
-- bancos antigos com o nome atual esperado pelo código.
ALTER TABLE users RENAME COLUMN avatar_url TO avatar_key;
