import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { NextRequest, NextResponse } from "next/server";
import { resolveTenantRoute, isTenantRouteError } from "@/lib/http/tenantRoute";
import {
    clientSubject,
    ordersSubject,
    sellerSubject,
    sessionSubject,
    subscribe,
    unsubscribe,
} from "@/lib/sseHub";
import * as authentication from "@/services/auth";
import type { AuditRequestContext } from "@/services/audit";
import * as catalog from "@/services/catalog";
import * as clients from "@/services/clients";
import * as home from "@/services/home";
import * as orders from "@/services/orders";
import * as recommendations from "@/services/recommendations";
import * as settings from "@/services/settings";
import { NotFoundError, ServiceError } from "@/services/shared/errors";
import * as users from "@/services/users";
import * as pushNotifications from "@/services/notifications/pushNotificationService";

type RouteContext = { params: Promise<{ tenantSlug: string; path: string[] }> };

export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Record<string, string> = {
    INVALID_INPUT: "Corpo inválido.",
    INCOMPLETE_SIGNUP:
        "Preencha nome, e-mail, senha, CPF/CNPJ, CEP, Rua, Número, Bairro, Cidade e Estado.",
    WEAK_PASSWORD: "A senha precisa ter pelo menos 6 caracteres.",
    EMAIL_TAKEN: "Já existe uma conta com esse e-mail.",
    DOCUMENT_TAKEN: "Já existe um cadastro com esse CPF/CNPJ.",
    CLIENT_ALREADY_HAS_LOGIN: "Essa cliente já tem login.",
    CLIENT_LOGIN_REQUIRED:
        "A cliente ainda não tem login — crie um antes de gerar o link.",
    CLIENT_REQUIRED: "Vincule um cadastro de cliente antes de gerar o link.",
    INCOMPLETE_CLIENT:
        "Complete o cadastro da cliente (CPF/CNPJ, e-mail, CEP) antes de gerar o link.",
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
    PROMPT_REQUIRED: "Descreva o que você quer na home.",
    OPENAI_NOT_CONFIGURED: "OPENAI_API_KEY não configurada.",
    HOME_AI_PROVIDER_ERROR: "Falha ao gerar a home.",
    HOME_AI_INVALID_RESPONSE: "Não foi possível interpretar a resposta da IA.",
    SESSION_ALREADY_FINALIZED: "This order was already finalized.",
};

function cookieOptions() {
    return {
        httpOnly: true,
        sameSite: "lax" as const,
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
    };
}

function requestToken(
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

function auditContext(request: NextRequest): AuditRequestContext {
    const forwardedFor = request.headers
        .get("x-forwarded-for")
        ?.split(",")[0]
        ?.trim();
    const realIp = request.headers.get("x-real-ip")?.trim();
    const ipAddress = [forwardedFor, realIp].find(
        (value): value is string =>
            typeof value === "string" && isIP(value) !== 0,
    );
    return {
        requestId: randomUUID(),
        ipAddress,
        userAgent: request.headers.get("user-agent")?.slice(0, 512),
    };
}

function publicOrigin(request: NextRequest): string {
    const host =
        request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const protocol =
        request.headers.get("x-forwarded-proto") ??
        request.nextUrl.protocol.replace(":", "");
    return host ? `${protocol}://${host}` : request.nextUrl.origin;
}

function serviceError(error: unknown): NextResponse | null {
    if (!(error instanceof ServiceError)) return null;
    const payload: Record<string, string> = {
        error: ERROR_MESSAGES[error.code] ?? error.message,
    };
    if (error.code === "PAYMENT_LINK_EXPIRED") {
        payload.error = "expired";
        payload.message = ERROR_MESSAGES[error.code];
    }
    return NextResponse.json(payload, { status: error.status });
}

async function execute(
    operation: () => Promise<unknown>,
    status = 200,
): Promise<NextResponse> {
    try {
        return NextResponse.json(await operation(), { status });
    } catch (error) {
        const response = serviceError(error);
        if (response) return response;
        throw error;
    }
}

function eventStream(
    request: NextRequest,
    user: import("@/lib/types").AuthUser,
    tenantId: string,
    subjectOverride?: string,
): Response {
    const subject =
        subjectOverride ?? (user.role === "administrador" && user.permissions?.adminAccess === true
            ? ordersSubject(tenantId)
            : user.role === "vendedora"
            ? sellerSubject(user.id)
            : user.role === "cliente" && user.clientId
              ? clientSubject(user.clientId)
              : user.role !== "cliente"
                ? ordersSubject(tenantId)
                : null);
    if (!subject) return new Response("Não autenticado.", { status: 401 });
    let controllerRef: ReadableStreamDefaultController<Uint8Array> | null =
        null;
    let heartbeat: ReturnType<typeof setInterval>;
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            controllerRef = controller;
            subscribe(subject, controller);
            controller.enqueue(new TextEncoder().encode(": conectado\n\n"));
            heartbeat = setInterval(() => {
                try {
                    controller.enqueue(new TextEncoder().encode(": ping\n\n"));
                } catch {
                    clearInterval(heartbeat);
                }
            }, 25_000);
        },
        cancel() {
            clearInterval(heartbeat);
            if (controllerRef) unsubscribe(subject, controllerRef);
        },
    });
    request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        if (controllerRef) unsubscribe(subject, controllerRef);
    });
    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
        },
    });
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 204 });
}

