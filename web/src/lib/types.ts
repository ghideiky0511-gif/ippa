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
}

export interface CartItem {
  key: string;
  id: string;
  name: string;
  image?: string;
  color: string;
  size: string;
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

export type UserRole = 'vendedora' | 'cliente';

// Usuário autenticado (login email+senha) — versão sem passwordHash, é o
// formato que trafega pro cliente/sessão. Fonte de dado real é
// web/src/data/users.json + web/src/lib/auth.ts.
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

// Cadastro de cliente — separado de AuthUser de propósito: uma cliente pode
// existir aqui (criada pela vendedora, presencial/WhatsApp) sem nunca ter
// feito login. Quando ela um dia entrar sozinha, o login (email+senha, em
// users.json) referencia esse registro por `clientId`. `lastSellerId` é a
// última vendedora que a atendeu — usado na regra de "cai pra quem
// atendeu da última vez" quando ela volta a montar carrinho sozinha (ver
// web/src/lib/assignment.ts). "Completo" pra poder fechar um pedido
// (fluxo de frete) = name + cpfCnpj + email + cep preenchidos — ver
// isClientComplete em web/src/lib/clients.ts.
export interface Client {
  id: string;
  name: string;
  cpfCnpj?: string;
  email?: string;
  cep?: string;
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
  channel: 'presencial' | 'whatsapp';
  items: CartItem[];
  status: 'aberto' | 'fechado';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Order {
  id: string;
  date: string;
  items: CartItem[];
  total: number;
  channel: string;
  shipping?: ShippingOption;
  paymentMethod?: string;
}

export interface ShippingOption {
  id: string;
  label: string;
  price: number;
  prazo: string;
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
