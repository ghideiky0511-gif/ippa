import type { Client } from "@/lib/types";
import type { ExternalApiCallReporter } from "@/lib/externalApiCall";
import type { ErpFetchOptions, ErpFetchResult, ErpProvider, ErpProviderCredentials } from "../../types";
import { TotvsModaClient, type TotvsModaCredentials, type TotvsModaSearchPayload } from "./client";
import { TotvsModaAuthError } from "./errors";
import {
    groupTotvsModaProducts,
    mapTotvsModaCompany,
    mapTotvsModaIndividualClient,
    mapTotvsModaLegalEntityClient,
    mapTotvsModaOrder,
    type TotvsModaBalanceRow,
    type TotvsModaBranch,
    type TotvsModaIndividual,
    type TotvsModaLegalEntity,
    type TotvsModaOrder,
    type TotvsModaPriceRow,
    type TotvsModaProductRow,
} from "./mapper";

const PAGE_SIZE = 100;

function trim(value: unknown): string {
    return String(value ?? "").trim();
}

function toNumberArray(value: unknown): number[] {
    if (!Array.isArray(value)) return [];
    return value.map((item) => Number(item)).filter((item) => Number.isFinite(item));
}

function normalizeCredentials(credentials: ErpProviderCredentials): TotvsModaCredentials {
    const clientId = trim(credentials.clientId ?? credentials.client_id);
    const clientSecret = trim(credentials.clientSecret ?? credentials.client_secret);
    const username = trim(credentials.username);
    const password = trim(credentials.password);
    const branchCode = Number(credentials.branchCode ?? credentials.branch_code);
    const priceCodeList = toNumberArray(credentials.priceCodeList ?? credentials.price_code_list);
    const stockCodeList = toNumberArray(credentials.stockCodeList ?? credentials.stock_code_list);
    if (!clientId || !clientSecret || !username || !password) {
        throw new TotvsModaAuthError("Credenciais do TOTVS Moda não estão totalmente configuradas.");
    }
    if (!Number.isFinite(branchCode) || priceCodeList.length === 0 || stockCodeList.length === 0) {
        throw new TotvsModaAuthError(
            "Configuração do TOTVS Moda incompleta: branchCode, priceCodeList e stockCodeList são obrigatórios para consultar produtos.",
        );
    }
    return { clientId, clientSecret, username, password, branchCode, priceCodeList, stockCodeList };
}

function pageFromCursor(cursor: string | undefined): number {
    const page = cursor ? Number(cursor) : 1;
    return Number.isFinite(page) && page > 0 ? page : 1;
}

function searchPayload(options: ErpFetchOptions | undefined, page: number): TotvsModaSearchPayload {
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

function parseClientCursor(cursor: string | undefined): { phase: ClientSearchPhase; page: number } {
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

// Provider real: autentica e consome a API do TOTVS Moda via TotvsModaClient,
// devolvendo os dados já adequados ao formato interno (ver mapper.ts) — o
// mesmo contrato ErpProvider que providers/mock implementa com fixtures.
export function createTotvsModaErpProvider(credentials: ErpProviderCredentials, reporter?: ExternalApiCallReporter): ErpProvider {
    const client = new TotvsModaClient(normalizeCredentials(credentials), reporter);

    return {
        code: "totvsmoda",

        async getProducts(options?: ErpFetchOptions): Promise<ErpFetchResult<ReturnType<typeof groupTotvsModaProducts>[number]["data"]>> {
            const page = pageFromCursor(options?.cursor);
            const result = await client.searchProducts({
                page,
                pageSize: PAGE_SIZE,
                updatedSince: options?.updatedSince?.toISOString(),
            });
            const rows = result.items as TotvsModaProductRow[];
            const productCodeList = Array.from(
                new Set(rows.map((row) => row.productCode).filter((code): code is number => code !== undefined)),
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

        async getOrders(options?: ErpFetchOptions): Promise<ErpFetchResult<ReturnType<typeof mapTotvsModaOrder>>> {
            const page = pageFromCursor(options?.cursor);
            const result = await client.searchOrders(searchPayload(options, page));
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
        ): Promise<ErpFetchResult<ReturnType<typeof mapTotvsModaIndividualClient> | ReturnType<typeof mapTotvsModaLegalEntityClient>>> {
            const { phase, page } = parseClientCursor(options?.cursor);
            const updatedSince = options?.updatedSince?.toISOString();

            if (phase === "individuals") {
                const result = await client.searchIndividuals({ page, pageSize: PAGE_SIZE, updatedSince });
                return {
                    items: result.items.map((raw) => {
                        const individual = raw as TotvsModaIndividual;
                        return { externalId: trim(individual.cpf ?? individual.code), data: mapTotvsModaIndividualClient(individual) };
                    }),
                    nextCursor: result.hasNext ? buildClientCursor("individuals", page + 1) : buildClientCursor("legalEntities", 1),
                };
            }

            const result = await client.searchLegalEntities({ page, pageSize: PAGE_SIZE, updatedSince });
            return {
                items: result.items.map((raw) => {
                    const legalEntity = raw as TotvsModaLegalEntity;
                    return { externalId: trim(legalEntity.cnpj ?? legalEntity.code), data: mapTotvsModaLegalEntityClient(legalEntity) };
                }),
                nextCursor: result.hasNext ? buildClientCursor("legalEntities", page + 1) : undefined,
            };
        },

        async getCompanies(): Promise<ErpFetchResult<ReturnType<typeof mapTotvsModaCompany>>> {
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
                return { ok: false, message: exc instanceof Error ? exc.message : "Falha ao conectar ao TOTVS Moda." };
            }
        },
    };
}

// Busca pontual de um cliente por CPF ou CNPJ (individuals/search ou
// legal-entities/search com filter de um único documento, conforme o
// tamanho), sem paginar a base inteira como getClients faz para sync em
// lote. Não faz parte do contrato ErpProvider — é um ponto de entrada extra
// do provider, pensado para consulta direta (ex.: localizar um cadastro
// existente antes de abrir um talão novo).
export async function findTotvsModaClientByDocument(
    credentials: ErpProviderCredentials,
    document: string,
    reporter?: ExternalApiCallReporter,
): Promise<Omit<Client, "id" | "createdAt" | "updatedAt"> | null> {
    const digits = onlyDigits(document);
    if (digits.length !== 11 && digits.length !== 14) {
        throw new Error("Documento inválido: informe um CPF (11 dígitos) ou CNPJ (14 dígitos).");
    }

    const client = new TotvsModaClient(normalizeCredentials(credentials), reporter);
    if (digits.length === 11) {
        const result = await client.searchIndividuals({ page: 1, pageSize: 1, cpfList: [digits] });
        const raw = result.items[0] as TotvsModaIndividual | undefined;
        return raw ? mapTotvsModaIndividualClient(raw) : null;
    }

    const result = await client.searchLegalEntities({ page: 1, pageSize: 1, cnpjList: [digits] });
    const raw = result.items[0] as TotvsModaLegalEntity | undefined;
    return raw ? mapTotvsModaLegalEntityClient(raw) : null;
}
