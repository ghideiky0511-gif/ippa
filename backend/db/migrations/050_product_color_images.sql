-- Galeria de fotos por cor: hoje o produto tem no máximo 1 foto por cor
-- (media.imagesByColor, JSONB) e uma galeria única (media.images) misturando
-- fotos de todas as cores no quick-view. Tabela relacional dedicada (mesmo
-- padrão de product_compositions) porque cada cor pode ter várias fotos, em
-- ordem própria, e essa ordem precisa ser editável sem reescrever o JSONB
-- inteiro do produto.

CREATE TABLE product_color_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  product_id uuid NOT NULL,
  color text NOT NULL,
  image_url text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id) ON DELETE CASCADE,
  UNIQUE (tenant_id, product_id, color, position)
);

CREATE INDEX product_color_images_tenant_product_idx ON product_color_images (tenant_id, product_id);

ALTER TABLE product_color_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_color_images FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON product_color_images FOR ALL TO PUBLIC
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON product_color_images TO ippa_app;
