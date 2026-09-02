// Marca humano-friendly usada em identificadores de sistema externos (ERP,
// gateways de pagamento) -- separada de APP_COMERCIAL_NAME (nome comercial
// "de vitrine", pode ter espaço/acento) porque este valor vai direto num
// campo de integração/descrição de terceiro, que costuma restringir a
// caracteres alfanuméricos. Extraído de orderPushService.ts
// (buildProviderOrderIdempotencyKey) pra ser reaproveitado também pela
// descrição de cobrança do Mercado Pago -- mesmo padrão de marca em
// qualquer integração externa que mostre o pedido pro tenant/comprador.
export function getCommercialIntegrationBrand(): string {
    return (process.env.APP_COMERCIAL_NAME_INTEGRATION ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}
