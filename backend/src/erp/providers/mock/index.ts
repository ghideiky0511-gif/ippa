import type { ErpFetchResult, ErpProvider } from "../../types";
import { MOCK_RAW_CLIENTS, MOCK_RAW_COMPANIES, MOCK_RAW_ORDERS, MOCK_RAW_PRODUCTS } from "./fixtures";
import { mapMockClient, mapMockCompany, mapMockOrder, mapMockProduct } from "./mapper";

// Provider fake: não autentica nem chama nada externo, só devolve fixtures
// fixas já adequadas ao formato interno. Serve para validar o contrato
// ErpProvider ponta a ponta antes de um provider real existir.
export function createMockErpProvider(): ErpProvider {
    return {
        code: "mock",

        async discoverProductChanges(_window, cursor) {
            if (cursor) return { referenceCodes: [] };
            return {
                referenceCodes: MOCK_RAW_PRODUCTS.map(({ raw }) => raw.referencia ?? raw.codigo),
            };
        },

        async fetchReference(referenceCode) {
            const found = MOCK_RAW_PRODUCTS.find(({ raw }) => (raw.referencia ?? raw.codigo) === referenceCode);
            if (!found) return null;
            const data = mapMockProduct(found.raw);
            return {
                externalId: referenceCode,
                name: data.name,
                description: data.description,
                classifications: [],
                skus: [{
                    externalId: found.raw.codigo,
                    sku: found.raw.codigo,
                    color: "",
                    size: "",
                    isActive: true,
                    isBlocked: false,
                    classifications: [],
                }],
            };
        },

        async fetchPrices(productCodes) {
            return productCodes.flatMap((code) => {
                const found = MOCK_RAW_PRODUCTS.find(({ raw }) => raw.codigo === code);
                return found ? [{ skuExternalId: code, price: found.raw.precoVenda }] : [];
            });
        },

        async fetchStock(productCodes) {
            return productCodes.map((code) => ({
                skuExternalId: code,
                locationExternalId: "mock:default",
                locationName: "Estoque mock",
                quantity: 0,
            }));
        },

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

        async lookupClientByDocument(document) {
            const digits = document.replace(/\D/g, "");
            const found = MOCK_RAW_CLIENTS.find(({ raw }) => raw.documento.replace(/\D/g, "") === digits);
            return found ? { externalId: found.externalId, data: mapMockClient(found.raw) } : null;
        },

        // Sem backend real por trás: gera um id novo a cada chamada (inclui
        // um sufixo aleatório, não só o id do pedido) para que um resend
        // (cancelar + criar de novo) produza um external_id diferente do
        // anterior — é o que orderPushService espera poder observar.
        async sendOrder(order) {
            const suffix = Math.random().toString(36).slice(2, 8);
            return { externalId: `mock-order-${order.id}-${suffix}` };
        },

        // Fake sem estado: não há pedido nenhum do outro lado para checar,
        // então cancelar sempre "funciona".
        async cancelOrder() {
            return {};
        },
    };
}
