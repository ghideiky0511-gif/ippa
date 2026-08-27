import type { ExternalApiCallReporter } from "@/lib/externalApiCall";
import { documentDigits } from "@/contracts/shared";
import type {
    ErpFetchOptions,
    ErpFetchResult,
    ErpOrderPushContext,
    ErpPriceSnapshot,
    ErpProvider,
    ErpProviderCredentials,
    ErpStockSnapshot,
} from "../../types";
import {
    TotvsModaClient,
    type TotvsModaCredentials,
    type TotvsModaSearchPayload,
} from "./client";
import { TotvsModaAuthError } from "./errors";
import {
    groupTotvsModaProducts,
    mapTotvsModaCompositions,
    mapTotvsModaReferenceSnapshot,
    mapCancelOrderInput,
    mapOrderToTotvsModaOrderInDto,
    mapTotvsModaCompany,
    mapTotvsModaIndividualClient,
    mapTotvsModaLegalEntityClient,
    mapTotvsModaOrder,
    referenceCodeOfTotvsModaProduct,
    type TotvsModaBalanceRow,
    type TotvsModaBranch,
    type TotvsModaCompositionGroupRow,
    type TotvsModaIndividual,
    type TotvsModaLegalEntity,
    type TotvsModaOrder,
    type TotvsModaPriceRow,
    type TotvsModaProductRow,
    type TotvsModaRelated,
} from "./mapper";

const PAGE_SIZE = 100;
// Era 1000 -- páginas desse tamanho (produtos com expand de classificação/
// preço/saldo, ou centenas de códigos num searchProductPrices/Balances de
// uma vez) estavam estourando TOTVS_MODA_DEFAULT_TIMEOUT_MS (20s) do lado do
// TOTVS. Lotes menores trocam mais chamadas por chamadas mais rápidas.
const CATALOG_PAGE_SIZE = 200;

function chunks<T>(items: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
    return result;
}

function trim(value: unknown): string {
    return String(value ?? "").trim();
}

function toNumberArray(value: unknown): number[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item));
}

function toOptionalNumber(value: unknown): number | undefined {
    if (value === undefined || value === null || value === "") return undefined;
    const num = Number(value);
    return Number.isFinite(num) ? num : undefined;
}

function normalizeCredentials(
    credentials: ErpProviderCredentials,
): TotvsModaCredentials {
    const clientId = trim(credentials.clientId ?? credentials.client_id);
    const clientSecret = trim(
        credentials.clientSecret ?? credentials.client_secret,
    );
    const username = trim(credentials.username);
    const password = trim(credentials.password);
    const branchCode = Number(
        credentials.branchCode ?? credentials.branch_code,
    );
    const priceCodeList = toNumberArray(
        credentials.priceCodeList ?? credentials.price_code_list,
    );
    const stockCodeList = toNumberArray(
        credentials.stockCodeList ?? credentials.stock_code_list,
    );
    if (!clientId || !clientSecret || !username || !password) {
        throw new TotvsModaAuthError(
            "Credenciais do TOTVS Moda não estão totalmente configuradas.",
        );
    }
    if (
        !Number.isFinite(branchCode) ||
        priceCodeList.length === 0 ||
        stockCodeList.length === 0
    ) {
        throw new TotvsModaAuthError(
            "Configuração do TOTVS Moda incompleta: branchCode, priceCodeList e stockCodeList são obrigatórios para consultar produtos.",
        );
    }
    // Os campos abaixo (parâmetros de negócio de envio/cancelamento de
    // pedido) não são validados aqui de propósito: só passam a ser
    // obrigatórios quando o tenant usa essa capacidade específica (ver
    // mapOrderToTotvsModaOrderInDto/mapCancelOrderInput em mapper.ts), não
    // para as demais operações deste provider.
    return {
        clientId,
        clientSecret,
        username,
        password,
        branchCode,
        priceCodeList,
        stockCodeList,
        defaultDiscountTypeCode: toOptionalNumber(credentials.defaultDiscountTypeCode ?? credentials.default_discount_type_code),
        defaultOperationCode: toOptionalNumber(credentials.defaultOperationCode ?? credentials.default_operation_code),
        defaultPaymentConditionCode: toOptionalNumber(credentials.defaultPaymentConditionCode ?? credentials.default_payment_condition_code),
        defaultPriorityCode: toOptionalNumber(credentials.defaultPriorityCode ?? credentials.default_priority_code),
        representativeCode: toOptionalNumber(credentials.representativeCode ?? credentials.representative_code),
        representativeCpfCnpj: trim(credentials.representativeCpfCnpj ?? credentials.representative_cpf_cnpj) || undefined,
        defaultReasonCancellationCode: toOptionalNumber(credentials.defaultReasonCancellationCode ?? credentials.default_reason_cancellation_code),
    };
}

