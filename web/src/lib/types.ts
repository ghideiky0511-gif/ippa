export type Availability = 'in_stock' | 'preorder' | 'backorder' | 'out_of_stock';

export interface Variant {
  id: string;
  color: string;
  size: string;
  price: number;
  availability: Availability;
  // Quando disponível vem do ERP: data (ISO ou "mês/ano" livre, ex.
  // "2027-05") a partir de quando essa variante em pré-venda/backorder fica
  // disponível — mostrado na grade de cor×tamanho do produto (inspirado no
  // Teceo Colab). Sem UI de edição ainda: é a fonte de dado (Bippa/ERP),
  // não algo que a loja cadastra pelo admin.
  availableFrom?: string;
  // Quantidade em estoque pra essa variante específica, quando o Bippa/ERP
  // mandar. Sem valor = sem controle de estoque (comportamento de hoje: o
  // stepper de quantidade não tem limite). Com valor, é o que separa
  // "pronta entrega" de "excedente sob encomenda" no seletor de quantidade
  // — ver splitStockQty em web/src/lib/variants.ts.
  stockQty?: number;
}

// Como o ERP pode descrever a "grade" (composição de tamanho/cor) de um
// produto — 3 formatos combinados com o usuário:
// 1. 'unit'  — venda por SKU individual (ex. "1 P", "1 G"): é o que a
//    grade normal (matrix cor×tamanho, ProductDetailContent) já faz hoje,
//    sem precisar de Pack nenhum.
// 2. 'grade' — grade fechada de uma cor só, várias combinações possíveis
//    de tamanho+qty (ex. "Grade tipo 1" = 1M+2P+3G). Um mesmo produto pode
//    ter vários tipos de grade diferentes (Grade tipo 1, tipo 2, ...) —
//    cada um é um Pack separado com scope='grade'.
// 3. 'pack'  — mistura tamanho + quantidade + cor num bundle só (cor varia
//    por item dentro do mesmo pack) — usa PackItem.color.
export type PackScope = 'grade' | 'pack';

// Um pack é uma grade fechada que já vem montada de fábrica (ex.: 1×P +
// 2×M + 1×G, vendido como uma unidade só, num preço próprio) — diferente
// de escolher tamanho a tamanho na grade normal (essa é scope='unit', que
// nem gera Pack). `items` é a composição fechada; não dá pra tirar um
// tamanho de dentro do pack.
export interface PackItem {
  size: string;
  qty: number;
  // Cor deste item. Só usado/relevante quando Pack.scope === 'pack' (o
  // bundle mistura cores); em scope 'grade' a cor é única e vem de
  // Pack.color, então PackItem.color fica de fora.
  color?: string;
}

export interface Pack {
  id: string;
  scope: PackScope;
  label: string; // ex. "Grade tipo 1", "Pack sortido verão"
  color?: string; // cor única do bundle — usado quando scope='grade'; ignorado quando scope='pack' (cor vem por item, ver PackItem.color)
  price: number; // preço do pack fechado (não é a soma automática dos preços unitários)
  items: PackItem[];
}

export interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  subcategory?: string;
  brand?: string;
  sku?: string; // código/referência interna (Bippa/ERP) — mostrado no card e na página de produto
  price: number;
  image?: string;
  images?: string[];
  imagesByColor?: Record<string, string>;
  colors: string[];
  sizes: string[];
  variants: Variant[];
  // Campos abaixo: "caixinhas" já preparadas pra quando essa informação
  // existir (Bippa/ERP ou loja), sem UI própria ainda.
  videoUrl?: string; // vídeo do produto (não confundir com vídeo de banner, ver Banner.type)
  suggestedRetailPrice?: number; // preço sugerido de revenda ("R$ 1.320 sugerido" no Colab)
  markup?: number; // suggestedRetailPrice / price, calculado ou vindo do ERP — mostrado junto do preço de atacado
  relatedProductIds?: string[]; // "complete o look" — vínculo manual entre peças, curado pela loja
  // Packs têm UI de verdade (não só o tipo) — ver ProductDetailContent.tsx.
  // Ainda sem "adicionar ao carrinho" pro pack em si: isso muda o formato
  // do pedido/mensagem de WhatsApp, é uma decisão separada pra quando o
  // ERP realmente mandar pack de verdade.
  packs?: Pack[];
  // Curadoria manual de "produtos similares" (ver SimilarProductsSettings
  // abaixo), 1 por 1, separada por contexto — quando presente (>=1 id),
  // substitui a regra automática desse contexto pra este produto, sem
  // completar até o limite (curadoria manual é intencional, mesmo que
  // fique com menos cards que o limite configurado). undefined = sem
  // curadoria, usa a regra configurada em /ferramentas.
  similarProductIdsQuickview?: string[]; // usado no quick-view E na página cheia do produto (mesma âncora: o produto sendo visto)
  similarProductIdsCart?: string[]; // usado quando este produto está no carrinho (pode combinar com curadoria de outras peças do mesmo carrinho)
  // Desconto "peças específicas" ativo pra esta peça — calculado em
  // getCatalog() (web/src/lib/catalog.ts) a partir de discounts.json,
  // mostrado como preço riscado no card e na página do produto. NÃO inclui
  // desconto "por quantidade": esse depende de quantas unidades desta peça
  // estão no carrinho (ver cartDiscountByProduct em CartProvider.tsx), que
  // getCatalog() não sabe (não tem acesso ao carrinho, é estático).
  activeDiscount?: { label: string; percent: number };
}

