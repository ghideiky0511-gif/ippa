import assert from "node:assert/strict";
import test from "node:test";
import type { DeliveryConfigurationRow } from "@/models/deliveryModel";
import { deliveryQuoteFromConfiguration, toDeliveryType } from "./deliveryService";

function configuration(overrides: Partial<DeliveryConfigurationRow> = {}): DeliveryConfigurationRow {
    return {
        id: "type-pickup",
        code: "pickup",
        fulfillment_mode: "pickup",
        name: "Retirada no local",
        active: true,
        sort_order: 10,
        offering_id: "offering-pickup",
        pricing_mode: "fixed",
        fixed_price: "0.00",
        eta_label: null,
        offering_active: true,
        provider_id: "provider-own",
        provider_code: "own_company",
        provider_kind: "internal",
        provider_name: "Loja Exemplo",
        provider_company_id: null,
        provider_active: true,
        ...overrides,
    };
}

test("cotação separa tipo, offering e provider interno", () => {
    const quote = deliveryQuoteFromConfiguration(configuration());
    assert.equal(quote.deliveryTypeId, "type-pickup");
    assert.equal(quote.deliveryOfferingId, "offering-pickup");
    assert.equal(quote.providerId, "provider-own");
    assert.equal(quote.fulfillmentMode, "pickup");
    assert.equal(quote.price, 0);
});

test("configuração administrativa expõe provider sem misturá-lo com o tipo", () => {
    const type = toDeliveryType(configuration({
        id: "type-address",
        code: "address_delivery",
        fulfillment_mode: "address_delivery",
        name: "Entrega no endereço",
        fixed_price: "19.90",
    }));
    assert.equal(type.code, "address_delivery");
    assert.equal(type.offering.provider.code, "own_company");
    assert.equal(type.offering.fixedPrice, 19.9);
});

test("cotação externa reservada não usa preço fixo silenciosamente", () => {
    assert.throws(
        () => deliveryQuoteFromConfiguration(configuration({ pricing_mode: "external_quote", fixed_price: null })),
        /DELIVERY_EXTERNAL_QUOTE_NOT_AVAILABLE/,
    );
});
