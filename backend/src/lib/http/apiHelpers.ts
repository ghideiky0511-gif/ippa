import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { NextRequest, NextResponse } from "next/server";
import * as authentication from "@/services/auth";
import type { AuditRequestContext } from "@/services/audit";
import { ServiceError, ValidationError } from "@/services/shared/errors";
import { errorMeta, logger } from "@/lib/logger";

export const ERROR_MESSAGES: Record<string, string> = {
    INVALID_INPUT: "Corpo inválido.",
    INCOMPLETE_SIGNUP:
        "Preencha nome, e-mail, senha, CPF/CNPJ, CEP, Rua, Número, Bairro, Cidade e Estado.",
    WEAK_PASSWORD: "A senha precisa ter pelo menos 6 caracteres.",
    WRONG_PASSWORD: "Senha atual incorreta.",
    CNPJ_REQUIRED: "Informe um CNPJ com 14 dígitos.",
    INVALID_DOCUMENT: "Informe um CPF ou CNPJ válido.",
    EMAIL_TAKEN: "Já existe uma conta com esse e-mail.",
    DOCUMENT_TAKEN: "Já existe um cadastro com esse CPF/CNPJ.",
    CLIENT_ALREADY_HAS_LOGIN: "Essa cliente já tem login.",
    CLIENT_LOGIN_REQUIRED:
        "A cliente ainda não tem login — crie um antes de gerar o link.",
    FIRST_ACCESS_EMAIL_REQUIRED:
        "Este cadastro ainda não tem e-mail. Peça à loja para atualizar seus dados.",
    INVALID_ACCOUNT_CONFIRMATION:
        "Este link de confirmação é inválido ou expirou. Solicite um novo primeiro acesso.",
    CLIENT_REQUIRED: "Vincule um cadastro de cliente antes de gerar o link.",
    INCOMPLETE_CLIENT:
        "Complete o cadastro da cliente (CPF/CNPJ e e-mail) antes de continuar.",
    EMPTY_ORDER: "Adicione peças ao pedido antes de gerar o link.",
    SHIPPING_REQUIRED: "Escolha o frete antes de gerar o link.",
    SELF_CHECKOUT_DISABLED:
        "Esse pedido só pode ser finalizado pela vendedora.",
    FORBIDDEN: "Sem permissão.",
    CLIENT_NOT_FOUND: "Cadastro não encontrado.",
    SESSION_NOT_FOUND: "Sessão não encontrada.",
    USER_NOT_FOUND: "Usuário não encontrado.",
    INVALID_PAYMENT_LINK: "Link inválido ou pedido já concluído.",
    PAYMENT_LINK_EXPIRED:
        "Esse link de pagamento expirou. Peça um novo para a vendedora.",
    CANNOT_DELETE_SELF: "Você não pode excluir a própria conta.",
    CLASSIFICATION_NOT_FOUND: "Categoria não encontrada.",
    PRODUCT_SKU_TAKEN: "Já existe um produto com este código nesta loja.",
    PRODUCT_REFERENCE_ID_TAKEN: "Já existe um produto com esta referência nesta loja.",
    PRODUCT_NOT_FOUND: "Produto não encontrado.",
    ERP_PRODUCT_READ_ONLY: "Este produto é sincronizado pelo ERP e só pode ser alterado nele.",
    PROMPT_REQUIRED: "Descreva o que você quer na home.",
    OPENAI_NOT_CONFIGURED: "OPENAI_API_KEY não configurada.",
    HOME_AI_PROVIDER_ERROR: "Falha ao gerar a home.",
    HOME_AI_INVALID_RESPONSE: "Não foi possível interpretar a resposta da IA.",
    AI_TOOL_INVALID_INPUT: "Entrada inválida para a ferramenta de IA.",
    AI_NOT_CONFIGURED: "A ferramenta de IA não está configurada.",
    AI_PROVIDER_TIMEOUT: "A ferramenta de IA demorou demais para responder.",
    AI_PROVIDER_RATE_LIMITED: "A ferramenta de IA está temporariamente sobrecarregada.",
    AI_PROVIDER_UNAVAILABLE: "A ferramenta de IA está temporariamente indisponível.",
    AI_PROVIDER_REFUSED: "A ferramenta de IA não pôde processar estes dados.",
    AI_PROVIDER_INCOMPLETE: "A ferramenta de IA devolveu uma resposta incompleta.",
    AI_PROVIDER_INVALID_OUTPUT: "A ferramenta de IA devolveu uma resposta inválida.",
    SESSION_ALREADY_FINALIZED: "This order was already finalized.",
    ORDER_ALREADY_FINALIZED: "Este pedido não aceita esta alteração.",
    SESSION_CANCELLED: "This order is cancelled. Reactivate it before changing or finalizing it.",
    ORDER_BOOK_NOT_FOUND: "Talão não encontrado.",
    ORDER_BOOK_NOT_EMPTY: "Só é possível cancelar um talão quando todos os pedidos pendentes estão vazios.",
    ORDER_BOOK_ALREADY_CLOSED: "Este talão já está fechado.",
    ERP_INTEGRATION_NOT_CONFIGURED:
        "Nenhum provedor de ERP está configurado e ativo para esta loja.",
    ERP_SYNC_UNAVAILABLE:
        "Este provedor de ERP não suporta busca por documento.",
    CLIENT_WITHOUT_DOCUMENT:
        "Esta cliente não tem CPF/CNPJ salvo nem vínculo com o ERP — não é possível sincronizar.",
    ERP_CLIENT_NOT_FOUND: "Cliente não encontrada no ERP ativo.",
    COMMERCIAL_GROUP_NOT_FOUND: "Grupo comercial não encontrado.",
    COMMERCIAL_GROUP_INACTIVE: "Este grupo comercial está inativo.",
    COMMERCIAL_GROUP_MEMBER_NOT_FOUND: "Membro não encontrado neste grupo comercial.",
    CLIENT_NOT_FOUND_FOR_DOCUMENT: "Nenhuma cliente encontrada (local ou no ERP) para este documento.",
    CLIENT_ALREADY_GROUP_MEMBER: "Esta cliente já é membro deste grupo comercial.",
    CLIENT_ALREADY_IN_ANOTHER_GROUP: "Esta cliente já pertence a outro grupo comercial ativo.",
    ORDER_NOT_FOUND: "Pedido não encontrado.",
    ORDER_NOT_READY_FOR_PAYMENT: "Este pedido ainda está em montagem — finalize o checkout antes de marcar como pago.",
    ORDER_ALREADY_PAID: "Este pedido já está marcado como pago.",
    ORDER_ALREADY_CANCELLED: "Este pedido já foi cancelado.",
    ORDER_FREIGHT_NOT_FOUND: "Este pedido não tem frete registrado.",
    ORDER_FREIGHT_ALREADY_SHIPPED: "Este frete já foi despachado e não pode mais ser alterado.",
    DELIVERY_TYPE_NOT_FOUND: "Tipo de entrega não encontrado.",
    DELIVERY_OFFERING_NOT_FOUND: "Esta opção de entrega não está mais disponível.",
    DELIVERY_LAST_ACTIVE_TYPE: "Mantenha pelo menos um tipo de entrega ativo.",
    DELIVERY_ADDRESS_REQUIRED: "Informe o CEP para entrega no endereço.",
    DELIVERY_EXTERNAL_QUOTE_NOT_AVAILABLE: "A cotação externa ainda não está disponível.",
    ORDER_NOT_READY_FOR_SEPARATION: "Este pedido ainda está em montagem — finalize o checkout antes de confirmar a separação.",
    ORDER_ALREADY_SEPARATED: "Este pedido já teve a separação confirmada.",
    ORDER_HAS_NO_ITEMS: "Este pedido não tem itens.",
    ORDER_ITEMS_NOT_SEPARATED: "Os itens deste pedido ainda não foram confirmados como separados.",
    PAYMENT_INTEGRATION_NOT_READY: "O gateway de pagamento deste tenant ainda não está pronto para cobrar.",
};