// `color`/`size` ausentes = "rascunho" — produto adicionado pelo botão +
// do card, sem grade escolhida ainda (ver addDraft em CartProvider.tsx).
// `qty` fica 0 nesse caso. Vira um CartItem "de verdade" (color/size/qty
// preenchidos) quando a pessoa escolhe a grade no quick-view — ver
// GroupedCartItems.tsx pra como o carrinho mostra os dois estados.
export interface CartItem {
  key: string;
  id: string;
  name: string;
  image?: string;
  color?: string;
  size?: string;
  price: number;
  qty: number;
  // Snapshot do estoque da variante no momento em que foi adicionada ao
  // carrinho (não recalcula depois — se o estoque mudar, a peça já
  // escolhida não deve "sumir" a previsão combinada). Sem valor = sem
  // controle de estoque, qty inteira é "pronta entrega" (hoje).
  stockQty?: number;
  // Previsão de entrega escolhida pra a parte da qty que excede stockQty
  // (rótulo livre, ex. "Em 30 dias" — vem de CONFIG.backorderDeliveryOptions,
  // que é por loja). Sem valor = ainda não escolhida.
  backorderDate?: string;
}

// 'administrador'/'expedicao'/'entregador' são perfis internos da loja,
// criados só pelo admin (ver POST /api/admin/users) — ninguém se
// autocadastra com eles. 'vendedora'/'cliente' continuam com todo o
// comportamento de sempre (talão, checkout) — os três perfis novos ainda
// não têm tela própria no catálogo (expedição/entregador caem em
// /em-construcao até ganharem uma, ver AuthUser.permissions abaixo e
// web/src/middleware.ts).
export type UserRole = 'administrador' | 'vendedora' | 'expedicao' | 'entregador' | 'cliente';

// Usuário autenticado (login email+senha) — versão sem passwordHash, é o
// formato que trafega pro cliente/sessão. Fonte de dado real é
// web/src/data/users.json + web/src/lib/auth.ts.
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  // Só presente quando role === 'cliente' — vincula ao cadastro em Client
  // (ver abaixo), criado junto no autocadastro (POST /api/auth/signup).
  clientId?: string;
  // Permissão por CONTA, não fixa pelo role — o admin decide na hora de
  // criar (ou depois, editando) quem entra na plataforma admin e quais
  // áreas do catálogo aquela conta pode navegar. Ver defaultPermissionsFor
  // em web/src/lib/auth.ts (o que cada role ganha ao ser criado, só como
  // ponto de partida editável).
  permissions?: {
    // Acesso à plataforma admin (porta 3001) — checado em
    // POST /api/admin/auth/login, nada a ver com o role em si.
    adminAccess?: boolean;
    // Áreas do catálogo (porta 3000) liberadas pra essa conta — chaves
    // hoje: 'talao', 'pedidos'. Lista pensada pra crescer (separação,
    // rota de entrega) sem precisar redesenhar nada — ver
    // web/src/middleware.ts (só intercepta quem não é vendedora/cliente,
    // esses dois continuam com acesso total de sempre).
    catalogAreas?: string[];
  };
}

