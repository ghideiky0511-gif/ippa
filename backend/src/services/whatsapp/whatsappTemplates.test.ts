import assert from "node:assert/strict";
import test from "node:test";
import {
    STANDARD_WHATSAPP_TEMPLATES,
    WHATSAPP_TEMPLATE_NAMES,
    standardWhatsAppTemplate,
} from "./whatsappTemplates";

test("catálogo do MVP contém somente templates versionados de utilidade em pt_BR", () => {
    assert.deepEqual(STANDARD_WHATSAPP_TEMPLATES.map((template) => template.key), ["order_confirmed", "payment_link"]);
    assert.equal(standardWhatsAppTemplate("order_confirmed").name, WHATSAPP_TEMPLATE_NAMES.orderConfirmed);
    assert.equal(standardWhatsAppTemplate("payment_link").name, WHATSAPP_TEMPLATE_NAMES.paymentLink);
    for (const template of STANDARD_WHATSAPP_TEMPLATES) {
        assert.equal(template.category, "UTILITY");
        assert.equal(template.languageCode, "pt_BR");
        assert.match(template.name, /_v\d+$/);
        assert.equal(template.parameters.length, [...template.body.matchAll(/\{\{\d+\}\}/g)].length);
    }
});
