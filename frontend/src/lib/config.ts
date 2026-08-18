// Regras do catálogo que ainda não possuem configuração por tenant. A
// identidade da loja (nome e slug) vem do tenant ativo, nunca deste arquivo.
//
// Liga/desliga de ferramentas opcionais do catálogo (ex. preço sugerido +
// markup) NÃO mora mais aqui — virou web/src/data/storeSettings.json
// (`features`), editável em tempo real pela plataforma admin em
// /ferramentas (GET/PUT em /api/store-settings) e aplicado em
// web/src/lib/catalog.ts (`getCatalog`, `stripDisabledFeatures`).
export const CONFIG: {
  whatsappNumber: string;
  // Opções de previsão de entrega pra quantidade que excede o estoque
  // (backorder) na grade de cor×tamanho — rótulo livre, cada loja define
  // os prazos que fazem sentido pro seu fornecedor. Mock por enquanto
  // (mesmo padrão de web/src/lib/shipping.ts), sem UI de edição — quando o
  // Bippa/ERP realmente mandar `stockQty` por variante é que vale a pena
  // decidir se isso vira editável em /admin ou continua fixo por deploy.
  backorderDeliveryOptions: { id: string; label: string }[];
  home: {
    audiences: { id: string; label: string; productIds: string[] | null }[];
  };
} = {
  whatsappNumber: '', // formato internacional só números, ex: '5511999999999'. Vazio = avisa antes de abrir o link.

  backorderDeliveryOptions: [
    { id: '30d', label: 'Em 30 dias' },
    { id: '60d', label: 'Em 60 dias' },
    { id: '90d', label: 'Em 90 dias' },
  ],

  home: {
    // A lista de sections da home (banners, produtos) NÃO mora mais aqui —
    // virou web/src/data/homeSections.json, editável em tempo real pela
    // plataforma admin (GET/PUT em /api/home-sections) e lida por
    // web/src/app/page.tsx a cada request. Formato de cada item: `type:
    // 'banner'` com `banners: [{id, type: 'image'|'video', mediaUrl,
    // title?, subtitle?}]`, ou `type: 'product'` com um único `productId`
    // — cada produto é seu próprio bloco arrastável/redimensionável, não
    // uma vitrine com grade fixa (ver web/src/lib/types.ts HomeSection).

    // Destaques de coleção (ex. "Verão 2027") também NÃO moram mais aqui —
    // viraram web/src/data/highlights.json, editáveis em /colecoes na
    // plataforma admin (GET/PUT em /api/highlights, drag-and-drop pra
    // ordenar os produtos dentro da coleção). Lidos em tempo de request
    // por web/src/app/layout.tsx (menu lateral) e /catalogo (filtro).

    // Públicos/segmentos mostrados no menu lateral (ex.: "Moda teen"). Cada
    // entrada leva pras categorias filtradas por esse público.
    // `productIds: null` é a convenção pra "sem filtro, catálogo inteiro" —
    // usada aqui porque o feed atual já é 100% moda teen. Adicionar um
    // segundo público (ex. "Moda adulto") com sua própria lista de IDs não
    // exige mexer em componente nenhum.
    audiences: [
      { id: 'moda-teen', label: 'Moda teen', productIds: null },
    ],
  },
};

export const COLOR_MAP: Record<string, string> = {
  PRETO: '#1a1a1a', BRANCO: '#ffffff', 'OFF WHITE': '#f2ede4', AZUL: '#2b5fa4', 'AZUL CLARO': '#7fb3e0',
  VERMELHO: '#c0392b', VERDE: '#2e8b57', AMARELO: '#f1c40f', ROSA: '#e79fc4', 'ROSA BEBE': '#f5c9dd',
  ROXO: '#8e44ad', LARANJA: '#e67e22', MARROM: '#6b4226', CINZA: '#9a9a9a', DOURADO: '#c9a227',
  PRATA: '#c0c0c0', BEGE: '#e8dcc8', VINHO: '#6d1b2f', PINK: '#ff2d95', NUDE: '#dfc0a8',
  CARAMELO: '#a86b32', MADELAINE: '#caa27a', GOIABA: '#e8607a', PISTACHE: '#a3b18a', ROSE: '#e8b4bc',
  CAFE: '#4b3221', MANTEIGA: '#f3e5ab', AMENDOA: '#c9a27a',
};
