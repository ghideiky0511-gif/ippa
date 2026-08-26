-- Coleção cadastrada em /workspace/colecoes só deve virar vitrine sticky no
-- catálogo público quando a vendedora explicitamente marcar isso — antes,
-- toda highlight cadastrada aparecia automaticamente. Default false: coleção
-- nova nasce oculta até ser publicada.
ALTER TABLE highlights ADD COLUMN show_in_catalog boolean NOT NULL DEFAULT false;