// Cadastro de cliente — separado de AuthUser de propósito: uma cliente pode
// existir aqui (criada pela vendedora, presencial/WhatsApp) sem nunca ter
// feito login. Quando ela um dia entrar sozinha, o login (email+senha, em
// users.json) referencia esse registro por `clientId`. `lastSellerId` é a
// última vendedora que a atendeu — usado na regra de "cai pra quem
// atendeu da última vez" quando ela volta a montar carrinho sozinha (ver
// web/src/lib/assignment.ts). "Completo" pra poder fechar um pedido
// (fluxo de frete) = name + cpfCnpj + email + cep preenchidos — ver
// isClientComplete em web/src/lib/clientComplete.ts.
export interface Client {
  id: string;
  name: string;
  cpfCnpj?: string;
  email?: string;
  cep?: string;
  // Endereço completo — opcional aqui (cadastro parcial da vendedora no
  // talão pode não ter isso), mas obrigatório no autocadastro da cliente
  // final (POST /api/auth/signup, ver web/src/app/cadastro/page.tsx e o
  // autofill por CEP via ViaCEP). isClientComplete (clientComplete.ts) não
  // exige esses campos — o gate do talão continua só nome+CPF/CNPJ+email+CEP.
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  // Opcionais, mostrados condicionalmente no cadastro conforme o
  // documento digitado (nunca os dois ao mesmo tempo — ver docType em
  // web/src/app/cadastro/page.tsx e ClientCadastroSection.tsx): CNPJ
  // (14 dígitos) pergunta quem é o responsável pela empresa; CPF (11
  // dígitos) pergunta o nome da loja da cliente (revendedora informal).
  // Nunca bloqueiam o cadastro — a pessoa segue sem preencher se quiser.
  companyResponsible?: string;
  storeName?: string;
  // Carrinho pessoal da cliente logada (fora de sessão de talão), espelhado
  // aqui pra sobreviver além do localStorage do navegador — não é usado pra
  // exibir/restaurar nada na tela hoje (CartProvider.tsx continua lendo do
  // localStorage), é só captura de dado pra análise futura (quantas
  // clientes montam carrinho e não finalizam — "carrinho abandonado").
  // Limpo (vira []) quando o pedido é finalizado.
  cart?: CartItem[];
  cartUpdatedAt?: string;
  lastSellerId?: string;
  createdAt: string;
  updatedAt: string;
}

// Talão: um pedido em andamento, vinculado a uma vendedora e, opcionalmente,
// a um cadastro de cliente (`clientId`, ver Client acima) — sem cadastro
// ainda, `clientName` é só um nome livre (ex. "Sem cliente", ou o nome que
// a vendedora digitou pra lembrar quem é, sem formalizar). Uma vendedora
// pode ter várias sessões abertas ao mesmo tempo (uma por cliente que está
// atendendo); troca entre elas no talão (`TalaoDrawer.tsx`). Reaproveita
// CartItem — é o mesmo formato de "peça no carrinho" que o site público já
// usa.
export interface OrderSession {
  id: string;
  clientName: string;
  clientId?: string;
  sellerId: string;
  // 'online': sessão criada sozinha pelo gatilho de fila quando a cliente se
  // autocadastra (ver POST /api/auth/signup) — não é presencial nem
  // WhatsApp, ninguém digitou nada pra escolher o canal.
  channel: 'presencial' | 'whatsapp' | 'online';
  items: CartItem[];
  // Frete escolhido pela vendedora (ver /frete) — precisa sobreviver até a
  // cliente abrir o link de pagamento, por isso persistido aqui em vez de
  // ficar só no estado transitório que CartProvider usa pra compra direta.
  shipping?: ShippingOption;
  // 'aguardando_pagamento': vendedora já montou carrinho + frete e gerou o
  // link (ver paymentToken abaixo) — só falta a cliente pagar. Continua
  // contando como "aberto" no painel do talão (ver openSessions em
  // TalaoProvider.tsx), com um badge próprio pra não confundir com pedido
  // ainda em montagem.
  status: 'aberto' | 'fechado' | 'aguardando_pagamento';
  // Token do link de pagamento ativo (web/src/app/pagar/[token]/page.tsx) —
  // é a própria autenticação desse link (sem exigir login da cliente).
  // Limpo quando a sessão fecha (POST /api/pay/[token]) ou reabre
  // (PUT /api/sessions/[id], status volta pra 'aberto').
  paymentToken?: string;
  // Quando o token acima foi gerado — usado pra checar expiração
  // (storeSettings.json `paymentLinkExpirationMinutes`, ver
  // GET/POST /api/pay/[token]). Limpo junto com paymentToken.
  paymentTokenCreatedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  // Nome da vendedora — NÃO persistido, computado só na resposta de
  // GET /api/sessions/mine (a partir de sellerId, ver getAuthUserById em
  // web/src/lib/auth.ts) pro indicador de presença na tela da cliente
  // (PresenceBadge.tsx). Ausente em qualquer outro lugar que devolve
  // OrderSession (talão da vendedora não precisa disso, ela já sabe quem é).
  sellerName?: string;
}

