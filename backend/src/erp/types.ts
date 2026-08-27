import type { Client, Company, Order, Product } from "@/lib/types";
import type { ExternalApiCallReporter } from "@/lib/externalApiCall";

// Contrato que todo provider de ERP implementa. Cada método já devolve o
// tipo interno do domínio (Product/Order/Client/Company) — a "adequação"
// do formato bruto do ERP para o nosso sistema acontece dentro do próprio
// provider (ver providers/mock/mapper.ts), nunca aqui. Este arquivo não
// conhece banco nem tenant: quem resolve qual provider usar para qual
// tenant é @/services/erp/erpSyncService, não esta camada.

export interface ErpRecord<T> {
    externalId: string;
    data: T;
}

export interface ErpFetchOptions {
    updatedSince?: Date;
    cursor?: string;
}

export interface ErpFetchResult<T> {
    items: ErpRecord<T>[];
    nextCursor?: string;
}

export interface ErpProductChangeWindow {
    startDate?: Date;
    endDate?: Date;
    // Gate de publicação do tenant (catalog_sync_configs), repassado para
    // quem suportar filtrar na origem -- evita descobrir/baixar referência
    // que shouldPublishReference (catalogSyncService.ts) ia descartar de
    // qualquer forma. Provider que não suportar simplesmente ignora.
    classificationTypeCode?: number;
    classificationCodes?: string[];
}

export interface ErpProductChangePage {
    referenceCodes: string[];
    nextCursor?: string;
}

export interface ErpClassificationSnapshot {
    typeCode?: number;
    typeName?: string;
    code?: string;
    name?: string;
}

export interface ErpSkuSnapshot {
    externalId: string;
    sku?: string;
    color: string;
    size: string;
    isActive: boolean;
    isBlocked: boolean;
}

export interface ErpReferenceSnapshot {
    externalId: string;
    name: string;
    description?: string;
    category?: string;
    subcategory?: string;
    collection?: string;
    brand?: string;
    classifications: ErpClassificationSnapshot[];
    skus: ErpSkuSnapshot[];
}

export interface ErpPriceSnapshot {
    skuExternalId: string;
    price: number;
}

export interface ErpStockSnapshot {
    skuExternalId: string;
    locationExternalId: string;
    locationName?: string;
    quantity: number;
}

export type ErpProviderCredentials = Record<string, unknown>;

// Dado auxiliar de um pedido que só existe no banco (não em Order/CartItem),
// resolvido pelo motor (services/erp/orderPushService) antes de chamar
// sendOrder -- ver comentário em ErpProvider.sendOrder. productReferenceIds
// é indexado pelo mesmo id que aparece em order.items[].id (o product_id do
// CartItem), nunca pela chave do item no carrinho (item.key).
export interface ErpOrderPushContext {
    clientDocument?: string;
    productReferenceIds: Record<string, string>;
}

