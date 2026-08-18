import BannerBlockEditor from '@/admin/components/builder/blocks/BannerBlockEditor';
import ProductBlockEditor from '@/admin/components/builder/blocks/ProductBlockEditor';
import BannerPreview from '@/admin/components/builder/blocks/BannerPreview';
import ProductPreview from '@/admin/components/builder/blocks/ProductPreview';

// Largura do canvas de referência (px) — mesma largura de `.home-sections`
// em web/src/app/globals.css, pra x/y/width feitos aqui corresponderem 1:1
// ao que aparece no site (acima do breakpoint mobile).
export const CANVAS_WIDTH = 1200;

// Menor tamanho aceito pra um bloco (px) — usado tanto pelas alças de
// arrastar quanto pelos campos numéricos de posição/tamanho no painel.
export const MIN_SIZE = 80;

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

// Cada item é uma ferramenta da toolbox. `sectionType` é o formato que
// web/src/lib/catalogFacets.ts (resolveHomeSections) já entende — a
// toolbox pode ter mais ferramentas do que web/ tem "tipos" de verdade
// (ex.: banner-imagem e banner-vídeo viram os dois um section `banner`).
// Adicionar uma ferramenta nova é só um item aqui + um Editor; nada muda
// do lado do catálogo público.
//
// `createDefault(x, y)` recebe o ponto onde o adm soltou a ferramenta no
// canvas (0,0 se não informado, ex. template inicial) e devolve o bloco já
// posicionado ali, com o tamanho padrão daquele tipo.
export const BLOCK_REGISTRY = [
  {
    type: 'banner-image',
    sectionType: 'banner',
    label: 'Banner (imagem)',
    icon: 'IMG',
    Editor: BannerBlockEditor,
    Preview: BannerPreview,
    createDefault: (x = 0, y = 0) => ({
      type: 'banner',
      id: newId(),
      x,
      y,
      width: CANVAS_WIDTH,
      height: 320,
      banners: [{ id: newId(), type: 'image', mediaUrl: '', title: '', subtitle: '' }],
    }),
  },
  {
    type: 'banner-video',
    sectionType: 'banner',
    label: 'Banner (vídeo)',
    icon: 'VID',
    Editor: BannerBlockEditor,
    Preview: BannerPreview,
    createDefault: (x = 0, y = 0) => ({
      type: 'banner',
      id: newId(),
      x,
      y,
      width: CANVAS_WIDTH,
      height: 320,
      banners: [{ id: newId(), type: 'video', mediaUrl: '', title: '', subtitle: '' }],
    }),
  },
  {
    // Um produto = um bloco solto (arrasta, redimensiona, põe onde quiser)
    // — em vez de uma vitrine com grade fixa de N produtos presos juntos.
    type: 'product',
    sectionType: 'product',
    label: 'Produto',
    icon: 'PRD',
    Editor: ProductBlockEditor,
    Preview: ProductPreview,
    createDefault: (x = 0, y = 0) => ({
      type: 'product',
      id: newId(),
      x,
      y,
      width: 280,
      height: 460,
      productId: '',
    }),
  },
];

export function getBlockDefinition(sectionType) {
  return BLOCK_REGISTRY.find((b) => b.sectionType === sectionType);
}

function findTool(type) {
  return BLOCK_REGISTRY.find((b) => b.type === type);
}

// Estado inicial quando a loja ainda não tem nada configurado.
export const STARTER_TEMPLATE = [
  findTool('banner-image').createDefault(0, 0),
  findTool('product').createDefault(0, 340),
];
