import type { ErpFetchResult, ErpProvider, ErpProviderCredentials } from "../../types";
import { MOCK_RAW_CLIENTS, MOCK_RAW_COMPANIES, MOCK_RAW_ORDERS, MOCK_RAW_PRODUCTS } from "./fixtures";
import { mapMockClient, mapMockCompany, mapMockOrder, mapMockProduct } from "./mapper";

// Provider fake: não autentica nem chama nada externo, só devolve fixtures
// fixas já adequadas ao formato interno. Serve para validar o contrato
// ErpProvider ponta a ponta antes de um provider real existir.
export function createMockErpProvider(_credentials: ErpProviderCredentials): ErpProvider {
    return {
        code: "mock",

        async getProducts(): Promise<ErpFetchResult<ReturnType<typeof mapMockProduct>>> {
            return { items: MOCK_RAW_PRODUCTS.map(({ externalId, raw }) => ({ externalId, data: mapMockProduct(raw) })) };
        },

        async getOrders(): Promise<ErpFetchResult<ReturnType<typeof mapMockOrder>>> {
            return { items: MOCK_RAW_ORDERS.map(({ externalId, raw }) => ({ externalId, data: mapMockOrder(raw) })) };
        },

        async getClients(): Promise<ErpFetchResult<ReturnType<typeof mapMockClient>>> {
            return { items: MOCK_RAW_CLIENTS.map(({ externalId, raw }) => ({ externalId, data: mapMockClient(raw) })) };
        },

        async getCompanies(): Promise<ErpFetchResult<ReturnType<typeof mapMockCompany>>> {
            return { items: MOCK_RAW_COMPANIES.map(({ externalId, raw }) => ({ externalId, data: mapMockCompany(raw) })) };
        },

        async testConnection() {
            return { ok: true };
        },
    };
}
