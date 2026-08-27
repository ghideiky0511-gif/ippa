// Cliente de recursos do TOTVS Moda — porta client.py. Conhece autenticação,
// endpoints e envelopes externos; não conhece tenant nem banco (o cache de
// token do Python vivia em Postgres por tenant, aqui vira só um campo em
// memória da instância, já que cada ErpProvider é criado por credenciais).
//
// O envelope de request/response de product/v2/products/search, prices/search,
// balances/search, e dos endpoints person/v2 abaixo (individuals/search,
// legal-entities/search, representatives/search, classifications, email-types,
// phone-types) segue o contrato documentado em docs/products.json e
// docs/person.json (OpenAPI oficial do TOTVS Moda) — não é um guess. Orders
// (sales-order/v2) segue o mesmo padrão a partir de
// docs/erp/totvsmoda/sales-order.json (OpenAPI oficial, cobre GET
// orders/search e os DTOs de criação/cancelamento usados por
// createB2COrder/cancelOrder) — a exceção é searchOrders (GET de leitura,
// usado só pelo sync de importação em erpSyncService), cujos nomes de campo
// no payload de busca em si (ver mapper.ts:mapTotvsModaOrder) continuam
// best-effort por não termos precisado validar contra o schema ainda.
// person-statistics não segue o envelope count/totalPages/hasNext/totalItems/
// items — devolve um objeto único, por isso tem seu próprio método
// (getPersonStatistics) fora de searchAndValidate.

import type { ExternalApiCallReporter } from "@/lib/externalApiCall";
import { logger } from "@/lib/logger";
import {
    TotvsModaAuthError,
    TotvsModaClientError,
    TotvsModaNotFoundError,
    TotvsModaOrderRejectedError,
    TotvsModaResponseError,
} from "./errors";
import {
    AUTH_TOKEN_PATH,
    B2C_ORDERS_PATH,
    BRANCHES_LIST_PATH,
    BRANCHES_PATH,
    CLASSIFICATIONS_PATH,
    COMPOSITION_GROUP_PRODUCT_PATH,
    EMAIL_TYPES_PATH,
    INDIVIDUALS_SEARCH_PATH,
    LEGAL_ENTITIES_SEARCH_PATH,
    ORDERS_CANCEL_PATH,
    PERSON_STATISTICS_PATH,
    PHONE_TYPES_PATH,
    PRODUCT_BALANCES_SEARCH_PATH,
    PRODUCT_PRICES_SEARCH_PATH,
    PRODUCTS_SEARCH_PATH,
    REPRESENTATIVES_SEARCH_PATH,
    SALES_ORDER_SEARCH_PATH,
    totvsModaRequest,
} from "./http";

const TOKEN_SAFETY_MS = 30_000;

export interface TotvsModaCredentials {
    clientId: string;
    clientSecret: string;
    username: string;
    password: string;
    // Empresa/filial base para preço e saldo (ReferenceOptionModel.branchInfoCode,
    // PriceInfoModel.branchCode, BalanceInfoModel.branchCode) — obrigatória pela
    // API, não tem um valor genérico possível: é configuração por tenant.
    branchCode: number;
    // Códigos de tabela de preço a considerar (PriceInfoModel.priceCodeList) —
    // o primeiro da lista com valor é usado como Product.price.
    priceCodeList: number[];
    // Códigos de tipo de saldo a somar (BalanceInfoModel.stockCodeList) —
    // somados formam Variant.stockQty.
    stockCodeList: number[];
    // Parâmetros de negócio exigidos por OrderInDto (envio de pedido, ver
    // mapper.ts:mapOrderToTotvsModaOrderInDto) sem equivalente no domínio
    // interno -- cada tenant configura os códigos válidos no TOTVS deles.
    // Opcionais aqui (client não valida) porque só passam a ser obrigatórios
    // quando o tenant realmente usa envio de pedido, não para as demais
    // operações deste client (leitura de produto/pessoa/pedido).
    defaultOperationCode?: number;
    defaultPaymentConditionCode?: number;
    defaultPriorityCode?: number;
    // TypeDiscountInDto.typeDiscountCode -- só passa a ser obrigatório
    // quando o PEDIDO tem desconto (order.discount); pedido sem desconto
    // nunca usa este campo (ver mapOrderToTotvsModaOrderInDto).
    defaultDiscountTypeCode?: number;
    // "Um dos dois, nunca os dois" -- mesma regra de customerCode/
    // customerCpfCnpj (ver mapOrderToTotvsModaOrderInDto).
    representativeCode?: number;
    representativeCpfCnpj?: string;
    // CancelOrderInDto.reasonCancellationCode -- motivo de cancelamento
    // padrão usado pelo motor ao cancelar um pedido para reenviar (ver
    // orderPushService, estado 'cancelling'). Default aplicado em index.ts
    // quando ausente (ver DEFAULT_CANCELLATION_REASON_CODE).
    defaultReasonCancellationCode?: number;
}

