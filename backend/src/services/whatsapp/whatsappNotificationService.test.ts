import assert from "node:assert/strict";
import test from "node:test";
import { hasActiveWhatsAppConnection, toWhatsAppOrderRecipient } from "./whatsappNotificationService";
import type { ClientRow } from "@/models/clientsModel";
import type { WhatsAppConnectionRow } from "@/models/whatsappConnectionsModel";

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

function connectionRow(overrides: Partial<WhatsAppConnectionRow> = {}): WhatsAppConnectionRow {
    return {
        id: "conn-1",
        tenant_id: "tenant-1",
        seller_id: "seller-1",
        phone_id: "phone-1",
        external_reference: "tenant-1:seller-1",
        sender_profile_key: "catalogo:tenant-1:seller-1",
        capability_payments: false,
        display_phone_masked: null,
        verified_name: null,
        quality_rating: null,
        status: "connected",
        last_synced_at: null,
        created_at: new Date(),
        updated_at: new Date(),
        ...overrides,
    };
}

// Este é o gate "só conversa se a integração estiver ativa": a mensagem só
// sai quando a conexão da PRÓPRIA vendedora está conectada -- nunca cai
// para um número genérico de outra vendedora ou do tenant.
test("hasActiveWhatsAppConnection é true só quando a vendedora tem telefone conectado", () => {
    assert.equal(hasActiveWhatsAppConnection(connectionRow()), true);
});

test("hasActiveWhatsAppConnection é false sem nenhuma conexão registrada para a vendedora", () => {
    assert.equal(hasActiveWhatsAppConnection(null), false);
});

test("hasActiveWhatsAppConnection é false com conexão iniciada mas ainda não concluída (sem phone_id)", () => {
    assert.equal(hasActiveWhatsAppConnection(connectionRow({ phone_id: null, status: "not_connected" })), false);
});

test("hasActiveWhatsAppConnection é false com telefone associado mas status diferente de connected", () => {
    assert.equal(hasActiveWhatsAppConnection(connectionRow({ status: "disconnected" })), false);
});
