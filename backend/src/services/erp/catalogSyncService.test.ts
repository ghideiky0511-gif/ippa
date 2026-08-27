import assert from "node:assert/strict";
import test from "node:test";
import type { ErpReferenceSnapshot, ErpSkuSnapshot } from "@/erp/types";
import type { ProductVariantRow } from "@/models/catalogModel";
import { matchExistingVariantId, retryDelaySeconds, shouldPublishReference } from "./catalogSyncService";

function reference(overrides: Partial<ErpReferenceSnapshot> = {}): ErpReferenceSnapshot {
    return {
        externalId: "REF-1",
        name: "Produto",
        classifications: [{ typeCode: 7, code: "IPPA", name: "Catálogo IPPA" }],
        skus: [{ externalId: "101", color: "Preto", size: "M", isActive: true, isBlocked: false, classifications: [] }],
        ...overrides,
    };
}

function sku(overrides: Partial<ErpSkuSnapshot> = {}): ErpSkuSnapshot {
    return { externalId: "101", color: "Preto", size: "M", isActive: true, isBlocked: false, classifications: [], ...overrides };
}

function variant(overrides: Partial<ProductVariantRow> = {}): ProductVariantRow {
    return {
        product_id: "product-1",
        id: "variant-1",
        color: "Preto",
        size: "M",
        price: "100.00",
        availability: "in_stock",
        available_from: null,
        track_inventory: true,
        sku: null,
        bootstrap_external_code: null,
        is_active: true,
        source_origin: "bootstrap",
        ...overrides,
    };
}

test("publica somente com classificação permitida e SKU ativo", () => {
    const config = { classification_type_code: 7, classification_codes: ["IPPA", "SITE"] };
    assert.equal(shouldPublishReference(reference(), config), true);
    assert.equal(shouldPublishReference(reference({
        classifications: [{ typeCode: 7, code: "OUTRA" }],
    }), config), false);
    assert.equal(shouldPublishReference(reference({
        skus: [{ externalId: "101", color: "", size: "", isActive: false, isBlocked: false, classifications: [] }],
    }), config), false);
    assert.equal(shouldPublishReference(reference({
        skus: [{ externalId: "101", color: "", size: "", isActive: true, isBlocked: true, classifications: [] }],
    }), config), false);
});

test("classificações funcionam como OU sem misturar tipos", () => {
    assert.equal(shouldPublishReference(reference(), {
        classification_type_code: 8,
        classification_codes: ["IPPA"],
    }), false);
    assert.equal(shouldPublishReference(reference(), {
        classification_type_code: 7,
        classification_codes: ["SITE", "IPPA"],
    }), true);
});

test("política de retry segue 1, 5, 15, 60 e 240 minutos", () => {
    assert.deepEqual(
        [0, 1, 2, 3, 4, 5].map(retryDelaySeconds),
        [60, 300, 900, 3600, 14_400, null],
    );
});

test("matchExistingVariantId casa por erp_external_references antes de qualquer fallback", () => {
    const variants = [variant({ id: "variant-1", color: "Outra Cor", size: "P", bootstrap_external_code: "101" })];
    const externalVariantId = new Map([["101", "variant-known"]]);
    assert.equal(
        matchExistingVariantId({ sku: sku(), variants, externalVariantId, usedVariantIds: new Set() }),
        "variant-known",
    );
});

test("matchExistingVariantId casa por bootstrap_external_code quando não há external reference", () => {
    const variants = [variant({ id: "variant-1", bootstrap_external_code: "101" })];
    assert.equal(
        matchExistingVariantId({ sku: sku(), variants, externalVariantId: new Map(), usedVariantIds: new Set() }),
        "variant-1",
    );
});

test("matchExistingVariantId lança CATALOG_VARIANT_MATCH_AMBIGUOUS com bootstrap_external_code duplicado", () => {
    const variants = [
        variant({ id: "variant-1", bootstrap_external_code: "101" }),
        variant({ id: "variant-2", bootstrap_external_code: "101" }),
    ];
    assert.throws(
        () => matchExistingVariantId({ sku: sku(), variants, externalVariantId: new Map(), usedVariantIds: new Set() }),
        /CATALOG_VARIANT_MATCH_AMBIGUOUS/,
    );
});

test("matchExistingVariantId cai para sku e depois para cor+tamanho sem bootstrap_external_code", () => {
    const bySku = [variant({ id: "variant-1", sku: "7890000103756" })];
    assert.equal(
        matchExistingVariantId({
            sku: sku({ sku: "7890000103756" }), variants: bySku, externalVariantId: new Map(), usedVariantIds: new Set(),
        }),
        "variant-1",
    );

    const byColorSize = [variant({ id: "variant-2", color: "Preto", size: "M", source_origin: "bootstrap" })];
    assert.equal(
        matchExistingVariantId({ sku: sku(), variants: byColorSize, externalVariantId: new Map(), usedVariantIds: new Set() }),
        "variant-2",
    );
});