interface TotvsModaTokenResponse {
    access_token?: string;
    expires_in?: number;
}

export interface TotvsModaSearchResponse<T> {
    items: T[];
    hasNext?: boolean;
    totalItems?: number;
}

export interface TotvsModaSearchPayload {
    page?: number;
    pageSize?: number;
    updatedSince?: string;
    [key: string]: unknown;
}

export interface TotvsModaProductSearchOptions {
    page: number;
    pageSize: number;
    updatedSince?: string;
    changedUntil?: string;
    productCodeList?: number[];
    referenceCodeList?: string[];
    includeCatalogChanges?: boolean;
    order?: string;
    // Gate de publicação do tenant (classification_type_code/codes em
    // catalog_sync_configs) -- quando presente, filtra na origem em vez de
    // descobrir/baixar referência que shouldPublishReference ia descartar.
    classificationTypeCode?: number;
    classificationCodes?: string[];
}

export interface TotvsModaPersonSearchOptions {
    page: number;
    pageSize: number;
    updatedSince?: string;
}

export interface TotvsModaIndividualSearchOptions extends TotvsModaPersonSearchOptions {
    cpfList?: string[];
}

export interface TotvsModaLegalEntitySearchOptions extends TotvsModaPersonSearchOptions {
    cnpjList?: string[];
}

export interface TotvsModaRepresentativeSearchOptions extends TotvsModaPersonSearchOptions {
    cpfCnpjList?: string[];
}

// DocumentInputType (docs/erp/totvsmoda/sales-order.json) — forma de
// pagamento de uma parcela em PaymentInDto.
export type TotvsModaDocumentType =
    | "InvoiceMarketplace"
    | "Cash"
    | "Billet"
    | "CreditCard"
    | "DebitCard"
    | "RecebimentoPdv"
    | "Paypal"
    | "ReceiptCheck"
    | "Credev"
    | "Invoice"
    | "Advance"
    | "Voucher"
    | "Pix"
    | "PicPay";

// ItemInDto (só os campos que mapper.ts preenche — a lista completa aceita
// bem mais, ver a doc).
export interface TotvsModaOrderItemInput {
    productCode?: number;
    productSku?: string;
    quantity: number;
    price: number;
}

// PaymentInDto (idem — subconjunto usado).
export interface TotvsModaOrderPaymentInput {
    documentType: TotvsModaDocumentType;
    installment: number;
    paymentValue: number;
}

// TypeDiscountInDto: discountValue é a variante "valor" (não percentual) —
// é o que bate com order.discount.amount, já um valor absoluto no domínio
// interno, não um percentual.
export interface TotvsModaOrderDiscountInput {
    typeDiscountCode: number;
    discountValue: number;
}

// OrderInDto (subconjunto que mapper.ts preenche). branchCode/customerCode/
// customerCpfCnpj/representativeCode/representativeCpfCnpj têm a mesma
// regra "só um dos dois" documentada na doc; o client não valida isso, só
// serializa o que o mapper montou.
export interface TotvsModaOrderInput {
    orderId: string;
    branchCode: number;
    orderDate: string;
    customerCode?: number;
    customerCpfCnpj?: string;
    representativeCode?: number;
    representativeCpfCnpj?: string;
    operationCode: number;
    paymentConditionCode: number;
    // StatusOrderInputType: 1=InProgress, 5=Blocked, 8=InAnalysis (a doc
    // nomeia os valores, mas o formato no wire é o inteiro).
    statusOrder: 1 | 5 | 8;
    priorityCode: number;
    // totalAmountOrder é conferido pelo TOTVS contra a soma de items e
    // payments (ver mapOrderToTotvsModaOrderInDto) -- freightValue/discounts
    // abaixo existem justamente para essa soma bater quando o pedido tem
    // frete e/ou desconto, não são cosméticos.
    totalAmountOrder: number;
    items: TotvsModaOrderItemInput[];
    payments?: TotvsModaOrderPaymentInput[];
    discounts?: TotvsModaOrderDiscountInput[];
    freightValue?: number;
    customerOrderCode?: string;
}

