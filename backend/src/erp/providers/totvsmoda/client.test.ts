import assert from "node:assert/strict";
import test from "node:test";
import { TotvsModaClient } from "./client";
import { PRODUCT_PRICES_SEARCH_PATH, TOTVS_MODA_BASE_URL } from "./http";

test("prices/search envia o ProductPriceInDto documentado", async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = async (input, init) => {
        const url = String(input);
        calls.push({ url, init });
        if (url.endsWith("/api/totvsmoda/authorization/v2/token")) {
            return new Response(
                JSON.stringify({ access_token: "token", expires_in: 3600 }),
                {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                },
            );
        }
        return new Response(
            JSON.stringify({
                items: [
                    {
                        productCode: 101,
                        prices: [
                            {
                                priceCode: 7,
                                price: 129.9,
                                promotionalPrice: 109.9,
                            },
                        ],
                    },
                ],
                hasNext: false,
            }),
            {
                status: 200,
                headers: { "Content-Type": "application/json" },
            },
        );
    };

    try {
        const client = new TotvsModaClient({
            clientId: "client",
            clientSecret: "secret",
            username: "user",
            password: "password",
            branchCode: 1,
            priceCodeList: [7, 8],
            stockCodeList: [1],
        });
        const response = await client.searchProductPrices([101, 102]);

        assert.equal(response.items.length, 1);
        assert.equal(calls.length, 2);
        assert.equal(
            calls[1].url,
            `${TOTVS_MODA_BASE_URL}${PRODUCT_PRICES_SEARCH_PATH}`,
        );
        assert.equal(calls[1].init?.method, "POST");
        assert.deepEqual(JSON.parse(String(calls[1].init?.body)), {
            filter: { productCodeList: [101, 102] },
            option: {
                prices: [
                    {
                        branchCode: 1,
                        priceCodeList: [7, 8],
                        isPromotionalPrice: true,
                    },
                ],
            },
            page: 1,
            pageSize: 1000,
            order: "productCode",
        });
    } finally {
        globalThis.fetch = originalFetch;
    }
});
