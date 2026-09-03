// Conversões pequenas e puras entre o formato interno (E.164, "+5511...")
// e o formato que o WhatsApp (via bippa-messaging) espera (dígitos, sem
// "+"). Movido de backend/src/whatsapp/payloadBuilders.ts quando o Catálogo
// deixou de falar direto com a Graph API -- a função e seu teste continuam
// necessários, só o transporte que a consome mudou.

// clients.whatsapp_phone é validado em E.164 na migration 055
// (^\+[1-9][0-9]{7,14}$) -- aqui só remove o "+".
export function toWaId(e164Phone: string): string {
    const trimmed = e164Phone.trim();
    if (!/^\+[1-9][0-9]{7,14}$/.test(trimmed)) {
        throw new Error(`Telefone fora do formato E.164 esperado: ${e164Phone}`);
    }
    return trimmed.slice(1);
}
