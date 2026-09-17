import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser } from "@/lib/types";
import { errorMeta, logger } from "@/lib/logger";
import { getApiKey } from "@/messaging/bippaAuthClient";
import * as bippaMessagingClient from "@/messaging/bippaMessagingClient";
import { BippaMessagingClientError } from "@/messaging/errors";
import { toWaId } from "@/messaging/payloadBuilders";
import {
    findClientRow,
    findClientRowsByIds,
    findClientRowsByWhatsAppPhones,
    type ClientRow,
} from "@/models/clientsModel";
import { listActiveCommercialGroupMembershipsByClientIdsRow } from "@/models/commercialGroupMembersModel";
import { listCommercialGroupRowsByIds } from "@/models/commercialGroupsModel";
import {
    insertWhatsAppChatSendAttemptRow,
    markWhatsAppChatSendAttemptFailed,
    markWhatsAppChatSendAttemptSent,
} from "@/models/whatsappChatSendAttemptsModel";
import {
    findWhatsAppContactLinkRow,
    listWhatsAppContactLinkRowsByConversationIds,
    touchWhatsAppContactLinkPhoneRow,
    upsertWhatsAppContactLinkRow,
    type WhatsAppContactLinkRow,
} from "@/models/whatsappContactLinksModel";
import {
    LinkCrmConversationClientInputSchema,
    SendCrmTemplateInputSchema,
    SendCrmTextInputSchema,
    type CrmConversation,
    type CrmConversationsPage,
    type CrmMessage,
    type CrmMessagesPage,
    type CrmServiceWindow,
    type SendCrmMessageResult,
} from "@/contracts/crm";
import {
    recordAuditEvent,
    WHATSAPP_INTEGRATION_AUDIT_ACTIONS,
    type AuditRequestContext,
} from "@/services/audit";
import { toCommercialGroup } from "@/services/commercialGroups/commercialGroupMapper";
import { toClient } from "@/services/clients/clientMapper";
import { maskWhatsAppPhone } from "@/services/orders/orderWhatsAppService";
import { standardWhatsAppTemplate } from "@/services/whatsapp/whatsappTemplates";
import { mapBippaMessagingError } from "@/services/whatsapp/whatsappServiceErrors";
import { ForbiddenError, NotFoundError, ValidationError } from "@/services/shared/errors";
import { requireCrmAccess, resolveVisibleInboxes, type CrmInboxScope } from "./crmAuthorization";

// Camada de negócio da aba Conversas do CRM: enriquece a inbox do
// bippa-messaging (conteúdo/registro de conversa) com o cliente e o grupo
// comercial do catálogo, dentro do escopo de vendedora/admin resolvido por
// crmAuthorization.ts. Nunca guarda conteúdo de mensagem -- só o vínculo
// (whatsapp_contact_links) e o log de tentativas de envio
// (whatsapp_chat_send_attempts), ver migration 072.

const DEFAULT_PAGE_LIMIT = 25;
const MAX_PAGE_LIMIT = 100;
// Teto explícito de páginas upstream por chamada -- protege contra um
// laço longo quando o tenant tem muitos WABAs e a maioria das conversas
// upstream pertence a inboxes fora do escopo do usuário (ver Restrição 2 do
// plano). Ultrapassar isso não perde dados: o cursor devolvido continua
// válido, só exige um "carregar mais" extra da UI.
const MAX_UPSTREAM_PAGES = 5;

function clampLimit(value: number | undefined): number {
    if (!value || !Number.isFinite(value)) return DEFAULT_PAGE_LIMIT;
    return Math.min(MAX_PAGE_LIMIT, Math.max(1, Math.trunc(value)));
}

// O bippa-messaging devolve phone_number como dígitos normalizados (com
// código de país, sem "+") -- diferente de WhatsAppPhoneSchema
// (contracts/shared.ts), que ASSUME Brasil quando não há "+". Aqui os
// dígitos já vêm completos da Meta, então só prefixar "+" basta para bater
// com clients.whatsapp_phone (E.164).
function toE164FromWaDigits(digits: string | null): string | null {
    if (!digits) return null;
    const trimmed = digits.replace(/\D/g, "");
    return trimmed ? `+${trimmed}` : null;
}

export interface ListCrmConversationsInput {
    phoneId?: string;
    status?: "open" | "closed";
    phoneNumber?: string;
    cursor?: string;
    limit?: number;
}

