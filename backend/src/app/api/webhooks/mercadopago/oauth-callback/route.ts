import { NextRequest, NextResponse } from "next/server";
import { handleMercadoPagoOAuthCallback } from "@/services/payments/mercadoPagoOnboardingService";
import { ValidationError } from "@/services/shared/errors";
import { errorMeta, logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Callback OAuth do Mercado Pago -- SEM tenant na URL, SEM sessão (mesmo
// motivo de api/webhooks/stripe/route.ts morar fora de api/[tenantSlug]/:
// o redirect_uri precisa ser uma URL estática cadastrada uma vez no painel
// do app Mercado Pago, e o navegador chega aqui direto do domínio do
// Mercado Pago, sem cookie de sessão do workspace). O `state` assinado
// (ver mercadoPagoOnboardingService.ts) é quem recupera qual tenant/
// returnUrl iniciou o fluxo.
export async function GET(request: NextRequest): Promise<Response> {
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    if (!code || !state) {
        logger.warn("mercadopago-oauth-callback", "Callback sem code ou state", {
            hasCode: Boolean(code),
            hasState: Boolean(state),
        });
        return NextResponse.json({ error: "Link de conexão inválido." }, { status: 400 });
    }
    try {
        const result = await handleMercadoPagoOAuthCallback(code, state);
        return NextResponse.redirect(result.redirectTo);
    } catch (error) {
        if (error instanceof ValidationError) {
            logger.warn("mercadopago-oauth-callback", "Falha ao concluir onboarding Mercado Pago", errorMeta(error));
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        logger.error("mercadopago-oauth-callback", "Erro inesperado no callback OAuth Mercado Pago", errorMeta(error));
        return NextResponse.json({ error: "Não foi possível concluir a conexão com o Mercado Pago." }, { status: 500 });
    }
}
