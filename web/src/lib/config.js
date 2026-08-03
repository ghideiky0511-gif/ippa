// Configuração da loja — troque aqui para reaproveitar o catálogo com outra
// marca/cliente. Ainda é um arquivo único por deploy (sem multi-tenant real
// ainda — isso é uma etapa à parte, precisa de banco/login), mas o conteúdo
// da loja já fica organizado aqui num único lugar fácil de trocar.
export const CONFIG = {
  storeName: 'Fashion Girl Atacado',
  logoUrl: '', // opcional; sem logo, mostra o storeName como texto
  whatsappNumber: '', // formato internacional só números, ex: '5511999999999'. Vazio = avisa antes de abrir o link.

  home: {
    // type: 'image' | 'video'. Sem nenhum banner aqui, a home cai num slide
    // só de texto com o storeName (mesmo fallback do banner antigo).
    banners: [
      {
        id: 'b1',
        type: 'image',
        mediaUrl: 'https://cdn-op.vesti.mobi/p/3301/47275ecd-e018-4ed3-a505-e4931a137fc5/99883-lg.jpeg',
        title: 'Fashion Girl Atacado',
        subtitle: 'Novidades toda semana — confira a coleção completa',
      },
      {
        id: 'b2',
        type: 'image',
        mediaUrl: 'https://cdn-op.vesti.mobi/p/3301/e0512949-5e71-4099-be10-b5cd7bc7561b/95846-lg.png',
        title: 'Peças em destaque',
        subtitle: 'Selecionadas pra vender mais rápido no seu ponto',
      },
    ],
    // Curadoria manual por enquanto (lista de IDs de web/src/data/catalog.json).
    // Fica pronto pra virar sugestão por analytics de venda quando existir
    // conta de loja/admin — sem precisar mexer no componente que consome isso.
    featuredProductIds: [
      'bc4a970c-6194-42c1-a5b9-18b17028e71d',
      '53c399af-0bda-43f1-b85d-273375fe1765',
      '47275ecd-e018-4ed3-a505-e4931a137fc5',
      '6c30a116-7990-4336-bc62-35076e7be068',
      'e0512949-5e71-4099-be10-b5cd7bc7561b',
      '34235c31-4a17-4607-bd12-574750500aa9',
      '7f59a480-a574-4187-a9b3-6b3b53965a83',
      'afa3c5e1-0094-4267-b19b-43e9ec13ca7b',
    ],
  },
};

export const COLOR_MAP = {
  PRETO: '#1a1a1a', BRANCO: '#ffffff', 'OFF WHITE': '#f2ede4', AZUL: '#2b5fa4', 'AZUL CLARO': '#7fb3e0',
  VERMELHO: '#c0392b', VERDE: '#2e8b57', AMARELO: '#f1c40f', ROSA: '#e79fc4', 'ROSA BEBE': '#f5c9dd',
  ROXO: '#8e44ad', LARANJA: '#e67e22', MARROM: '#6b4226', CINZA: '#9a9a9a', DOURADO: '#c9a227',
  PRATA: '#c0c0c0', BEGE: '#e8dcc8', VINHO: '#6d1b2f', PINK: '#ff2d95', NUDE: '#dfc0a8',
  CARAMELO: '#a86b32', MADELAINE: '#caa27a', GOIABA: '#e8607a', PISTACHE: '#a3b18a', ROSE: '#e8b4bc',
  CAFE: '#4b3221', MANTEIGA: '#f3e5ab', AMENDOA: '#c9a27a',
};