export interface Order {
  id: string;
  date: string;
  items: CartItem[];
  total: number; // já líquido de desconto (ver getCartDiscount em web/src/lib/discounts.ts)
  channel: string;
  shipping?: ShippingOption;
  paymentMethod?: string;
  discount?: { label: string; amount: number }; // snapshot do desconto aplicado no momento da compra, pra "Meus pedidos" mostrar mesmo se a regra mudar depois
  // Presentes só nos pedidos gravados no servidor (web/src/lib/orderHistory.ts),
  // não nos antigos/locais salvos só no localStorage do navegador (ver
  // readOrders em CartProvider.tsx). clientId: autocompra da cliente logada
  // OU pedido de talão fechado via link de pagamento (ver
  // POST /api/pay/[token]/route.ts) — nesse segundo caso sellerId também
  // vem preenchido (a vendedora que montou o pedido).
  clientId?: string;
  sellerId?: string;
  // Snapshot do nome da cliente no momento do pedido — só usado pra
  // "Minhas vendas" da vendedora (web/src/app/pedidos/page.tsx), que lista
  // vendas de clientes diferentes e precisa saber de quem é cada uma; a
  // própria "Meus pedidos" da cliente não precisa disso (já é sempre ela).
  clientName?: string;
}

export interface ShippingOption {
  id: string;
  label: string;
  price: number;
  prazo: string;
}

// Desconto cadastrado pela loja em /descontos (plataforma admin). Dois
// tipos: 'quantity' — progressivo pela quantidade TOTAL de peças do
// pedido (`tiers`, ex. "acima de 10 peças, 10% off"); 'products' —
// percentual fixo (`percent`) só nas peças escolhidas em `productIds`.
// Cadastro apenas por enquanto — ainda não é aplicado no cálculo do
// carrinho/checkout (ver PLANO-PROXIMOS-PASSOS.md).
export interface DiscountTier {
  minQty: number;
  percent: number;
}

export interface Discount {
  id: string;
  label: string;
  active: boolean;
  type: 'quantity' | 'products';
  tiers: DiscountTier[];
  productIds: string[];
  percent: number;
}

export interface Highlight {
  id: string;
  label: string;
  productIds: string[];
}

export interface Audience {
  id: string;
  label: string;
  productIds: string[] | null;
}

export interface Banner {
  id: string;
  type: 'image' | 'video';
  mediaUrl: string;
  title?: string;
  subtitle?: string;
}

// Posição/tamanho livres (px, canvas de referência de 1200px de largura —
// mesma largura de `.container`/`.home-sections`). O editor admin é um
// ambiente de criação de layout: nada se move sozinho quando outro bloco
// muda de tamanho, a posição de cada bloco só muda quando o adm arrasta
// aquele bloco especificamente. Em telas de celular (<=640px) o site
// ignora x/y/width e empilha os blocos em ordem de `y`, largura 100% — ver
// a media query em web/src/app/globals.css.
export type HomeSection =
  | { type: 'banner'; id: string; banners: Banner[]; x?: number; y?: number; width?: number; height?: number }
  | { type: 'product'; id: string; productId: string; x?: number; y?: number; width?: number; height?: number };

export type ResolvedHomeSection = HomeSection & { product?: Product };

export interface CategoryTreeEntry {
  category: string;
  subcategories: string[];
}

// Configuração da regra de "produtos similares" (ver web/src/lib/similarProducts.ts),
// editável pela loja em /ferramentas (plataforma admin) — separada por
// contexto porque o quick-view/página de produto (âncora única: o produto
// sendo visto) e o carrinho (várias âncoras: os produtos já escolhidos)
// pedem composições diferentes.
export interface SimilarProductsRuleConfig {
  limit: number; // quantas peças mostrar nesse contexto
  rules: string[]; // ids de regras ativas, na ordem escolhida — ver SIMILAR_PRODUCTS_RULES em similarProducts.ts
}

export interface SimilarProductsSettings {
  quickview: SimilarProductsRuleConfig; // usado também pela página cheia do produto (mesma âncora única)
  cart: SimilarProductsRuleConfig;
  complementaryCategories: Record<string, string[]>; // categoria -> categorias complementares, usado pela regra "complementaryCategory"
}