export async function listCrmConversations(
    tenant: Tenant,
    user: AuthUser,
    input: ListCrmConversationsInput,
): Promise<CrmConversationsPage> {
    requireCrmAccess(user);
    const limit = clampLimit(input.limit);

    const inboxes = await withTenantTransaction(tenant, user, (client) =>
        resolveVisibleInboxes(client, user),
    );
    if (inboxes.length === 0) {
        return { data: [], page: { limit, hasMore: false, nextCursor: null } };
    }
    if (input.phoneId && !inboxes.some((inbox) => inbox.phoneId === input.phoneId)) {
        throw new ForbiddenError();
    }
    const allowedPhoneIds = new Set(
        input.phoneId ? [input.phoneId] : inboxes.map((inbox) => inbox.phoneId),
    );
    const inboxByPhoneId = new Map(inboxes.map((inbox) => [inbox.phoneId, inbox]));

    const collected: bippaMessagingClient.ConversationEntry[] = [];
    let cursor = input.cursor;
    let hasMore = false;
    let nextCursor: string | null = null;

    try {
        for (let pageIndex = 0; pageIndex < MAX_UPSTREAM_PAGES; pageIndex += 1) {
            if (collected.length >= limit) break;
            const response = await bippaMessagingClient.listConversations(getApiKey(), {
                sourceReference: tenant.id,
                status: input.status,
                phoneNumber: input.phoneNumber,
                cursor,
                // Sempre pede o máximo upstream, independente do `limit`
                // pedido pela UI -- filtrar por phone_id é feito aqui, então
                // pedir pouco upstream só aumentaria o número de idas e
                // voltas para juntar `limit` itens do escopo do usuário.
                limit: MAX_PAGE_LIMIT,
            });
            for (const entry of response.data) {
                if (entry.phoneId && allowedPhoneIds.has(entry.phoneId)) collected.push(entry);
            }
            // NUNCA fatiar `collected` para caber exatamente em `limit`: o
            // cursor upstream avança por PÁGINA, não por item individual --
            // cortar itens já recebidos de uma página só parcialmente
            // consumida os perderia para sempre (a próxima chamada
            // retomaria depois da página inteira, pulando o que foi
            // descartado). Prefere devolver um pouco mais que `limit`
            // quando a última página upstream processada trouxer vários
            // itens do escopo, a perder itens silenciosamente.
            hasMore = response.page.hasMore;
            nextCursor = response.page.nextCursor;
            if (!hasMore || !nextCursor) break;
            cursor = nextCursor;
        }
    } catch (exc) {
        logger.error("crm-conversations", "Falha ao listar conversas no bippa-messaging", {
            tenantId: tenant.id,
            ...errorMeta(exc),
        });
        throw mapBippaMessagingError(
            exc,
            "CRM_CONVERSATIONS_UNAVAILABLE",
            "Não foi possível carregar as conversas.",
        );
    }

    const data = await enrichConversations(tenant, user, collected, inboxByPhoneId);
    return { data, page: { limit, hasMore, nextCursor: hasMore ? nextCursor : null } };
}