// OrderOutDto: resposta do 201 ao criar. orderCode é o número sequencial
// que o TOTVS atribui -- é o "id do ERP" que orderPushService guarda como
// external_id; orderId é só o eco do que nós mandamos (chave de
// idempotência do lado deles).
export interface TotvsModaOrderOutput {
    branchCode?: number | null;
    orderCode?: number | null;
    orderId?: string | null;
}

// CancelOrderInDto: identifica o pedido por orderId OU por
// branchCode+orderCode (nunca os dois). Usamos branchCode+orderCode porque
// orderCode é o que orderPushService.external_id guarda (o "id do ERP" de
// verdade, o número sequencial que o TOTVS atribuiu -- orderId é só o eco
// do identificador que NÓS geramos ao criar, não serve pra reidentificar o
// pedido a partir do external_id guardado).
export interface TotvsModaCancelOrderInput {
    orderId?: string;
    branchCode?: number;
    orderCode?: number;
    reasonCancellationCode: number;
    ReasonCancellationDescription?: string;
}

function trim(value: unknown): string {
    return String(value ?? "").trim();
}

// createB2COrder/cancelOrder só: um 4xx nesses dois endpoints é a API
// recusando a OPERAÇÃO por regra de negócio (payload inválido, pedido já
// aceito na retaguarda etc.) -- repetir a mesma chamada não muda nada, então
// vira TotvsModaOrderRejectedError (não-repetível, ver erp/types.ts). 401/
// 403/404/5xx/timeout continuam com o tipo que totvsModaRequest já lança —
// esses SÃO potencialmente passageiros (token expirado, instabilidade).
function toOrderRequestError(error: unknown): Error {
    if (
        error instanceof TotvsModaClientError &&
        typeof error.statusCode === "number" &&
        error.statusCode >= 400 &&
        error.statusCode < 500 &&
        !(error instanceof TotvsModaAuthError) &&
        !(error instanceof TotvsModaNotFoundError)
    ) {
        return new TotvsModaOrderRejectedError(error.message, {
            statusCode: error.statusCode,
            endpoint: error.endpoint,
            payload: error.payload,
        });
    }
    return error instanceof Error ? error : new Error(String(error));
}

export class TotvsModaClient {
    private accessToken: string | null = null;
    private tokenExpiresAt: number | null = null;

    constructor(
        private readonly credentials: TotvsModaCredentials,
        private readonly reporter?: ExternalApiCallReporter,
    ) {}

    private async authenticate(force = false): Promise<string> {
        const { clientId, clientSecret, username, password } = this.credentials;
        if (!clientId || !clientSecret || !username || !password) {
            throw new TotvsModaAuthError(
                "Credenciais do TOTVS Moda não estão totalmente configuradas.",
            );
        }
        if (
            !force &&
            this.accessToken &&
            this.tokenExpiresAt !== null &&
            Date.now() + TOKEN_SAFETY_MS < this.tokenExpiresAt
        ) {
            return this.accessToken;
        }
        if (!force && this.accessToken && this.tokenExpiresAt === null) {
            return this.accessToken;
        }

        let payload: TotvsModaTokenResponse;
        try {
            payload = await totvsModaRequest<TotvsModaTokenResponse>(
                "POST",
                AUTH_TOKEN_PATH,
                {
                    formData: {
                        grant_type: "password",
                        client_id: clientId,
                        client_secret: clientSecret,
                        username,
                        password,
                    },
                    timeoutMs: 10_000,
                    operation: "authenticate",
                    reporter: this.reporter,
                },
            );
        } catch (exc) {
            if (exc instanceof TotvsModaResponseError) {
                logger.error(
                    "totvsmoda-client",
                    "Autenticação recusada pelo TOTVS Moda",
                    {
                        statusCode: exc.statusCode,
                        endpoint: exc.endpoint,
                        payload: JSON.stringify(exc.payload),
                        clientId: clientId
                            ? `${clientId.slice(0, 4)}…`
                            : undefined,
                        username,
                    },
                );
                throw new TotvsModaAuthError(
                    "TOTVS Moda recusou as credenciais configuradas.",
                    {
                        statusCode: exc.statusCode,
                        endpoint: exc.endpoint,
                        payload: exc.payload,
                    },
                );
            }
            throw exc;
        }
        const accessToken = trim(payload?.access_token);
        if (!accessToken) {
            throw new TotvsModaAuthError(
                "TOTVS Moda não retornou um access_token válido.",
                { payload },
            );
        }
        this.accessToken = accessToken;
        this.tokenExpiresAt = payload.expires_in
            ? Date.now() + payload.expires_in * 1000
            : null;
        return this.accessToken;
    }

