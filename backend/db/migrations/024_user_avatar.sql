-- Foto opcional do perfil. A URL fica no cadastro da conta e \u00e9 exposta
-- somente junto ao usu\u00e1rio autenticado/listado no mesmo tenant.
ALTER TABLE users ADD COLUMN avatar_key text;
