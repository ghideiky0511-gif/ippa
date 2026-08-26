import assert from "node:assert/strict";
import test from "node:test";
import type { ErpReferenceSnapshot } from "@/erp/types";
import { retryDelaySeconds, shouldPublishReference } from "./catalogSyncService";

function reference(overrides: Partial<ErpReferenceSnapshot> = {}): ErpReferenceSnapshot {
    return {
        externalId: "REF-1",
        name: "Produto",
        classifications: [{ typeCode: 7, code: "IPPA", name: "Catálogo IPPA" }],
        skus: [{ externalId: "101", color: "Preto", size: "M", isActive: true, isBlocked: false }],
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
        skus: [{ externalId: "101", color: "", size: "", isActive: false, isBlocked: false }],
    }), config), false);
    assert.equal(shouldPublishReference(reference({
        skus: [{ externalId: "101", color: "", size: "", isActive: true, isBlocked: true }],
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