async function enrichConversations(
    tenant: Tenant,
    user: AuthUser,
    entries: bippaMessagingClient.ConversationEntry[],
    inboxByPhoneId: Map<string, CrmInboxScope>,
): Promise<CrmConversation[]> {
    if (entries.length === 0) return [];

    return withTenantTransaction(tenant, user, async (client) => {
        const conversationIds = entries.map((entry) => entry.id);
        const existingLinks = await listWhatsAppContactLinkRowsByConversationIds(client, conversationIds);
        const linkByConversationId = new Map<string, WhatsAppContactLinkRow>(
            existingLinks.map((link) => [link.conversation_id, link]),
        );

        // Só re-resolve conversas SEM vínculo ou com vínculo 'auto' -- um
        // vínculo 'manual' já é a decisão final da operadora, nunca
        // sobrescrita automaticamente aqui.
        const needsAutoResolve = entries.filter((entry) => {
            const link = linkByConversationId.get(entry.id);
            return !link || link.link_source === "auto";
        });
        const phonesToLookup = [
            ...new Set(
                needsAutoResolve
                    .map((entry) => toE164FromWaDigits(entry.phoneNumber))
                    .filter((phone): phone is string => Boolean(phone)),
            ),
        ];
        const candidateRows = phonesToLookup.length > 0
            ? await findClientRowsByWhatsAppPhones(client, phonesToLookup)
            : [];
        const candidatesByPhone = new Map<string, ClientRow[]>();
        for (const row of candidateRows) {
            if (!row.whatsapp_phone) continue;
            const list = candidatesByPhone.get(row.whatsapp_phone) ?? [];
            list.push(row);
            candidatesByPhone.set(row.whatsapp_phone, list);
        }

        const resolvedLinkByConversationId = new Map(linkByConversationId);
        const linkCandidatesByConversationId = new Map<string, ClientRow[]>();

        for (const entry of needsAutoResolve) {
            if (!entry.phoneId) continue;
            const phoneE164 = toE164FromWaDigits(entry.phoneNumber);
            if (!phoneE164) continue;
            const candidates = candidatesByPhone.get(phoneE164) ?? [];
            if (candidates.length === 1) {
                const updated = await upsertWhatsAppContactLinkRow(client, {
                    conversationId: entry.id,
                    phoneId: entry.phoneId,
                    phoneE164,
                    clientId: candidates[0].id,
                    linkSource: "auto",
                    linkedBy: null,
                });
                resolvedLinkByConversationId.set(entry.id, updated);
            } else {
                const touched = await touchWhatsAppContactLinkPhoneRow(
                    client,
                    entry.id,
                    entry.phoneId,
                    phoneE164,
                );
                resolvedLinkByConversationId.set(entry.id, touched);
                if (candidates.length > 1) linkCandidatesByConversationId.set(entry.id, candidates);
            }
        }

        const linkedClientIds = [
            ...new Set(
                [...resolvedLinkByConversationId.values()]
                    .map((link) => link.client_id)
                    .filter((id): id is string => Boolean(id)),
            ),
        ];
        const clientRows = linkedClientIds.length > 0
            ? await findClientRowsByIds(client, linkedClientIds)
            : [];
        const clientById = new Map(clientRows.map((row) => [row.id, row]));

        const memberships = linkedClientIds.length > 0
            ? await listActiveCommercialGroupMembershipsByClientIdsRow(client, linkedClientIds)
            : [];
        const groupIdByClientId = new Map(memberships.map((member) => [member.client_id, member.group_id]));
        const groupIds = [...new Set(memberships.map((member) => member.group_id))];
        const groupRows = groupIds.length > 0
            ? await listCommercialGroupRowsByIds(client, groupIds)
            : [];
        const groupById = new Map(groupRows.map((row) => [row.id, row]));

        return entries.map((entry): CrmConversation => {
            const inbox = entry.phoneId ? inboxByPhoneId.get(entry.phoneId) : undefined;
            const link = resolvedLinkByConversationId.get(entry.id) ?? null;
            const clientRow = link?.client_id ? clientById.get(link.client_id) ?? null : null;
            const groupId = clientRow ? groupIdByClientId.get(clientRow.id) : undefined;
            const groupRow = groupId ? groupById.get(groupId) ?? null : null;
            const candidates = linkCandidatesByConversationId.get(entry.id);
            return {
                id: entry.id,
                status: entry.status === "closed" ? "closed" : "open",
                phoneNumber: entry.phoneNumber,
                contactName: entry.contactName,
                preview: entry.preview,
                lastInboundAt: entry.lastInboundAt,
                updatedAt: entry.updatedAt,
                sellerId: inbox?.sellerId ?? "",
                sellerName: inbox?.sellerName ?? "",
                client: clientRow ? toClient(clientRow) : null,
                commercialGroup: groupRow ? toCommercialGroup(groupRow) : null,
                linkSource: link?.link_source ?? null,
                linkCandidates: candidates ? candidates.map(toClient) : undefined,
            };
        });
    });
}

interface KnownConversationScope {
    phoneId: string;
    phoneE164: string;
    sellerId: string;
}

// Único ponto de resolução de phoneId/sellerId a partir de um conversationId
// isolado -- nenhuma rota do bippa-messaging devolve o dono (phone_id) de
// uma conversa só a partir do id (ver comentário na migration 072). Se a
// conversa nunca foi vista por listCrmConversations nesta organização (sem
// linha local), nega o acesso em vez de adivinhar -- fecha o caminho de uma
// vendedora tentar ler/responder a conversa de outra forjando um id.
async function requireKnownConversationScope(
    tenant: Tenant,
    user: AuthUser,
    conversationId: string,
): Promise<KnownConversationScope> {
    requireCrmAccess(user);
    return withTenantTransaction(tenant, user, async (client) => {
        const link = await findWhatsAppContactLinkRow(client, conversationId);
        if (!link) {
            throw new NotFoundError(
                "CRM_CONVERSATION_NOT_FOUND",
                "Conversa não encontrada. Abra-a a partir da lista de conversas antes de tentar de novo.",
            );
        }
        const inboxes = await resolveVisibleInboxes(client, user);
        const inbox = inboxes.find((entry) => entry.phoneId === link.phone_id);
        if (!inbox) throw new ForbiddenError();
        return { phoneId: link.phone_id, phoneE164: link.phone_e164, sellerId: inbox.sellerId };
    });
}