function pageFromCursor(cursor: string | undefined): number {
    const page = cursor ? Number(cursor) : 1;
    return Number.isFinite(page) && page > 0 ? page : 1;
}

function searchPayload(
    options: ErpFetchOptions | undefined,
    page: number,
): TotvsModaSearchPayload {
    return {
        page,
        pageSize: PAGE_SIZE,
        updatedSince: options?.updatedSince?.toISOString(),
    };
}

// getClients precisa varrer duas fontes independentes do TOTVS Moda (pessoa
// física via individuals/search e pessoa jurídica via legal-entities/search)
// através do único cursor de string do ErpFetchOptions. O cursor codifica a
// fase e a página ("individuals:3", "legalEntities:1"): esgota todas as
// páginas de pessoa física antes de passar para pessoa jurídica.
type ClientSearchPhase = "individuals" | "legalEntities";

function parseClientCursor(cursor: string | undefined): {
    phase: ClientSearchPhase;
    page: number;
} {
    const [phase, pageStr] = (cursor ?? "").split(":");
    const page = Number(pageStr);
    return {
        phase: phase === "legalEntities" ? "legalEntities" : "individuals",
        page: Number.isFinite(page) && page > 0 ? page : 1,
    };
}

function buildClientCursor(phase: ClientSearchPhase, page: number): string {
    return `${phase}:${page}`;
}

function onlyDigits(value: string): string {
    return value.replace(/\D/g, "");
}

// Um coligado só é útil pra vínculo de grupo comercial se tiver documento —
// sem CPF/CNPJ não dá pra rodar findOrImportTenantClientByDocument por ele
// depois (ver commercialGroupMemberService.addCommercialGroupMember).
// Documento normalizado pro mesmo formato (só dígitos) que o resto do
// sistema usa (clients.cpf_cnpj), em vez do que a TOTVS devolver cru.
function toRelatedParty(raw: TotvsModaRelated): { cpfCnpj: string; name: string } | null {
    const cpfCnpj = documentDigits(trim(raw.cpfCnpj));
    const name = trim(raw.name);
    if (!cpfCnpj || !name) return null;
    if (cpfCnpj.length !== 11 && cpfCnpj.length !== 14) return null;
    return { cpfCnpj, name };
}