    private async request<T>(
        method: string,
        path: string,
        operation: string,
        options: {
            jsonBody?: unknown;
            params?: Record<string, string | number | undefined>;
            timeoutMs?: number;
        } = {},
    ): Promise<T> {
        const token = await this.authenticate();
        return totvsModaRequest<T>(method, path, {
            token,
            operation,
            reporter: this.reporter,
            ...options,
        });
    }

    async listBranches(): Promise<Array<Record<string, unknown>>> {
        const payload = await this.request<{ items?: unknown }>(
            "GET",
            BRANCHES_LIST_PATH,
            "listBranches",
        );
        const items = payload?.items;
        if (!Array.isArray(items)) {
            throw new TotvsModaResponseError(
                "Lista de filiais em formato inválido.",
                { payload },
            );
        }
        return items.filter(
            (item): item is Record<string, unknown> =>
                !!item && typeof item === "object",
        );
    }

    // BranchOutDto: dados de uma única empresa por código interno ou CNPJ
    // (parâmetro de rota "branchId" aceita os dois). Devolve null em vez de
    // lançar quando a API responde 404 — "não encontrado" é um resultado
    // válido para uma busca por código/CNPJ, não uma falha do client.
    async getBranchByCode(
        branchIdOrCnpj: string,
    ): Promise<Record<string, unknown> | null> {
        try {
            return await this.request<Record<string, unknown>>(
                "GET",
                `${BRANCHES_PATH}/${encodeURIComponent(branchIdOrCnpj)}`,
                "getBranchByCode",
            );
        } catch (exc) {
            if (exc instanceof TotvsModaNotFoundError) return null;
            throw exc;
        }
    }

    // ProductInDto: filter (ProductFilterModel) + option (ReferenceOptionModel,
    // branchInfoCode obrigatório) — cada item devolvido é uma linha por SKU
    // (produto+cor+tamanho), não por referência; agrupar por ReferenceCode é
    // responsabilidade do mapper (ver groupTotvsModaProducts).
    async searchProducts(
        options: TotvsModaProductSearchOptions,
    ): Promise<TotvsModaSearchResponse<Record<string, unknown>>> {
        const payload = {
            filter: {
                change: options.updatedSince
                    ? {
                          startDate: options.updatedSince,
                          endDate: options.changedUntil,
                          inProduct: options.includeCatalogChanges || undefined,
                          inBranchInfo:
                              options.includeCatalogChanges || undefined,
                          branchInfoCodeList: options.includeCatalogChanges
                              ? [this.credentials.branchCode]
                              : undefined,
                          inPrice: options.includeCatalogChanges || undefined,
                          inPromotionalPrice:
                              options.includeCatalogChanges || undefined,
                          inScheduledPrice:
                              options.includeCatalogChanges || undefined,
                          inDigitalPromotionPrice:
                              options.includeCatalogChanges || undefined,
                          branchPriceCodeList: options.includeCatalogChanges
                              ? [this.credentials.branchCode]
                              : undefined,
                          priceCodeList: options.includeCatalogChanges
                              ? this.credentials.priceCodeList
                              : undefined,
                          inStock: options.includeCatalogChanges || undefined,
                          branchStockCodeList: options.includeCatalogChanges
                              ? [this.credentials.branchCode]
                              : undefined,
                          stockCodeList: options.includeCatalogChanges
                              ? this.credentials.stockCodeList
                              : undefined,
                          inBarCode: options.includeCatalogChanges || undefined,
                          inWebInfo: options.includeCatalogChanges || undefined,
                      }
                    : undefined,
                productCodeList: options.productCodeList,
                referenceCodeList: options.referenceCodeList,
                // Catálogo do TOTVS mistura produto acabado (vendável) com
                // matéria-prima/componente de ficha técnica sob o mesmo
                // endpoint. isFinishedProduct é campo de branchInfo
                // (ProductBranchInfoFilterModel), não da raiz de
                // ProductFilterModel -- ver docs/erp/totvsmoda/products.json,
                // schema ProductFilterModel.branchInfo. Este provider só
                // publica produto de venda, então filtra na origem em vez de
                // trazer e descartar depois.
                branchInfo: {
                    branchCode: this.credentials.branchCode,
                    isFinishedProduct: true,
                },
                classifications:
                    options.classificationTypeCode !== undefined &&
                    options.classificationCodes?.length
                        ? [
                              {
                                  type: options.classificationTypeCode,
                                  codeList: options.classificationCodes,
                              },
                          ]
                        : undefined,
            },
            option: { branchInfoCode: this.credentials.branchCode },
            page: options.page,
            pageSize: options.pageSize,
            order: options.order,
            expand: "classifications",
        };
        return this.searchAndValidate(
            "searchProducts",
            PRODUCTS_SEARCH_PATH,
            payload,
            "Busca de produtos retornou formato inválido.",
        );
    }

