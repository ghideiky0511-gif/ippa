// Cliente de recursos do TOTVS Moda — porta client.py. Conhece autenticação,
// endpoints e envelopes externos; não conhece tenant nem banco (o cache de
// token do Python vivia em Postgres por tenant, aqui vira só um campo em
// memória da instância, já que cada ErpProvider é criado por credenciais).
//
// O envelope de request/response de product/v2/products/search, prices/search,
// balances/search, e dos endpoints person/v2 abaixo (individuals/search,
// legal-entities/search, representatives/search, classifications, email-types,
// phone-types) segue o contrato documentado em docs/products.json e
// docs/person.json (OpenAPI oficial do TOTVS Moda) — não é um guess.
// Orders (sales-order/v2) ainda não tem documentação equivalente disponível:
// segue o mesmo formato de envelope por consistência com os endpoints
// documentados, mas os nomes de campo do payload propriamente dito (ver
// mapper.ts) continuam best-effort. person-statistics não segue o envelope
// count/totalPages/hasNext/totalItems/items — devolve um objeto único, por
// isso tem seu próprio método (getPersonStatistics) fora de searchAndValidate.

import type { ExternalApiCallReporter } from "@/lib/externalApiCall";
import { TotvsModaAuthError, TotvsModaNotFoundError, TotvsModaResponseError } from "./errors";
import {
    AUTH_TOKEN_PATH,
    BRANCHES_LIST_PATH,
    BRANCHES_PATH,
    CLASSIFICATIONS_PATH,
    EMAIL_TYPES_PATH,
    INDIVIDUALS_SEARCH_PATH,
    LEGAL_ENTITIES_SEARCH_PATH,
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
    productCodeList?: number[];
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

function trim(value: unknown): string {
    return String(value ?? "").trim();
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
            throw new TotvsModaAuthError("Credenciais do TOTVS Moda não estão totalmente configuradas.");
        }
        if (!force && this.accessToken && this.tokenExpiresAt !== null && Date.now() + TOKEN_SAFETY_MS < this.tokenExpiresAt) {
            return this.accessToken;
        }
        if (!force && this.accessToken && this.tokenExpiresAt === null) {
            return this.accessToken;
        }

        let payload: TotvsModaTokenResponse;
        try {
            payload = await totvsModaRequest<TotvsModaTokenResponse>("POST", AUTH_TOKEN_PATH, {
                formData: { grant_type: "password", clientId, clientSecret, username, password },
                timeoutMs: 10_000,
                operation: "authenticate",
                reporter: this.reporter,
            });
        } catch (exc) {
            if (exc instanceof TotvsModaResponseError) {
                throw new TotvsModaAuthError("TOTVS Moda recusou as credenciais configuradas.", {
                    statusCode: exc.statusCode,
                    endpoint: exc.endpoint,
                    payload: exc.payload,
                });
            }
            throw exc;
        }
        const accessToken = trim(payload?.access_token);
        if (!accessToken) {
            throw new TotvsModaAuthError("TOTVS Moda não retornou um access_token válido.", { payload });
        }
        this.accessToken = accessToken;
        this.tokenExpiresAt = payload.expires_in ? Date.now() + payload.expires_in * 1000 : null;
        return this.accessToken;
    }

    private async request<T>(
        method: string,
        path: string,
        operation: string,
        options: { jsonBody?: unknown; params?: Record<string, string | number | undefined>; timeoutMs?: number } = {},
    ): Promise<T> {
        const token = await this.authenticate();
        return totvsModaRequest<T>(method, path, { token, operation, reporter: this.reporter, ...options });
    }

    async listBranches(): Promise<Array<Record<string, unknown>>> {
        const payload = await this.request<{ items?: unknown }>("GET", BRANCHES_LIST_PATH, "listBranches");
        const items = payload?.items;
        if (!Array.isArray(items)) {
            throw new TotvsModaResponseError("Lista de filiais em formato inválido.", { payload });
        }
        return items.filter((item): item is Record<string, unknown> => !!item && typeof item === "object");
    }

    // BranchOutDto: dados de uma única empresa por código interno ou CNPJ
    // (parâmetro de rota "branchId" aceita os dois). Devolve null em vez de
    // lançar quando a API responde 404 — "não encontrado" é um resultado
    // válido para uma busca por código/CNPJ, não uma falha do client.
    async getBranchByCode(branchIdOrCnpj: string): Promise<Record<string, unknown> | null> {
        try {
            return await this.request<Record<string, unknown>>(
                "GET", `${BRANCHES_PATH}/${encodeURIComponent(branchIdOrCnpj)}`, "getBranchByCode",
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
    async searchProducts(options: TotvsModaProductSearchOptions): Promise<TotvsModaSearchResponse<Record<string, unknown>>> {
        const payload = {
            filter: {
                change: options.updatedSince ? { startDate: options.updatedSince } : undefined,
                productCodeList: options.productCodeList,
            },
            option: { branchInfoCode: this.credentials.branchCode },
            page: options.page,
            pageSize: options.pageSize,
            expand: "classifications",
        };
        return this.searchAndValidate("searchProducts", PRODUCTS_SEARCH_PATH, payload, "Busca de produtos retornou formato inválido.");
    }

    // ProductPriceInDto: option.prices (PriceInfoModel[]) é obrigatório —
    // sempre escopado por filter.productCodeList para casar com a página de
    // produtos já buscada (evita paginar preço/saldo por conta própria).
    async searchProductPrices(productCodeList: number[]): Promise<TotvsModaSearchResponse<Record<string, unknown>>> {
        const payload = {
            filter: { productCodeList },
            option: { prices: [{ branchCode: this.credentials.branchCode, priceCodeList: this.credentials.priceCodeList }] },
            page: 1,
            pageSize: 1000,
        };
        return this.searchAndValidate("searchProductPrices", PRODUCT_PRICES_SEARCH_PATH, payload, "Busca de preços retornou formato inválido.");
    }

    // ProductBalanceInDto: option.balances (BalanceInfoModel[]) é obrigatório.
    async searchProductBalances(productCodeList: number[]): Promise<TotvsModaSearchResponse<Record<string, unknown>>> {
        const payload = {
            filter: { productCodeList },
            option: { balances: [{ branchCode: this.credentials.branchCode, stockCodeList: this.credentials.stockCodeList }] },
            page: 1,
            pageSize: 1000,
        };
        return this.searchAndValidate("searchProductBalances", PRODUCT_BALANCES_SEARCH_PATH, payload, "Busca de saldos retornou formato inválido.");
    }

    async searchOrders(payload: TotvsModaSearchPayload): Promise<TotvsModaSearchResponse<Record<string, unknown>>> {
        return this.searchAndValidate("searchOrders", SALES_ORDER_SEARCH_PATH, payload, "Busca de pedidos retornou formato inválido.");
    }

    // IndividualSearchInDto: filter.cpfList busca pessoas físicas por CPF —
    // é o que sustenta a busca de cliente por documento (ver
    // index.ts:findTotvsModaClientByDocument). expand "addresses,emails" traz
    // o que o mapper precisa para preencher Client (ver mapper.ts).
    async searchIndividuals(options: TotvsModaIndividualSearchOptions): Promise<TotvsModaSearchResponse<Record<string, unknown>>> {
        const payload = {
            filter: {
                change: options.updatedSince ? { startDate: options.updatedSince } : undefined,
                cpfList: options.cpfList,
            },
            page: options.page,
            pageSize: options.pageSize,
            expand: "addresses,emails",
        };
        return this.searchAndValidate("searchIndividuals", INDIVIDUALS_SEARCH_PATH, payload, "Busca de pessoas físicas retornou formato inválido.", 25_000);
    }

    // LegalEntitySearchInDto: filter.cnpjList busca pessoas jurídicas por
    // CNPJ, mesmo papel de searchIndividuals só que para PJ.
    async searchLegalEntities(options: TotvsModaLegalEntitySearchOptions): Promise<TotvsModaSearchResponse<Record<string, unknown>>> {
        const payload = {
            filter: {
                change: options.updatedSince ? { startDate: options.updatedSince } : undefined,
                cnpjList: options.cnpjList,
            },
            page: options.page,
            pageSize: options.pageSize,
            expand: "addresses,emails",
        };
        return this.searchAndValidate("searchLegalEntities", LEGAL_ENTITIES_SEARCH_PATH, payload, "Busca de pessoas jurídicas retornou formato inválido.", 25_000);
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
        return this.searchAndValidate("searchRepresentatives", REPRESENTATIVES_SEARCH_PATH, payload, "Busca de representantes retornou formato inválido.");
    }

    // ClassificationsResponseModel: tipos e valores de classificação
    // configurados no tenant (PESFL031) — referência para resolver
    // ClassificationModel.typeCode/typeName com precisão, hoje só usado por
    // heurística em mapper.ts:findClassification.
    async listClassifications(page = 1, pageSize = 1000): Promise<TotvsModaSearchResponse<Record<string, unknown>>> {
        return this.getAndValidate("listClassifications", CLASSIFICATIONS_PATH, { Page: page, PageSize: pageSize }, "Consulta de classificações retornou formato inválido.");
    }

    async listEmailTypes(page = 1, pageSize = 1000): Promise<TotvsModaSearchResponse<Record<string, unknown>>> {
        return this.getAndValidate("listEmailTypes", EMAIL_TYPES_PATH, { Page: page, PageSize: pageSize }, "Consulta de tipos de e-mail retornou formato inválido.");
    }

    async listPhoneTypes(page = 1, pageSize = 1000): Promise<TotvsModaSearchResponse<Record<string, unknown>>> {
        return this.getAndValidate("listPhoneTypes", PHONE_TYPES_PATH, { Page: page, PageSize: pageSize }, "Consulta de tipos de telefone retornou formato inválido.");
    }

    // PersonStatisticsResponseModel não segue o envelope items[] dos demais
    // endpoints — é um objeto único de estatísticas para o cliente informado
    // (por código interno ou CPF/CNPJ), por isso não passa por
    // searchAndValidate/getAndValidate.
    async getPersonStatistics(params: { customerCpfCnpj?: string; customerCode?: number }): Promise<Record<string, unknown>> {
        return this.request<Record<string, unknown>>("GET", PERSON_STATISTICS_PATH, "getPersonStatistics", {
            params: { CustomerCpfCnpj: params.customerCpfCnpj, CustomerCode: params.customerCode },
        });
    }

    private async searchAndValidate(
        operation: string,
        path: string,
        payload: unknown,
        invalidMessage: string,
        timeoutMs?: number,
    ): Promise<TotvsModaSearchResponse<Record<string, unknown>>> {
        const result = await this.request<Record<string, unknown>>("POST", path, operation, { jsonBody: payload, timeoutMs });
        return this.toSearchResponse(result, invalidMessage);
    }

    private async getAndValidate(
        operation: string,
        path: string,
        params: Record<string, string | number | undefined>,
        invalidMessage: string,
    ): Promise<TotvsModaSearchResponse<Record<string, unknown>>> {
        const result = await this.request<Record<string, unknown>>("GET", path, operation, { params });
        return this.toSearchResponse(result, invalidMessage);
    }

    private toSearchResponse(result: Record<string, unknown>, invalidMessage: string): TotvsModaSearchResponse<Record<string, unknown>> {
        const items = result?.items;
        if (!result || typeof result !== "object" || !Array.isArray(items)) {
            throw new TotvsModaResponseError(invalidMessage, { payload: result });
        }
        return {
            items: items.filter((item): item is Record<string, unknown> => !!item && typeof item === "object"),
            hasNext: typeof result.hasNext === "boolean" ? result.hasNext : undefined,
            totalItems: typeof result.totalItems === "number" ? result.totalItems : undefined,
        };
    }
}
