import assert from "node:assert/strict";
import test from "node:test";
import { mapTotvsModaCompositions, mapTotvsModaReferenceSnapshot } from "./mapper";

test("agrupa todos os SKUs e classificações de uma referência", () => {
    const snapshot = mapTotvsModaReferenceSnapshot([
        {
            productCode: 10,
            productSku: "SKU-10",
            ReferenceCode: "REF-1",
            referenceName: "Vestido",
            description: "Descri\u00e7\u00e3o resumida",
            details: [
                {
                    typeCode: 1,
                    type: "Description",
                    auxiliaryType: "Descri\u00e7\u00e3o",
                    description: "Descri\u00e7\u00e3o editorial do TOTVS",
                },
            ],
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
    assert.equal(snapshot.description, "Descri\u00e7\u00e3o editorial do TOTVS");
    assert.deepEqual(snapshot.skus.map((sku) => sku.externalId), ["10", "11"]);
    assert.deepEqual(snapshot.skus[0].classifications.map((classification) => classification.code), ["VEST"]);
    assert.deepEqual(snapshot.skus[1].classifications.map((classification) => classification.code), ["IPPA"]);
});

test("mapTotvsModaCompositions achata grupo/composição/fibras (composição por grupo)", () => {
    const compositions = mapTotvsModaCompositions([
        {
            groupCode: "5 2303",
            groupDescription: "SHORTS SAIA UMA FENDA",
            compositions: [
                {
                    code: 49,
                    description: "74% VISCOSE 23% POLIAMIDA 3% ELASTANO",
                    typeDescription: "PRINCIPAL",
                    itemsComposition: [
                        { fiberCode: 1, fiberDescription: "VISCOSE", fiberPercentage: 74 },
                        { fiberCode: 4, fiberDescription: "POLIAMIDA", fiberPercentage: 23 },
                        { fiberCode: 2, fiberDescription: "ELASTANO", fiberPercentage: 3 },
                    ],
                },
            ],
        },
    ]);
    assert.equal(compositions.length, 1);
    const [composition] = compositions;
    assert.equal(composition.externalCode, "49");
    assert.equal(composition.description, "74% VISCOSE 23% POLIAMIDA 3% ELASTANO");
    assert.equal(composition.typeDescription, "PRINCIPAL");
    assert.equal(composition.externalGroupCode, "5 2303");
    assert.equal(composition.groupDescription, "SHORTS SAIA UMA FENDA");
    assert.deepEqual(composition.items, [
        { externalCode: "1", material: "VISCOSE", percentage: 74 },
        { externalCode: "4", material: "POLIAMIDA", percentage: 23 },
        { externalCode: "2", material: "ELASTANO", percentage: 3 },
    ]);
});

test("mapTotvsModaCompositions descarta composição sem código", () => {
    const compositions = mapTotvsModaCompositions([
        { groupCode: "1", groupDescription: "Grupo sem composição", compositions: [{ description: "sem código" }] },
    ]);
    assert.deepEqual(compositions, []);
});