    // ProductPriceInDto: option.prices (PriceInfoModel[]) é obrigatório —
    // sempre escopado por filter.productCodeList para casar com a página de
    // produtos já buscada (evita paginar preço/saldo por conta própria).
    async searchProductPrices(
        productCodeList: number[],
    ): Promise<TotvsModaSearchResponse<Record<string, unknown>>> {
        const payload = {
            filter: { productCodeList },
            option: {
                prices: [
                    {
                        branchCode: this.credentials.branchCode,
                        priceCodeList: this.credentials.priceCodeList,
                    },
                ],
            },
            page: 1,
            pageSize: 1000,
        };
        return this.searchAndValidate(
            "searchProductPrices",
            PRODUCT_PRICES_SEARCH_PATH,
            payload,
            "Busca de preços retornou formato inválido.",
        );
    }

    // CompositionGroupProductInDto (GET, ReferenceCodeList na query): nível de
    // grupo ("composição por grupo") — este tenant usa esse modo, não o de
    // composição por produto (ver docs/erp/totvsmoda/products.json). Uma
    // referência só, não uma lista batch, porque hoje só é chamado sob
    // demanda (catalogSyncService.syncReferenceOnDemand), nunca no sync
    // periódico em lote.
    async searchCompositionGroupProducts(
        referenceCode: string,
    ): Promise<TotvsModaSearchResponse<Record<string, unknown>>> {
        return this.getAndValidate(
            "searchCompositionGroupProducts",
            COMPOSITION_GROUP_PRODUCT_PATH,
            { ReferenceCodeList: referenceCode },
            "Busca de composição retornou formato inválido.",
        );
    }

    // ProductBalanceInDto: option.balances (BalanceInfoModel[]) é obrigatório.
    async searchProductBalances(
        productCodeList: number[],
    ): Promise<TotvsModaSearchResponse<Record<string, unknown>>> {
        const payload = {
            filter: { productCodeList },
            option: {
                balances: [
                    {
                        branchCode: this.credentials.branchCode,
                        stockCodeList: this.credentials.stockCodeList,
                    },
                ],
            },
            page: 1,
            pageSize: 1000,
        };
        return this.searchAndValidate(
            "searchProductBalances",
            PRODUCT_BALANCES_SEARCH_PATH,
            payload,
            "Busca de saldos retornou formato inválido.",
        );
    }

    async searchOrders(
        payload: TotvsModaSearchPayload,
    ): Promise<TotvsModaSearchResponse<Record<string, unknown>>> {
        return this.searchAndValidate(
            "searchOrders",
            SALES_ORDER_SEARCH_PATH,
            payload,
            "Busca de pedidos retornou formato inválido.",
        );
    }

    // POST b2c-orders (OrderInDto -> 201 OrderOutDto): cria um pedido de
    // venda. orderCode (o id que o TOTVS atribui) precisa vir preenchido —
    // sem ele não há "id do ERP" nenhum pra guardar, então uma resposta 201
    // sem orderCode é tratada como formato inválido, não como sucesso.
    async createB2COrder(
        payload: TotvsModaOrderInput,
    ): Promise<TotvsModaOrderOutput> {
        const result = await this.request<TotvsModaOrderOutput>(
            "POST",
            B2C_ORDERS_PATH,
            "createB2COrder",
            { jsonBody: payload },
        ).catch((exc) => {
            throw toOrderRequestError(exc);
        });
        if (
            !result ||
            typeof result !== "object" ||
            result.orderCode === undefined ||
            result.orderCode === null
        ) {
            throw new TotvsModaResponseError(
                "TOTVS Moda não retornou orderCode ao criar o pedido.",
                { payload: result },
            );
        }
        return result;
    }

