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

export type ErpProviderCredentials = Record<string, unknown>;

export interface ErpProvider {
    readonly code: string;
    getProducts(options?: ErpFetchOptions): Promise<ErpFetchResult<Omit<Product, "id">>>;
    getOrders(options?: ErpFetchOptions): Promise<ErpFetchResult<Omit<Order, "id">>>;
    getClients(options?: ErpFetchOptions): Promise<ErpFetchResult<Omit<Client, "id" | "createdAt" | "updatedAt">>>;
    getCompanies(options?: ErpFetchOptions): Promise<ErpFetchResult<Omit<Company, "id" | "createdAt" | "updatedAt">>>;
    // Opcional: providers sem uma checagem barata própria simplesmente não
    // implementam — quem chama trata a ausência como "sem teste disponível",
    // nunca como falha.
    testConnection?(): Promise<{ ok: boolean; message?: string }>;
}

// reporter é opcional e não carrega tenant/banco (ver lib/externalApiCall.ts)
// — quem resolve o tenant (erpSyncService) fecha o reporter sobre ele antes
// de chamar a fábrica.
export type ErpProviderFactory = (credentials: ErpProviderCredentials, reporter?: ExternalApiCallReporter) => ErpProvider;