export interface ListCrmMessagesInput {
    direction?: "inbound" | "outbound";
    cursor?: string;
    limit?: number;
}

export async function listCrmMessages(
    tenant: Tenant,
    user: AuthUser,
    conversationId: string,
    input: ListCrmMessagesInput,
): Promise<CrmMessagesPage> {
    await requireKnownConversationScope(tenant, user, conversationId);
    try {
        const response = await bippaMessagingClient.listConversationMessages(getApiKey(), {
            sourceReference: tenant.id,
            conversationId,
            direction: input.direction,
            cursor: input.cursor,
            limit: clampLimit(input.limit),
        });
        const data: CrmMessage[] = response.data.map((message) => {
            const metadata = message.metadata;
            const retained = Boolean(
                metadata && typeof metadata === "object" && (metadata as Record<string, unknown>).retained === true,
            );
            return {
                id: message.id,
                conversationId: message.conversationId,
                direction: message.direction,
                type: message.type,
                providerMessageId: message.providerMessageId,
                body: message.body,
                metadata: message.metadata,
                occurredAt: message.occurredAt,
                contentPurged: retained,
            };
        });
        return {
            data,
            page: {
                limit: response.page.limit,
                hasMore: response.page.hasMore,
                nextCursor: response.page.nextCursor,
            },
        };
    } catch (exc) {
        logger.error("crm-conversations", "Falha ao listar mensagens da conversa", {
            tenantId: tenant.id,
            conversationId,
            ...errorMeta(exc),
        });
        throw mapBippaMessagingError(
            exc,
            "CRM_MESSAGES_UNAVAILABLE",
            "Não foi possível carregar as mensagens desta conversa.",
        );
    }
}

export async function getCrmServiceWindow(
    tenant: Tenant,
    user: AuthUser,
    conversationId: string,
): Promise<CrmServiceWindow> {
    const scope = await requireKnownConversationScope(tenant, user, conversationId);
    try {
        const status = await bippaMessagingClient.getServiceWindow(getApiKey(), {
            sourceReference: tenant.id,
            sellerReference: scope.sellerId,
            recipient: toWaId(scope.phoneE164),
        });
        return {
            withinWindow: status.withinWindow,
            lastInboundAt: status.lastInboundAt,
            expiresAt: status.expiresAt,
        };
    } catch (exc) {
        logger.error("crm-conversations", "Falha ao consultar a janela de atendimento", {
            tenantId: tenant.id,
            conversationId,
            ...errorMeta(exc),
        });
        throw mapBippaMessagingError(
            exc,
            "CRM_SERVICE_WINDOW_UNAVAILABLE",
            "Não foi possível consultar a janela de atendimento.",
        );
    }
}

const OUTSIDE_WINDOW_MESSAGE =
    "A janela de atendimento de 24h da Meta está fechada para este contato. Envie um template aprovado.";

function isOutsideServiceWindowError(exc: unknown): boolean {
    return exc instanceof BippaMessagingClientError && exc.statusCode === 422;
}