    // POST orders/cancel (CancelOrderInDto -> 200 SuccessProcessingModel).
    // A doc avisa: "Somente os pedidos que ainda não foram aceitos na
    // retaguarda podem ser cancelados" -- um 400 aqui vira
    // TotvsModaOrderRejectedError (ver toOrderRequestError), não uma falha
    // passageira.
    async cancelOrder(payload: TotvsModaCancelOrderInput): Promise<void> {
        await this.request<unknown>("POST", ORDERS_CANCEL_PATH, "cancelOrder", {
            jsonBody: payload,
        }).catch((exc) => {
            throw toOrderRequestError(exc);
        });
    }

    // IndividualSearchInDto: filter.cpfList busca pessoas físicas por CPF —
    // é o que sustenta a busca de cliente por documento (ver
    // index.ts:findTotvsModaClientByDocument). expand "addresses,emails" traz
    // o que o mapper precisa para preencher Client (ver mapper.ts).
    async searchIndividuals(
        options: TotvsModaIndividualSearchOptions,
    ): Promise<TotvsModaSearchResponse<Record<string, unknown>>> {
        const payload = {
            filter: {
                change: options.updatedSince
                    ? { startDate: options.updatedSince }
                    : undefined,
                cpfList: options.cpfList,
            },
            page: options.page,
            pageSize: options.pageSize,
            expand: "addresses,emails",
        };
        return this.searchAndValidate(
            "searchIndividuals",
            INDIVIDUALS_SEARCH_PATH,
            payload,
            "Busca de pessoas físicas retornou formato inválido.",
            25_000,
        );
    }

    // LegalEntitySearchInDto: filter.cnpjList busca pessoas jurídicas por
    // CNPJ, mesmo papel de searchIndividuals só que para PJ.
    async searchLegalEntities(
        options: TotvsModaLegalEntitySearchOptions,
    ): Promise<TotvsModaSearchResponse<Record<string, unknown>>> {
        const payload = {
            filter: {
                change: options.updatedSince
                    ? { startDate: options.updatedSince }
                    : undefined,
                cnpjList: options.cnpjList,
            },
            page: options.page,
            pageSize: options.pageSize,
            expand: "addresses,emails",
        };
        return this.searchAndValidate(
            "searchLegalEntities",
            LEGAL_ENTITIES_SEARCH_PATH,
            payload,
            "Busca de pessoas jurídicas retornou formato inválido.",
            25_000,
        );
    }

    // Busca do próprio registro com expand "relateds" (RelatedModel) à parte
    // de searchIndividuals (que nunca pede esse expand — ver mapper.ts) —
    // filter de um único cpf, page 1/pageSize 1, só pra não pesar o sync em
    // lote com um dado que só a tela de grupo comercial usa. Extração de
    // ".relateds" do primeiro item fica em index.ts, junto com os outros
    // casts para os tipos de mapper.ts.
    async searchIndividualRelateds(
        cpf: string,
    ): Promise<TotvsModaSearchResponse<Record<string, unknown>>> {
        const payload = {
            filter: { cpfList: [cpf] },
            page: 1,
            pageSize: 1,
            expand: "relateds",
        };
        return this.searchAndValidate(
            "searchIndividualRelateds",
            INDIVIDUALS_SEARCH_PATH,
            payload,
            "Busca de coligados (pessoa física) retornou formato inválido.",
        );
    }

    // Mesmo papel de searchIndividualRelateds, para pessoa jurídica.
    async searchLegalEntityRelateds(
        cnpj: string,
    ): Promise<TotvsModaSearchResponse<Record<string, unknown>>> {
        const payload = {
            filter: { cnpjList: [cnpj] },
            page: 1,
            pageSize: 1,
            expand: "relateds",
        };
        return this.searchAndValidate(
            "searchLegalEntityRelateds",
            LEGAL_ENTITIES_SEARCH_PATH,
            payload,
            "Busca de coligados (pessoa jurídica) retornou formato inválido.",
        );
    }