export async function GET(
    request: NextRequest,
    context: RouteContext,
): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    const path = route.params.path;
    const endpoint = path.join("/");
    const token = requestToken(request, route.tenant.slug);
    const authenticated = () =>
        authentication.getAuthenticatedSession(route.tenant, token);

    if (path[0] === "pay" && path[1])
        return execute(() => orders.paymentSummary(route.tenant, path[1]));
    if (path[0] === "clients" && path[1]) {
        const session = await authenticated();
        if (!session)
            return NextResponse.json(
                { error: "Não autenticado." },
                { status: 401 },
            );
        return execute(async () => {
            const registration = await clients.getTenantClient(
                route.tenant,
                session.user,
                path[1],
            );
            if (!registration) throw new NotFoundError("CLIENT_NOT_FOUND");
            return registration;
        });
    }

    if (
        [
            "tenant",
            "catalog",
            "catalog-filters",
            "categories",
            "discounts",
            "highlights",
            "home-sections",
            "store-settings",
            "similar-products-settings",
        ].includes(endpoint)
    ) {
        const publicOperations: Record<
            string,
            () => Promise<unknown> | unknown
        > = {
            tenant: () => ({
                slug: route.tenant.slug,
                name: route.tenant.name,
            }),
            catalog: () => catalog.listCatalog(route.tenant),
            "catalog-filters": () => catalog.listCatalogFilters(route.tenant),
            categories: () => catalog.categoryMenu(route.tenant),
            discounts: () => settings.listDiscounts(route.tenant),
            highlights: () => settings.listHighlights(route.tenant),
            "home-sections": () => settings.listHomeSections(route.tenant),
            "store-settings": () => settings.getStoreSettings(route.tenant),
            "similar-products-settings": () =>
                settings.getSimilarProductsSettings(route.tenant),
        };
        return execute(async () => publicOperations[endpoint]());
    }
    if (endpoint === "auth/me") {
        const user = await authentication.getUserForToken(route.tenant, token);
        return user
            ? NextResponse.json({ user })
            : NextResponse.json({ user: null }, { status: 401 });
    }
    if (endpoint === "admin/auth/me") {
        const user = await authentication.getAdministratorForToken(
            route.tenant,
            token,
        );
        return user
            ? NextResponse.json(user)
            : NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const session = await authenticated();
    if (!session)
        return NextResponse.json(
            { error: "Não autenticado." },
            { status: 401 },
        );
    if (endpoint === "notifications") {
        const filtro = request.nextUrl.searchParams.get("filtro");
        return execute(() => pushNotifications.inbox(route.tenant, session.user, filtro !== "todas", Number(request.nextUrl.searchParams.get("limite") ?? 20)));
    }
    if (endpoint === "notifications/summary") {
        return execute(async () => {
            const result = await pushNotifications.inbox(route.tenant, session.user, false, 1);
            return { total: result.total, unread: result.unread };
        });
    }
    if (endpoint === "push/config") return NextResponse.json(await pushNotifications.pushConfig());
    if (endpoint === "push/status") return execute(() => pushNotifications.pushStatus(route.tenant, session.user,
        request.nextUrl.searchParams.get("installationId") ?? undefined,
        request.nextUrl.searchParams.get("endpoint") ?? undefined));
    if (path[0] === "sessions" && path[1] && path[2] === "stream") {
        const allowed = await orders.canAccessOrderSession(route.tenant, session.user, path[1]);
        if (!allowed) return NextResponse.json({ error: "Sem permissÃ£o." }, { status: 403 });
        return eventStream(request, session.user, route.tenant.id, sessionSubject(path[1]));
    }
    switch (endpoint) {
        case "clients":
            return execute(() =>
                clients.searchTenantClients(
                    route.tenant,
                    session.user,
                    request.nextUrl.searchParams.get("q") ?? undefined,
                ),
            );
        case "sessions":
            return execute(() =>
                orders.orderSessions(route.tenant, session.user),
            );
        case "order-books":
            return execute(() => orders.orderBooks(route.tenant, session.user));
        case "sessions/mine":
            return execute(() =>
                orders.customerActiveSession(route.tenant, session.user),
            );
        case "sessions/stream":
            return eventStream(request, session.user, route.tenant.id);
        case "orders":
            return execute(() => orders.userOrders(route.tenant, session.user));
        case "admin/orders":
            return execute(() => orders.userOrders(route.tenant, session.user));
        case "admin/users":
            return execute(() => users.users(route.tenant, session.user));
        case "admin/classifications":
            return execute(() =>
                catalog.listClassifications(route.tenant, session.user),
            );
        case "admin/clients":
            return execute(() =>
                clients.searchTenantClients(route.tenant, session.user),
            );
        case "catalog-order":
            return execute(() =>
                catalog.catalogOrder(route.tenant, session.user),
            );
        case "product-overrides":
            return execute(() =>
                catalog.productOverrides(route.tenant, session.user),
            );
        case "admin/home-ai/history":
            return execute(async () => ({
                history: await home.homeAiHistory(route.tenant, session.user),
            }));
        default:
            return NextResponse.json(
                { error: "Rota não encontrada." },
                { status: 404 },
            );
    }
}