export async function sendCrmText(
    tenant: Tenant,
    user: AuthUser,
    conversationId: string,
    body: unknown,
    context: AuditRequestContext,
): Promise<SendCrmMessageResult> {
    const parsed = SendCrmTextInputSchema.safeParse(body);
    if (!parsed.success) {
        throw new ValidationError("INVALID_INPUT", "Mensagem inválida.", parsed.error.issues);
    }
    const scope = await requireKnownConversationScope(tenant, user, conversationId);
    const toMasked = maskWhatsAppPhone(scope.phoneE164);

    const attempt = await withTenantTransaction(tenant, user, (client) =>
        insertWhatsAppChatSendAttemptRow(client, {
            conversationId,
            sellerId: scope.sellerId,
            kind: "text",
            toMasked,
            actorId: user.id,
            actorRole: user.role,
            actorName: user.name,
        }),
    );
    // idempotencyKey nasce do id desta linha, já persistido -- nunca de
    // hora atual ou do clique em si (ver chat-backend-integration.md).
    const idempotencyKey = `bippa-catalogo:${tenant.id}:chat:${conversationId}:text:${attempt.id}`;

    try {
        const dispatch = await bippaMessagingClient.replyToConversation(getApiKey(), {
            sourceReference: tenant.id,
            conversationId,
            sellerReference: scope.sellerId,
            recipient: toWaId(scope.phoneE164),
            idempotencyKey,
            text: parsed.data.text,
        });
        await withTenantTransaction(tenant, user, async (client) => {
            await markWhatsAppChatSendAttemptSent(client, attempt.id, dispatch.id, null);
            await recordAuditEvent(client, {
                action: WHATSAPP_INTEGRATION_AUDIT_ACTIONS.CHAT_MESSAGE_SENT,
                entityId: attempt.id,
                actor: user,
                context,
                metadata: { conversationId, kind: "text" },
            });
        });
        return { attemptId: attempt.id, status: "sent", dispatchId: dispatch.id };
    } catch (exc) {
        // mapBippaMessagingError já resolve a mensagem certa por tipo de
        // erro (auth/cliente/fallback, ver whatsappServiceErrors.ts) -- só
        // sobrepomos para o caso específico de janela fechada, que aqui tem
        // uma mensagem mais acionável que o texto genérico da Meta/422.
        const mapped = isOutsideServiceWindowError(exc)
            ? new ValidationError("CRM_MESSAGE_SEND_FAILED", OUTSIDE_WINDOW_MESSAGE)
            : mapBippaMessagingError(exc, "CRM_MESSAGE_SEND_FAILED", "Não foi possível enviar a mensagem.");
        await withTenantTransaction(tenant, user, (client) =>
            markWhatsAppChatSendAttemptFailed(client, attempt.id, mapped.message),
        );
        logger.error("crm-conversations", "Falha ao enviar texto pela conversa", {
            tenantId: tenant.id,
            conversationId,
            ...errorMeta(exc),
        });
        throw mapped;
    }
}

export async function sendCrmTemplate(
    tenant: Tenant,
    user: AuthUser,
    conversationId: string,
    body: unknown,
    context: AuditRequestContext,
): Promise<SendCrmMessageResult> {
    const parsed = SendCrmTemplateInputSchema.safeParse(body);
    if (!parsed.success) {
        throw new ValidationError("INVALID_INPUT", "Template inválido.", parsed.error.issues);
    }

    // A definição real do template (nome/idioma na Meta, se tem botão de
    // link, ordem das variáveis do body) vem sempre do catálogo do
    // backend -- nunca do navegador. Os dois templates hoje cadastrados
    // (order_confirmed, payment_link) têm botão de link dinâmico (ver
    // whatsappTemplates.ts): sem `buttonParam`, o atalho genérico
    // `kind: "template"`/`params` (POST /v1/dispatches) só preenche
    // body/header e deixaria o botão sem destino -- por isso o branch por
    // `definition.button` abaixo, em vez de sempre usar o atalho genérico.
    const definition = standardWhatsAppTemplate(parsed.data.templateKey);
    if (definition.button && !parsed.data.buttonParam) {
        throw new ValidationError(
            "INVALID_INPUT",
            "Este template tem um botão de link -- informe o destino antes de enviar.",
        );
    }
    const bodyParams = definition.parameters
        .filter((parameter) => parameter.component === "body")
        .map((parameter) => parsed.data.params[parameter.key]?.trim());
    if (bodyParams.some((value) => !value)) {
        throw new ValidationError("INVALID_INPUT", "Preencha todas as variáveis do template.");
    }

    const scope = await requireKnownConversationScope(tenant, user, conversationId);
    const toMasked = maskWhatsAppPhone(scope.phoneE164);

    const attempt = await withTenantTransaction(tenant, user, (client) =>
        insertWhatsAppChatSendAttemptRow(client, {
            conversationId,
            sellerId: scope.sellerId,
            kind: "template",
            toMasked,
            templateKey: parsed.data.templateKey,
            actorId: user.id,
            actorRole: user.role,
            actorName: user.name,
        }),
    );
    const idempotencyKey = `bippa-catalogo:${tenant.id}:chat:${conversationId}:template:${attempt.id}`;

    try {
        const dispatch = definition.button
            ? await bippaMessagingClient.dispatchTemplateWithUrlButton(getApiKey(), {
                  sourceReference: tenant.id,
                  sellerReference: scope.sellerId,
                  to: toWaId(scope.phoneE164),
                  idempotencyKey,
                  templateName: definition.name,
                  languageCode: definition.languageCode,
                  bodyParams: bodyParams as string[],
                  buttonParam: parsed.data.buttonParam as string,
              })
            : await bippaMessagingClient.dispatchTemplateMessage(getApiKey(), {
                  sourceReference: tenant.id,
                  sellerReference: scope.sellerId,
                  to: toWaId(scope.phoneE164),
                  idempotencyKey,
                  templateKey: parsed.data.templateKey,
                  params: Object.fromEntries(bodyParams.map((value, index) => [String(index + 1), value as string])),
              });
        await withTenantTransaction(tenant, user, async (client) => {
            await markWhatsAppChatSendAttemptSent(client, attempt.id, dispatch.id, null);
            await recordAuditEvent(client, {
                action: WHATSAPP_INTEGRATION_AUDIT_ACTIONS.CHAT_MESSAGE_SENT,
                entityId: attempt.id,
                actor: user,
                context,
                metadata: { conversationId, kind: "template", templateKey: parsed.data.templateKey },
            });
        });
        return { attemptId: attempt.id, status: "sent", dispatchId: dispatch.id };
    } catch (exc) {
        const mapped = mapBippaMessagingError(exc, "CRM_TEMPLATE_SEND_FAILED", "Não foi possível enviar o template.");
        await withTenantTransaction(tenant, user, (client) =>
            markWhatsAppChatSendAttemptFailed(client, attempt.id, mapped.message),
        );
        logger.error("crm-conversations", "Falha ao enviar template pela conversa", {
            tenantId: tenant.id,
            conversationId,
            templateKey: parsed.data.templateKey,
            ...errorMeta(exc),
        });
        throw mapped;
    }
}