    // RepresentativeSearchInDto — ainda não tem consumidor no provider (não
    // existe conceito de "representante" no domínio interno hoje), exposto
    // para uso futuro direto via TotvsModaClient.
    async searchRepresentatives(
        options: TotvsModaRepresentativeSearchOptions,
    ): Promise<TotvsModaSearchResponse<Record<string, unknown>>> {
        const payload = {
            filter: { cpfCnpjList: options.cpfCnpjList },
            page: options.page,
            pageSize: options.pageSize,
        };
        return this.searchAndValidate(
            "searchRepresentatives",
            REPRESENTATIVES_SEARCH_PATH,
            payload,
            "Busca de representantes retornou formato inválido.",
        );
    }

    // ClassificationsResponseModel: tipos e valores de classificação
    // configurados no tenant (PESFL031) — referência para resolver
    // ClassificationModel.typeCode/typeName com precisão, hoje só usado por
    // heurística em mapper.ts:findClassification.
    async listClassifications(
        page = 1,
        pageSize = 1000,
    ): Promise<TotvsModaSearchResponse<Record<string, unknown>>> {
        return this.getAndValidate(
            "listClassifications",
            CLASSIFICATIONS_PATH,
            { Page: page, PageSize: pageSize },
            "Consulta de classificações retornou formato inválido.",
        );
    }

    async listEmailTypes(
        page = 1,
        pageSize = 1000,
    ): Promise<TotvsModaSearchResponse<Record<string, unknown>>> {
        return this.getAndValidate(
            "listEmailTypes",
            EMAIL_TYPES_PATH,
            { Page: page, PageSize: pageSize },
            "Consulta de tipos de e-mail retornou formato inválido.",
        );
    }

    async listPhoneTypes(
        page = 1,
        pageSize = 1000,
    ): Promise<TotvsModaSearchResponse<Record<string, unknown>>> {
        return this.getAndValidate(
            "listPhoneTypes",
            PHONE_TYPES_PATH,
            { Page: page, PageSize: pageSize },
            "Consulta de tipos de telefone retornou formato inválido.",
        );
    }

    // PersonStatisticsResponseModel não segue o envelope items[] dos demais
    // endpoints — é um objeto único de estatísticas para o cliente informado
    // (por código interno ou CPF/CNPJ), por isso não passa por
    // searchAndValidate/getAndValidate.
    async getPersonStatistics(params: {
        customerCpfCnpj?: string;
        customerCode?: number;
    }): Promise<Record<string, unknown>> {
        return this.request<Record<string, unknown>>(
            "GET",
            PERSON_STATISTICS_PATH,
            "getPersonStatistics",
            {
                params: {
                    CustomerCpfCnpj: params.customerCpfCnpj,
                    CustomerCode: params.customerCode,
                },
            },
        );
    }

    private async searchAndValidate(
        operation: string,
        path: string,
        payload: unknown,
        invalidMessage: string,
        timeoutMs?: number,
    ): Promise<TotvsModaSearchResponse<Record<string, unknown>>> {
        const result = await this.request<Record<string, unknown>>(
            "POST",
            path,
            operation,
            { jsonBody: payload, timeoutMs },
        );
        return this.toSearchResponse(result, invalidMessage);
    }

    private async getAndValidate(
        operation: string,
        path: string,
        params: Record<string, string | number | undefined>,
        invalidMessage: string,
    ): Promise<TotvsModaSearchResponse<Record<string, unknown>>> {
        const result = await this.request<Record<string, unknown>>(
            "GET",
            path,
            operation,
            { params },
        );
        return this.toSearchResponse(result, invalidMessage);
    }

    private toSearchResponse(
        result: Record<string, unknown>,
        invalidMessage: string,
    ): TotvsModaSearchResponse<Record<string, unknown>> {
        const items = result?.items;
        if (!result || typeof result !== "object" || !Array.isArray(items)) {
            throw new TotvsModaResponseError(invalidMessage, {
                payload: result,
            });
        }
        return {
            items: items.filter(
                (item): item is Record<string, unknown> =>
                    !!item && typeof item === "object",
            ),
            hasNext:
                typeof result.hasNext === "boolean"
                    ? result.hasNext
                    : undefined,
            totalItems:
                typeof result.totalItems === "number"
                    ? result.totalItems
                    : undefined,
        };
    }
}
