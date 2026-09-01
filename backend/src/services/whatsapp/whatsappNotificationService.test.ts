import assert from "node:assert/strict";
import test from "node:test";
import { toWhatsAppOrderRecipient } from "./whatsappNotificationService";
import type { ClientRow } from "@/models/clientsModel";

function baseRow(overrides: Partial<ClientRow> = {}): ClientRow {
    return {
        id: "client-1",
        name: "Maria",
        cpf_cnpj: null,
        email: null,
        whatsapp_phone: "+5511999999999",
        cep: null,
        street: null,
        number: null,
        complement: null,
        neighborhood: null,
        city: null,
        state: null,
        company_responsible: null,
        store_name: null,
        last_seller_id: "seller-1",
        created_at: new Date(),
        updated_at: new Date(),
        ...overrides,
    };
}

test("toWhatsAppOrderRecipient resolve quando telefone e vendedora estão presentes", () => {
    const recipient = toWhatsAppOrderRecipient(baseRow());
    assert.deepEqual(recipient, { whatsappPhone: "+5511999999999", sellerId: "seller-1", clientName: "Maria" });
});

test("toWhatsAppOrderRecipient devolve null sem telefone", () => {
    assert.equal(toWhatsAppOrderRecipient(baseRow({ whatsapp_phone: null })), null);
});

test("toWhatsAppOrderRecipient devolve null sem vendedora atribuída", () => {
    assert.equal(toWhatsAppOrderRecipient(baseRow({ last_seller_id: null })), null);
});

test("toWhatsAppOrderRecipient devolve null sem cliente (pedido sem client_id resolvido)", () => {
    assert.equal(toWhatsAppOrderRecipient(null), null);
});