export async function POST(
    request: NextRequest,
    context: RouteContext,
): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    const path = route.params.path;
    const endpoint = path.join("/");
    const body = (await request.json().catch(() => ({}))) as Record<
        string,
        unknown
    >;
    const contextData = auditContext(request);

    if (
        endpoint === "auth/login" ||
        endpoint === "admin/auth/login" ||
        endpoint === "workspace/auth/login"
    ) {
        if (
            typeof body.email !== "string" ||
            typeof body.password !== "string"
        ) {
            return NextResponse.json(
                { error: "Informe e-mail e senha." },
                { status: 400 },
            );
        }
        const result =
            endpoint === "admin/auth/login"
                ? await authentication.loginAdministrator(
                      route.tenant,
                      body.email,
                      body.password,
                      contextData,
                  )
                : endpoint === "workspace/auth/login"
                  ? await authentication.loginInternalUser(
                        route.tenant,
                        body.email,
                        body.password,
                        contextData,
                    )
                : await authentication.login(
                      route.tenant,
                      body.email,
                      body.password,
                      contextData,
                  );
        if (!result) {
            return NextResponse.json(
                { error: "E-mail, senha ou permissão inválidos." },
                { status: 401 },
            );
        }
        if (endpoint === "admin/auth/login" || endpoint === "workspace/auth/login")
            return NextResponse.json(result);
        const response = NextResponse.json({ user: result.user });
        response.cookies.set(
            authentication.sessionCookieName(route.tenant.slug),
            result.token,
            cookieOptions(),
        );
        return response;
    }
    if (endpoint === "auth/signup") {
        const response = await execute(() =>
            authentication.signupCustomer(route.tenant, body, contextData),
        );
        if (response.status !== 200) return response;
        const payload = (await response.json()) as {
            user: unknown;
            token: string;
        };
        const result = NextResponse.json({ user: payload.user });
        result.cookies.set(
            authentication.sessionCookieName(route.tenant.slug),
            payload.token,
            cookieOptions(),
        );
        return result;
    }
    if (endpoint === "auth/logout" || endpoint === "admin/auth/logout") {
        await authentication.logout(
            route.tenant,
            requestToken(request, route.tenant.slug),
            contextData,
        );
        const response = NextResponse.json({ ok: true });
        if (endpoint === "auth/logout") {
            response.cookies.set(
                authentication.sessionCookieName(route.tenant.slug),
                "",
                { ...cookieOptions(), maxAge: 0 },
            );
        }
        return response;
    }
    if (endpoint === "similar-products")
        return execute(() =>
            recommendations.recommendSimilarProducts(route.tenant, body),
        );
    if (path[0] === "pay" && path[1]) {
        return execute(() =>
            orders.confirmPayment(
                route.tenant,
                path[1],
                typeof body.paymentMethod === "string"
                    ? body.paymentMethod
                    : undefined,
            ),
        );
    }
    if (endpoint === "notifications/dispatch") {
        const secret = request.headers.get("x-notification-dispatch-secret");
        if (!process.env.NOTIFICATION_DISPATCH_SECRET || secret !== process.env.NOTIFICATION_DISPATCH_SECRET)
            return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
        return execute(() => pushNotifications.dispatchNotifications(route.tenant, { id: "", role: "administrador" }, 100));
    }

    const authenticated = await authentication.getAuthenticatedSession(
        route.tenant,
        requestToken(request, route.tenant.slug),
    );
    if (!authenticated)
        return NextResponse.json(
            { error: "Não autenticado." },
            { status: 401 },
        );
    const mutationContext = {
        ...contextData,
        sessionId: authenticated.sessionId,
    };
    if (endpoint === "admin/users")
        return execute(
            () =>
                users.createTenantUser(
                    route.tenant,
                    authenticated.user,
                    body,
                    mutationContext,
                ),
            201,
        );
    if (endpoint === "admin/clients")
        return execute(
            () =>
                clients.createAdministrativeClient(
                    route.tenant,
                    authenticated.user,
                    body,
                    mutationContext,
                ),
            201,
        );
    if (endpoint === "admin/products")
        return execute(
            () => catalog.createProduct(route.tenant, authenticated.user, body),
            201,
        );
    if (endpoint === "clients")
        return execute(
            () =>
                clients.createTenantClient(
                    route.tenant,
                    authenticated.user,
                    body,
                    mutationContext,
                ),
            201,
        );
    if (path[0] === "clients" && path[1] && path[2] === "create-login") {
        return execute(() =>
            clients.createClientLogin(
                route.tenant,
                authenticated.user,
                path[1],
                body,
                mutationContext,
            ),
        );
    }
    if (endpoint === "sessions")
        return execute(
            () =>
                orders.createOrderSession(
                    route.tenant,
                    authenticated.user,
                    body,
                    mutationContext,
                ),
            201,
        );
    if (endpoint === "order-books")
        return execute(
            () => orders.createOrderBook(route.tenant, authenticated.user, body),
            201,
        );
    if (endpoint === "order-books/active")
        return execute(() => orders.activeOrderBook(route.tenant, authenticated.user));
    if (path[0] === "sessions" && path[1] && path[2] === "payment-link") {
        return execute(() =>
            orders.createPaymentLink(
                route.tenant,
                authenticated.user,
                path[1],
                publicOrigin(request),
            ),
        );
    }
    if (path[0] === "sessions" && path[1] && path[2] === "finalize") {
        return execute(() =>
            orders.finalizeOrderSession(
                route.tenant,
                authenticated.user,
                path[1],
                body,
            ),
        );
    }
    if (endpoint === "orders")
        return execute(() =>
            orders.createCustomerOrder(route.tenant, authenticated.user, body),
        );
    if (endpoint === "push/subscriptions")
        return execute(async () => {
            await pushNotifications.registerPushSubscription(route.tenant, authenticated.user, body);
            return { ok: true };
        }, 201);
    if (endpoint === "admin/home-ai")
        return execute(() =>
            home.generateHome(route.tenant, authenticated.user, body),
        );
    return NextResponse.json(
        { error: "Rota não encontrada." },
        { status: 404 },
    );
}

