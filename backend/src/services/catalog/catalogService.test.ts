import assert from "node:assert/strict";
import test from "node:test";
import { hasPublicCatalogPrice } from "./catalogService";

test("catálogo público aceita somente preços positivos", () => {
    assert.equal(hasPublicCatalogPrice("129.90"), true);
    assert.equal(hasPublicCatalogPrice(0.01), true);
    assert.equal(hasPublicCatalogPrice("0.00"), false);
    assert.equal(hasPublicCatalogPrice(0), false);
    assert.equal(hasPublicCatalogPrice(-1), false);
    assert.equal(hasPublicCatalogPrice(Number.NaN), false);
});