export async function linkCrmConversationClient(
    tenant: Tenant,
    user: AuthUser,
    conversationId: string,
    body: unknown,
    context: AuditRequestContext,
): Promise<{ clientId: string | null }> {
    requireCrmAccess(user);
    const parsed = LinkCrmConversationClientInputSchema.safeParse(body);
    if (!parsed.success) {
        throw new ValidationError("INVALID_INPUT", "Cliente inválido.", parsed.error.issues);
    }

    return withTenantTransaction(tenant, user, async (client) => {
        const link = await findWhatsAppContactLinkRow(client, conversationId);
        if (!link) {
            throw new NotFoundError(
                "CRM_CONVERSATION_NOT_FOUND",
                "Conversa não encontrada. Abra-a a partir da lista de conversas antes de tentar de novo.",
            );
        }
        const inboxes = await resolveVisibleInboxes(client, user);
        if (!inboxes.some((inbox) => inbox.phoneId === link.phone_id)) throw new ForbiddenError();

        if (parsed.data.clientId) {
            const target = await findClientRow(client, parsed.data.clientId);
            if (!target) throw new NotFoundError("CLIENT_NOT_FOUND");
        }

        const updated = await upsertWhatsAppContactLinkRow(client, {
            conversationId,
            phoneId: link.phone_id,
            phoneE164: link.phone_e164,
            clientId: parsed.data.clientId,
            linkSource: "manual",
            linkedBy: user.id,
        });
        await recordAuditEvent(client, {
            action: WHATSAPP_INTEGRATION_AUDIT_ACTIONS.CONVERSATION_LINKED,
            entityId: updated.id,
            actor: user,
            context,
            metadata: { conversationId, clientId: parsed.data.clientId },
        });
        return { clientId: updated.client_id };
    });
}

// Devolve o array puro (não `{ inboxes: [...] }`) -- é o que
// CrmInboxSchema/z.array(CrmInboxSchema) esperam em crmClient.ts/
// crmClient.server.ts. Lista vazia (0 conexões WhatsApp ativas) é uma
// resposta 200 normal, não um erro -- a UI mostra o estado vazio com o
// link para Integrações → WhatsApp (ver ConversationsPanel.tsx).
export async function listCrmInboxes(tenant: Tenant, user: AuthUser): Promise<CrmInboxScope[]> {
    requireCrmAccess(user);
    const inboxes = await withTenantTransaction(tenant, user, (client) =>
        resolveVisibleInboxes(client, user),
    );
    logger.info("crm", "Inboxes de WhatsApp resolvidas", {
        tenantId: tenant.id,
        userId: user.id,
        role: user.role,
        count: inboxes.length,
    });
    return inboxes;
}
