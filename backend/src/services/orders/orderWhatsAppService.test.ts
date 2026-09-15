import assert from "node:assert/strict";
import test from "node:test";
import {
    maskWhatsAppPhone,
    SendOrderWhatsAppInputSchema,
    selectOrderHeaderImageUrl,
} from "./orderWhatsAppService";

test("accepts only the three supported WhatsApp actions", () => {
    assert.equal(
        SendOrderWhatsAppInputSchema.safeParse({ kind: "order" }).success,
        true,
    );
    assert.equal(
        SendOrderWhatsAppInputSchema.safeParse({ kind: "payment_link" })
            .success,
        true,
    );
    assert.equal(
        SendOrderWhatsAppInputSchema.safeParse({ kind: "payment_order" })
            .success,
        true,
    );
    assert.equal(
        SendOrderWhatsAppInputSchema.safeParse({ kind: "free_text" }).success,
        false,
    );
});

test("masks the phone before returning it to the frontend", () => {
    assert.equal(maskWhatsAppPhone("+5511999991234"), "+55 *****-1234");
});

test("selectOrderHeaderImageUrl envia header quando o primeiro item tem imagem HTTPS", () => {
    assert.equal(
        selectOrderHeaderImageUrl([
            { image: "https://cdn.example.com/top-faixa.jpg" },
        ]),
        "https://cdn.example.com/top-faixa.jpg",
    );
});

test("selectOrderHeaderImageUrl não envia header sem imagem", () => {
    assert.equal(selectOrderHeaderImageUrl([{}]), undefined);
    assert.equal(selectOrderHeaderImageUrl([{ image: "" }]), undefined);
    assert.equal(selectOrderHeaderImageUrl([{ image: "   " }]), undefined);
    assert.equal(selectOrderHeaderImageUrl([]), undefined);
});

test("selectOrderHeaderImageUrl não envia header com URL HTTP, relativa, com credenciais ou inválida", () => {
    assert.equal(
        selectOrderHeaderImageUrl([{ image: "http://cdn.example.com/a.jpg" }]),
        undefined,
    );
    assert.equal(
        selectOrderHeaderImageUrl([{ image: "/produtos/a.jpg" }]),
        undefined,
    );
    assert.equal(
        selectOrderHeaderImageUrl([{ image: "produtos/a.jpg" }]),
        undefined,
    );
    assert.equal(
        selectOrderHeaderImageUrl([
            { image: "https://user:pass@cdn.example.com/a.jpg" },
        ]),
        undefined,
    );
    assert.equal(
        selectOrderHeaderImageUrl([{ image: "não é uma url" }]),
        undefined,
    );
});

test("selectOrderHeaderImageUrl usa a imagem do primeiro item em pedidos com vários itens", () => {
    assert.equal(
        selectOrderHeaderImageUrl([
            { image: "https://cdn.example.com/primeiro.jpg" },
            { image: "https://cdn.example.com/segundo.jpg" },
        ]),
        "https://cdn.example.com/primeiro.jpg",
    );
    // Não cai para o segundo item mesmo se o primeiro não tiver imagem válida --
    // "imagem do primeiro item exibido no pedido", não "primeira imagem válida".
    assert.equal(
        selectOrderHeaderImageUrl([
            { image: undefined },
            { image: "https://cdn.example.com/segundo.jpg" },
        ]),
        undefined,
    );
});