export async function PUT(
    request: NextRequest,
    context: RouteContext,
): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    const path = route.params.path;
    const endpoint = path.join("/");
    const authenticated = await authentication.getAuthenticatedSession(
        route.tenant,
        requestToken(request, route.tenant.slug),
    );
    if (!authenticated)
        return NextResponse.json(
            { error: "Não autenticado." },
            { status: 401 },
        );
    const body = (await request.json().catch(() => null)) as Record<
        string,
        unknown
    > | null;
    if (!body)
        return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
    const mutationContext = {
        ...auditContext(request),
        sessionId: authenticated.sessionId,
    };

    if (endpoint === "discounts")
        return execute(() =>
            settings.replaceDiscounts(route.tenant, authenticated.user, body),
        );
    if (endpoint === "highlights")
        return execute(() =>
            settings.replaceHighlights(route.tenant, authenticated.user, body),
        );
    if (endpoint === "home-sections")
        return execute(() =>
            settings.replaceHomeSections(
                route.tenant,
                authenticated.user,
                body,
            ),
        );
    if (endpoint === "similar-products-settings")
        return execute(() =>
            settings.replaceSimilarProductsSettings(
                route.tenant,
                authenticated.user,
                body,
            ),
        );
    if (endpoint === "store-settings")
        return execute(() =>
            settings.replaceStoreSettings(
                route.tenant,
                authenticated.user,
                body,
            ),
        );
    if (endpoint === "catalog-order")
        return execute(() =>
            catalog.replaceCatalogOrder(route.tenant, authenticated.user, body),
        );
    if (endpoint === "product-overrides")
        return execute(() =>
            catalog.replaceProductOverrides(
                route.tenant,
                authenticated.user,
                body,
            ),
        );
    if (path[0] === "admin" && path[1] === "users" && path[2]) {
        return execute(() =>
            users.updateTenantUser(
                route.tenant,
                authenticated.user,
                path[2],
                body,
            ),
        );
    }
    if (path[0] === "admin" && path[1] === "classifications" && path[2]) {
        return execute(() =>
            catalog.setClassificationActive(
                route.tenant,
                authenticated.user,
                path[2],
                body,
            ),
        );
    }
    if (path[0] === "admin" && path[1] === "clients" && path[2]) {
        return execute(() =>
            clients.updateAdministrativeClient(
                route.tenant,
                authenticated.user,
                path[2],
                body,
            ),
        );
    }
    if (path[0] === "clients" && path[1] && path[2] === "cart") {
        if (!Array.isArray(body.items))
            return NextResponse.json(
                { error: "Corpo inválido." },
                { status: 400 },
            );
        const items = body.items;
        return execute(async () => {
            await clients.saveClientCart(
                route.tenant,
                authenticated.user,
                path[1],
                items,
                mutationContext,
            );
            return { ok: true };
        });
    }
    if (path[0] === "clients" && path[1]) {
        return execute(async () => {
            const updated = await clients.updateTenantClient(
                route.tenant,
                authenticated.user,
                path[1],
                body,
                mutationContext,
            );
            if (!updated) throw new NotFoundError("CLIENT_NOT_FOUND");
            return updated;
        });
    }
    if (path[0] === "sessions" && path[1]) {
        return execute(() =>
            orders.updateSession(
                route.tenant,
                authenticated.user,
                path[1],
                body,
            ),
        );
    }
    if (path[0] === "order-books" && path[1] && path[2] === "activate") {
        return execute(() =>
            orders.activateOrderBook(route.tenant, authenticated.user, path[1]),
        );
    }
    return NextResponse.json(
        { error: "Rota não encontrada." },
        { status: 404 },
    );
}