export function cookieOptions() {
    const configuredSecure = process.env.COOKIE_SECURE;
    return {
        httpOnly: true,
        sameSite: "lax" as const,
        secure: configuredSecure === undefined
            ? process.env.NODE_ENV === "production"
            : configuredSecure === "true",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
    };
}

export function requestToken(
    request: NextRequest,
    tenantSlug: string,
): string | undefined {
    return (
        request.cookies.get(authentication.sessionCookieName(tenantSlug))
            ?.value ??
        request.cookies.get("ippa_workspace_session")?.value ??
        request.cookies.get("ippa_admin_session")?.value ??
        request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    );
}

export function clientIp(request: NextRequest): string | undefined {
    const forwardedFor = request.headers
        .get("x-forwarded-for")
        ?.split(",")[0]
        ?.trim();
    const realIp = request.headers.get("x-real-ip")?.trim();
    return [forwardedFor, realIp].find(
        (value): value is string =>
            typeof value === "string" && isIP(value) !== 0,
    );
}

export function auditContext(request: NextRequest): AuditRequestContext {
    return {
        requestId: randomUUID(),
        ipAddress: clientIp(request),
        userAgent: request.headers.get("user-agent")?.slice(0, 512),
    };
}

// Contador em memória de processo único (ver nota em lib/logger.ts — o
// backend roda como um processo Node de longa duração via Docker, não em
// funções serverless/edge efêmeras, então um Map local é consistente entre
// requisições). Reinicia a cada deploy/restart — aceitável para conter
// abuso e força bruta, não é um requisito de auditoria permanente.
type RateLimitBucket = { count: number; resetAt: number };
const rateLimitBuckets = new Map<string, RateLimitBucket>();

setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of rateLimitBuckets) {
        if (bucket.resetAt <= now) rateLimitBuckets.delete(key);
    }
}, 5 * 60_000).unref();

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

export function rateLimit(
    scope: string,
    identifier: string | undefined,
    limit: number,
    windowMs: number,
): RateLimitResult {
    // Sem IP confiável (proxy não configurado, request local etc.): não dá
    // pra distinguir clientes, então não há o que limitar — falha aberta em
    // vez de bloquear todo mundo sob a mesma chave.
    if (!identifier) return { allowed: true, retryAfterSeconds: 0 };
    const key = `${scope}:${identifier}`;
    const now = Date.now();
    const bucket = rateLimitBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
        rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, retryAfterSeconds: 0 };
    }
    if (bucket.count >= limit) {
        return {
            allowed: false,
            retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
        };
    }
    bucket.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
}

export function tooManyRequests(retryAfterSeconds: number): NextResponse {
    return NextResponse.json(
        { error: "Muitas tentativas. Tente novamente em alguns minutos." },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
    );
}

// Limites de aplicação geral: baseline "por app" aplicado em toda rota de
// tenant (ver resolveTenantRoute em lib/http/tenantRoute.ts). 120/min era
// apertado demais: uma única navegação no catálogo público já dispara vários
// GETs em paralelo (tenant, categorias, config da loja, seções, destaques,
// filtros) e todo tráfego atrás do mesmo IP (proxy/NAT, ou o próprio SSR
// local em dev) soma no mesmo balde.
export const GENERAL_RATE_LIMIT = { limit: 600, windowMs: 60_000 };

// Limites para rotas sensíveis a força bruta / enumeração (login, cadastro,
// consulta de documento) — mais apertado que o baseline geral, contado à
// parte por IP+rota pra uma rajada de cadastro não consumir o orçamento do
// login e vice-versa.
export const AUTH_RATE_LIMIT = { limit: 20, windowMs: 10 * 60_000 };

export function parseIdsParam(value: string | null): string[] | undefined {
    if (!value) return undefined;
    const ids = value.split(",").map((id) => id.trim()).filter(Boolean);
    return ids.length > 0 ? ids : undefined;
}

export function publicOrigin(request: NextRequest): string {
    const host =
        request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const protocol =
        request.headers.get("x-forwarded-proto") ??
        request.nextUrl.protocol.replace(":", "");
    return host ? `${protocol}://${host}` : request.nextUrl.origin;
}

export function serviceError(error: unknown): NextResponse | null {
    if (!(error instanceof ServiceError)) return null;
    const payload: Record<string, unknown> = {
        error: ERROR_MESSAGES[error.code] ?? error.message,
    };
    if (error.code === "PAYMENT_LINK_EXPIRED") {
        payload.error = "expired";
        payload.message = ERROR_MESSAGES[error.code];
    }
    // Issues do Zod (campo a campo) — só presente quando o erro veio de uma
    // validação de schema na camada de serviço; não localizado pro
    // português (ver contexto no plano de validação), é pra debug/inspeção,
    // não pra mostrar cru pro usuário final.
    if (error instanceof ValidationError && error.details !== undefined) {
        payload.details = error.details;
    }
    return NextResponse.json(payload, { status: error.status });
}

export async function execute(
    operation: () => Promise<unknown>,
    status = 200,
): Promise<NextResponse> {
    try {
        const result = await operation();
        // Algumas operações representam apenas uma ação aceita. NextResponse.json
        // não aceita undefined, portanto o contrato HTTP correto nesse caso é 204.
        if (result === undefined) return new NextResponse(null, { status: status === 200 ? 204 : status });
        return NextResponse.json(result, { status });
    } catch (error) {
        const response = serviceError(error);
        if (response) return response;
        logger.error("tenant-api", "Erro inesperado ao executar operação", errorMeta(error));
        throw error;
    }
}