// Provider real: autentica e consome a API do TOTVS Moda via TotvsModaClient,
// devolvendo os dados já adequados ao formato interno (ver mapper.ts) — o
// mesmo contrato ErpProvider que providers/mock implementa com fixtures.
export function createTotvsModaErpProvider(
    credentials: ErpProviderCredentials,
    reporter?: ExternalApiCallReporter,
): ErpProvider {
    const normalized = normalizeCredentials(credentials);
    const client = new TotvsModaClient(normalized, reporter);

    return {
        code: "totvsmoda",

        async discoverProductChanges(window, cursor) {
            const page = pageFromCursor(cursor);
            const result = await client.searchProducts({
                page,
                pageSize: CATALOG_PAGE_SIZE,
                updatedSince: window.startDate?.toISOString(),
                changedUntil: window.endDate?.toISOString(),
                includeCatalogChanges: Boolean(window.startDate),
                order: window.startDate
                    ? "maxChangeFilterDate,referenceCode,productCode"
                    : "referenceCode,colorCode,productSize,productCode",
                classificationTypeCode: window.classificationTypeCode,
                classificationCodes: window.classificationCodes,
            });
            const referenceCodes = Array.from(new Set(
                (result.items as TotvsModaProductRow[])
                    .map(referenceCodeOfTotvsModaProduct)
                    .filter(Boolean),
            ));
            return {
                referenceCodes,
                nextCursor: result.hasNext ? String(page + 1) : undefined,
            };
        },

        async fetchReference(referenceCode) {
            const rows: TotvsModaProductRow[] = [];
            let page = 1;
            while (true) {
                const result = await client.searchProducts({
                    page,
                    pageSize: CATALOG_PAGE_SIZE,
                    referenceCodeList: [referenceCode],
                    order: "referenceCode,colorCode,productSize,productCode",
                });
                rows.push(...result.items as TotvsModaProductRow[]);
                if (!result.hasNext) break;
                page += 1;
            }
            return mapTotvsModaReferenceSnapshot(rows);
        },

        async fetchCompositions(referenceCode) {
            const result = await client.searchCompositionGroupProducts(referenceCode);
            return mapTotvsModaCompositions(result.items as TotvsModaCompositionGroupRow[]);
        },

        async fetchPrices(productCodes): Promise<ErpPriceSnapshot[]> {
            const result: ErpPriceSnapshot[] = [];
            const numericCodes = productCodes.map(Number).filter(Number.isFinite);
            for (const batch of chunks(numericCodes, CATALOG_PAGE_SIZE)) {
                const response = await client.searchProductPrices(batch);
                for (const row of response.items as TotvsModaPriceRow[]) {
                    if (row.productCode === undefined) continue;
                    const selected = normalized.priceCodeList
                        .map((code) => row.prices?.find((price) => price.priceCode === code))
                        .find(Boolean) ?? row.prices?.[0];
                    const price = selected?.promotionalPrice ?? selected?.price;
                    if (price === undefined || !Number.isFinite(price)) continue;
                    result.push({ skuExternalId: String(row.productCode), price });
                }
            }
            return result;
        },

        async fetchStock(productCodes): Promise<ErpStockSnapshot[]> {
            const result: ErpStockSnapshot[] = [];
            const numericCodes = productCodes.map(Number).filter(Number.isFinite);
            for (const batch of chunks(numericCodes, CATALOG_PAGE_SIZE)) {
                const response = await client.searchProductBalances(batch);
                for (const row of response.items as TotvsModaBalanceRow[]) {
                    if (row.productCode === undefined) continue;
                    for (const stockCode of normalized.stockCodeList) {
                        const balance = row.balances?.find((candidate) =>
                            candidate.stockCode === stockCode
                            && (candidate.branchCode ?? normalized.branchCode) === normalized.branchCode,
                        );
                        const branchCode = balance?.branchCode ?? normalized.branchCode;
                        result.push({
                            skuExternalId: String(row.productCode),
                            locationExternalId: `${branchCode}:${stockCode}`,
                            locationName: `Filial ${branchCode} / estoque ${stockCode}`,
                            quantity: Number.isFinite(balance?.stock) ? Number(balance?.stock) : 0,
                        });
                    }
                }
            }
            return result;
        },

        async getProducts(
            options?: ErpFetchOptions,
        ): Promise<
            ErpFetchResult<
                ReturnType<typeof groupTotvsModaProducts>[number]["data"]
            >
        > {
            const page = pageFromCursor(options?.cursor);
            const result = await client.searchProducts({
                page,
                pageSize: PAGE_SIZE,
                updatedSince: options?.updatedSince?.toISOString(),
            });
            const rows = result.items as TotvsModaProductRow[];
            const productCodeList = Array.from(
                new Set(
                    rows
                        .map((row) => row.productCode)
                        .filter((code): code is number => code !== undefined),
                ),
            );

            let priceRows: TotvsModaPriceRow[] = [];
            let balanceRows: TotvsModaBalanceRow[] = [];
            if (productCodeList.length > 0) {
                const [prices, balances] = await Promise.all([
                    client.searchProductPrices(productCodeList),
                    client.searchProductBalances(productCodeList),
                ]);
                priceRows = prices.items as TotvsModaPriceRow[];
                balanceRows = balances.items as TotvsModaBalanceRow[];
            }

            return {
                items: groupTotvsModaProducts(rows, priceRows, balanceRows),
                nextCursor: result.hasNext ? String(page + 1) : undefined,
            };
        },

        async getOrders(
            options?: ErpFetchOptions,
        ): Promise<ErpFetchResult<ReturnType<typeof mapTotvsModaOrder>>> {
            const page = pageFromCursor(options?.cursor);
            const result = await client.searchOrders(
                searchPayload(options, page),
            );
            return {
                items: result.items.map((raw) => ({
                    externalId: trim(raw.orderNumber),
                    data: mapTotvsModaOrder(raw as TotvsModaOrder),
                })),
                nextCursor: result.hasNext ? String(page + 1) : undefined,
            };
        },

        async getClients(
            options?: ErpFetchOptions,
        ): Promise<
            ErpFetchResult<
                | ReturnType<typeof mapTotvsModaIndividualClient>
                | ReturnType<typeof mapTotvsModaLegalEntityClient>
            >
        > {
            const { phase, page } = parseClientCursor(options?.cursor);
            const updatedSince = options?.updatedSince?.toISOString();

            if (phase === "individuals") {
                const result = await client.searchIndividuals({
                    page,
                    pageSize: PAGE_SIZE,
                    updatedSince,
                });
                return {
                    items: result.items.map((raw) => {
                        const individual = raw as TotvsModaIndividual;
                        return {
                            externalId: trim(individual.cpf ?? individual.code),
                            data: mapTotvsModaIndividualClient(individual),
                        };
                    }),
                    nextCursor: result.hasNext
                        ? buildClientCursor("individuals", page + 1)
                        : buildClientCursor("legalEntities", 1),
                };
            }

            const result = await client.searchLegalEntities({
                page,
                pageSize: PAGE_SIZE,
                updatedSince,
            });
            return {
                items: result.items.map((raw) => {
                    const legalEntity = raw as TotvsModaLegalEntity;
                    return {
                        externalId: trim(legalEntity.cnpj ?? legalEntity.code),
                        data: mapTotvsModaLegalEntityClient(legalEntity),
                    };
                }),
                nextCursor: result.hasNext
                    ? buildClientCursor("legalEntities", page + 1)
                    : undefined,
            };
        },

        async getCompanies(): Promise<
            ErpFetchResult<ReturnType<typeof mapTotvsModaCompany>>
        > {
            const branches = await client.listBranches();
            return {
                items: branches.map((raw) => ({
                    externalId: trim(raw.code ?? raw.cnpj),
                    data: mapTotvsModaCompany(raw as TotvsModaBranch),
                })),
            };
        },

        // Exercita autenticação + uma leitura real (mesma ideia do app de
        // referência, que usa a busca de filiais como teste de conexão
        // implícito) — não lança, converte qualquer falha em { ok: false }.
        async testConnection() {
            try {
                await client.listBranches();
                return { ok: true };
            } catch (exc) {
                return {
                    ok: false,
                    message:
                        exc instanceof Error
                            ? exc.message
                            : "Falha ao conectar ao TOTVS Moda.",
                };
            }
        },

        // Busca pontual por CPF ou CNPJ exato (individuals/search ou
        // legal-entities/search com filter de um único documento, conforme o
        // tamanho) — sem paginar a base inteira como getClients faz para sync
        // em lote. externalId usa o mesmo campo (cpf/cnpj cru da API) que
        // getClients usaria para essa mesma pessoa, para que um sync em lote
        // posterior reconheça o registro já importado em vez de duplicar.
        async lookupClientByDocument(document) {
            const digits = onlyDigits(document);
            if (digits.length !== 11 && digits.length !== 14) {
                throw new Error(
                    "Documento inválido: informe um CPF (11 dígitos) ou CNPJ (14 dígitos).",
                );
            }

            if (digits.length === 11) {
                const result = await client.searchIndividuals({
                    page: 1,
                    pageSize: 1,
                    cpfList: [digits],
                });
                const raw = result.items[0] as TotvsModaIndividual | undefined;
                return raw
                    ? {
                          externalId: trim(raw.cpf ?? raw.code),
                          data: mapTotvsModaIndividualClient(raw),
                      }
                    : null;
            }

            const result = await client.searchLegalEntities({
                page: 1,
                pageSize: 1,
                cnpjList: [digits],
            });
            const raw = result.items[0] as TotvsModaLegalEntity | undefined;
            return raw
                ? {
                      externalId: trim(raw.cnpj ?? raw.code),
                      data: mapTotvsModaLegalEntityClient(raw),
                  }
                : null;
        },

        // Coligados (RelatedModel, expand "relateds") da pessoa física/jurídica
        // já cadastrada no TOTVS sob este documento — usado para propor o
        // preenchimento de um grupo comercial a partir da composição que já
        // existe no ERP (ver services/commercialGroups/commercialGroupMemberService.
        // listErpRelatedPartiesForClient). Cada item ainda passa por
        // addCommercialGroupMember({document}) pra registrar/vincular, igual a
        // qualquer outro documento buscado manualmente — este método só lista.
        async lookupRelatedPartiesByDocument(document) {
            const digits = onlyDigits(document);
            if (digits.length !== 11 && digits.length !== 14) {
                throw new Error(
                    "Documento inválido: informe um CPF (11 dígitos) ou CNPJ (14 dígitos).",
                );
            }

            const result =
                digits.length === 11
                    ? await client.searchIndividualRelateds(digits)
                    : await client.searchLegalEntityRelateds(digits);
            const raw = result.items[0] as
                | (TotvsModaIndividual & TotvsModaLegalEntity)
                | undefined;
            const relateds = raw?.relateds ?? [];
            const parties: Array<{ cpfCnpj: string; name: string }> = [];
            for (const related of relateds) {
                const party = toRelatedParty(related);
                if (party && party.cpfCnpj !== digits) parties.push(party);
            }
            return parties;
        },

        // Cria o pedido (POST b2c-orders) -- toda a tradução Order+context ->
        // OrderInDto fica em mapOrderToTotvsModaOrderInDto (mapper.ts), que
        // lança TotvsModaOrderMappingError (não-repetível) quando falta
        // config/dado obrigatório. orderCode (o número que o TOTVS atribui) é
        // o externalId que orderPushService guarda como "id do ERP".
        async sendOrder(
            order,
            context: ErpOrderPushContext,
            options,
        ) {
            const orderId = options?.idempotencyKey || order.id;
            const payload = mapOrderToTotvsModaOrderInDto(order, context, normalized, orderId);
            const result = await client.createB2COrder(payload);
            return {
                externalId: String(result.orderCode),
                raw: result as unknown as Record<string, unknown>,
            };
        },

        // Cancela (POST orders/cancel) por branchCode+orderCode -- externalId
        // aqui é sempre o orderCode que sendOrder devolveu (ver
        // mapCancelOrderInput em mapper.ts para o porquê de não usar orderId).
        // Um 400 já chega aqui como TotvsModaOrderRejectedError (client.ts),
        // então não precisa de tratamento especial: só deixa propagar.
        async cancelOrder(externalId, options) {
            const payload = mapCancelOrderInput(externalId, normalized, options?.reason);
            await client.cancelOrder(payload);
            return {};
        },
    };
}
