-- 'user.updated' já é usado por updateOwnProfile, avatarService e
-- changeOwnPassword, mas nunca foi adicionado ao enum audit_action —
-- toda gravação de auditoria nessas rotas falhava com
-- "invalid input value for enum audit_action: user.updated".
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'user.updated';
