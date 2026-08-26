import assert from "node:assert/strict";
import test from "node:test";
import { mapTotvsModaReferenceSnapshot } from "./mapper";

test("agrupa todos os SKUs e classificações de uma referência", () => {
    const snapshot = mapTotvsModaReferenceSnapshot([
        {
            productCode: 10,
            productSku: "SKU-10",
            ReferenceCode: "REF-1",
            referenceName: "Vestido",
            colorName: "Preto",
            size: "P",
            isActive: true,
            classifications: [{ typeCode: 1, typeName: "Categoria", code: "VEST", name: "Vestidos" }],
        },
        {
            productCode: 11,
            productSku: "SKU-11",
            ReferenceCode: "REF-1",
            referenceName: "Vestido",
            colorName: "Azul",
            size: "M",
            isActive: false,
            classifications: [{ typeCode: 7, typeName: "Canal", code: "IPPA", name: "IPPA" }],
        },
    ]);
    assert.ok(snapshot);
    assert.equal(snapshot.externalId, "REF-1");
    assert.equal(snapshot.category, "Vestidos");
    assert.deepEqual(snapshot.skus.map((sku) => sku.externalId), ["10", "11"]);
    assert.equal(snapshot.classifications.some((classification) => classification.code === "IPPA"), true);
});