export async function DELETE(
    request: NextRequest,
    context: RouteContext,
): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    const authenticated = await authentication.getAuthenticatedSession(
        route.tenant,
        requestToken(request, route.tenant.slug),
    );
    if (!authenticated)
        return NextResponse.json(
            { error: "Não autenticado." },
            { status: 401 },
        );
    const [area, resource, id] = route.params.path;
    if (area === "admin" && resource === "users" && id) {
        return execute(async () => {
            await users.deleteTenantUser(route.tenant, authenticated.user, id);
            return { ok: true };
        });
    }
    return NextResponse.json(
        { error: "Rota não encontrada." },
        { status: 404 },
    );
}

export async function PATCH(
    request: NextRequest,
    context: RouteContext,
): Promise<Response> {
    const route = await resolveTenantRoute(request, context.params);
    if (isTenantRouteError(route)) return route;
    const path = route.params.path;
    const authenticated = await authentication.getAuthenticatedSession(route.tenant, requestToken(request, route.tenant.slug));
    if (!authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    if (path[0] === "notifications" && path[1] === "read-all") {
        return execute(async () => ({ marked: await pushNotifications.readAllNotifications(route.tenant, authenticated.user) }));
    }
    if (path[0] === "notifications" && path[1] && path[2] === "read") {
        return execute(async () => ({ ok: await pushNotifications.readNotification(route.tenant, authenticated.user, path[1]) }));
    }
    return NextResponse.json({ error: "Rota não encontrada." }, { status: 404 });
}