export interface ErpProvider {
    readonly code: string;
    discoverProductChanges(
        window: ErpProductChangeWindow,
        cursor?: string,
    ): Promise<ErpProductChangePage>;
    fetchReference(referenceCode: string): Promise<ErpReferenceSnapshot | null>;
    fetchPrices(productCodes: string[]): Promise<ErpPriceSnapshot[]>;
    fetchStock(productCodes: string[]): Promise<ErpStockSnapshot[]>;
    getProducts(
        options?: ErpFetchOptions,
    ): Promise<ErpFetchResult<Omit<Product, "id">>>;
    getOrders(
        options?: ErpFetchOptions,
    ): Promise<ErpFetchResult<Omit<Order, "id" | "orderNumber">>>;
    getClients(
        options?: ErpFetchOptions,
    ): Promise<ErpFetchResult<Omit<Client, "id" | "createdAt" | "updatedAt">>>;
    getCompanies(
        options?: ErpFetchOptions,
    ): Promise<ErpFetchResult<Omit<Company, "id" | "createdAt" | "updatedAt">>>;
    // Opcional: providers sem uma checagem barata própria simplesmente não
    // implementam — quem chama trata a ausência como "sem teste disponível",
    // nunca como falha.
    testConnection?(): Promise<{ ok: boolean; message?: string }>;
    // Busca pontual por CPF/CNPJ exato (sem paginar a base inteira como
    // getClients faz para sync em lote) — usada quando um cliente é buscado
    // localmente e não existe ainda, para importar sob demanda (ver
    // services/clients/clientService.ts). Opcional pelo mesmo motivo de
    // testConnection: ausência não é falha, é "sem lookup disponível".
    lookupClientByDocument?(
        document: string,
    ): Promise<ErpRecord<
        Omit<Client, "id" | "createdAt" | "updatedAt">
    > | null>;
    // Coligados de uma pessoa física/jurídica já cadastrada no ERP sob este
    // documento (hoje só o TOTVS Moda expõe isso, via expand "relateds") —
    // usado para propor a composição de um grupo comercial a partir do que já
    // existe no ERP (ver services/commercialGroups). Opcional pelo mesmo
    // motivo de lookupClientByDocument: ausência não é falha, é "sem esse
    // dado disponível".
    lookupRelatedPartiesByDocument?(
        document: string,
    ): Promise<Array<{ cpfCnpj: string; name: string }>>;
    // Envia um pedido fechado do nosso lado para o ERP. Opcional pelo mesmo
    // motivo dos demais: um provider sem isso não é erro, é "não suporta
    // envio de pedido ainda" (ver services/erp/orderPushService, que trata a
    // ausência como falha terminal do envio, não como bug). idempotencyKey
    // (tipicamente o id do pedido local) deixa o provider evitar duplicar o
    // pedido do lado dele se a mesma chamada for repetida. `context` carrega
    // dado auxiliar que só quem tem acesso a banco consegue resolver (este
    // arquivo não conhece banco — ver comentário no topo): documento do
    // cliente e reference_id por produto, hoje; um provider que não precisa
    // de algo aqui simplesmente ignora o campo.
    sendOrder?(
        order: Order,
        context: ErpOrderPushContext,
        options?: { idempotencyKey?: string },
    ): Promise<{ externalId: string; raw?: Record<string, unknown> }>;
    // Cancela um pedido já enviado (ver orderPushService: cancelar-antes-de-
    // recriar é como o motor trata resend, sem saber por que o provider
    // exige isso). Deve rejeitar com um erro reconhecível como definitivo
    // (não repetível) quando o cancelamento é impossível no destino — ex.
    // pedido já aceito/processado do outro lado — para o motor não tentar de
    // novo nem criar um pedido duplicado por cima.
    cancelOrder?(
        externalId: string,
        options?: { reason?: string },
    ): Promise<{ raw?: Record<string, unknown> }>;
}

// reporter é opcional e não carrega tenant/banco (ver lib/externalApiCall.ts)
// — quem resolve o tenant (erpSyncService) fecha o reporter sobre ele antes
// de chamar a fábrica.
export type ErpProviderFactory = (
    credentials: ErpProviderCredentials,
    reporter?: ExternalApiCallReporter,
) => ErpProvider;

// Marca um erro de sendOrder/cancelOrder como definitivo — o motor
// (services/erp/orderPushService) não tenta de novo nem avança para o
// próximo passo da máquina de estados (ex.: se cancelar falhou assim, não
// tenta criar um pedido novo por cima, evitando duplicar reserva de
// estoque). Duck-typing por propriedade, não por classe: cada provider já
// tem sua própria hierarquia de erro (ver providers/totvsmoda/errors.ts) e
// só precisa marcar a instância, não herdar de algo definido aqui.
export interface NonRetryableErpOrderError {
    readonly nonRetryable: true;
}

export function isNonRetryableErpOrderError(
    error: unknown,
): error is Error & NonRetryableErpOrderError {
    return (
        error instanceof Error &&
        (error as Partial<NonRetryableErpOrderError>).nonRetryable === true
    );
}
