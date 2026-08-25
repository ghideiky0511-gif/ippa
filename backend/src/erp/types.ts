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
    getProducts(
        options?: ErpFetchOptions,
    ): Promise<ErpFetchResult<Omit<Product, "id">>>;
    getOrders(
        options?: ErpFetchOptions,
    ): Promise<ErpFetchResult<Omit<Order, "id">>>;
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
}

// reporter é opcional e não carrega tenant/banco (ver lib/externalApiCall.ts)
// — quem resolve o tenant (erpSyncService) fecha o reporter sobre ele antes
// de chamar a fábrica.
export type ErpProviderFactory = (
    credentials: ErpProviderCredentials,
    reporter?: ExternalApiCallReporter,
) => ErpProvider;
