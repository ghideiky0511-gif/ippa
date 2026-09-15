import {
    BippaMessagingAuthError,
    BippaMessagingClientError,
} from "@/messaging/errors";
import { ValidationError } from "@/services/shared/errors";

// Mensagem fixa para 401/403 do bippa-messaging -- o corpo de erro desses
// casos é um texto técnico do provedor OAuth (ex.: "unauthorized",
// "invalid_client"), nunca redigido para o usuário final, e pode até
// insinuar detalhes de credencial que não deveriam aparecer na tela. Erros
// de autenticação aqui quase sempre significam que a integração ainda não
// foi configurada (env vars/credenciais do bippa-messaging), não algo que a
// administradora da loja possa resolver sozinha.
const AUTH_ERROR_MESSAGE =
    "A conexão com o WhatsApp ainda não está disponível para esta loja. Fale com o suporte para habilitar a integração.";

// Derivação compartilhada da chave de sender profile de uma vendedora no
// bippa-messaging -- SEMPRE a partir do tenant autenticado + da vendedora
// alvo (nunca de um valor vindo do corpo da requisição ou do
// bippa-messaging), garantindo isolamento entre tenants/vendedoras mesmo que
// o serviço externo aceitasse um valor arbitrário. Usada por
// whatsappOnboardingService e whatsappIntegrationService.
export function senderProfileKeyForSeller(
    tenantId: string,
    sellerId: string,
): string {
    return `catalogo:${tenantId}:${sellerId}`;
}

// Extrai meta_code/meta_subcode/meta_trace_id do corpo de erro do
// bippa-messaging (ver api-reference.md, seção Templates -- "os campos vêm
// juntos no corpo da resposta de erro sempre que a Meta devolveu esses
// dados"). Preferir isto a `errorMeta(exc).error`/`.message` para diagnosticar
// um `422 meta_graph_error`: `message` costuma ser um texto genérico da Meta
// ("Invalid parameter"), enquanto `meta_subcode` identifica a regra exata
// violada (ex.: `2388299` = variável colada na borda do BODY).
export function metaGraphErrorMeta(exc: unknown): {
    metaCode?: number;
    metaSubcode?: number;
    metaTraceId?: string;
    metaErrorDataDetails?: string;
    metaErrorUserTitle?: string;
    metaErrorUserMsg?: string;
} {
    if (!(exc instanceof BippaMessagingClientError)) return {};
    const payload = exc.payload;
    if (!payload || typeof payload !== "object") return {};
    const record = payload as Record<string, unknown>;
    return {
        metaCode:
            typeof record.meta_code === "number" ? record.meta_code : undefined,
        metaSubcode:
            typeof record.meta_subcode === "number"
                ? record.meta_subcode
                : undefined,
        metaTraceId:
            typeof record.meta_trace_id === "string"
                ? record.meta_trace_id
                : undefined,
        // `error.error_data.details` da Meta -- passou a ser repassado pelo
        // bippa-messaging (2026-09) como `meta_error_data_details` porque
        // costuma trazer a explicação exata de um subcode não documentado
        // (ex.: "param at index 3 has invalid format" para uma URL usada
        // como valor de variável do BODY, subcode 2388024).
        metaErrorDataDetails:
            typeof record.meta_error_data_details === "string"
                ? record.meta_error_data_details
                : undefined,
        // `error.error_user_title`/`error.error_user_msg` da Meta --
        // passaram a ser repassados pelo bippa-messaging (2026-09, a pedido
        // deste serviço) porque, quando a Meta os envia, tendem a nomear a
        // regra exata violada de forma mais legível que
        // `meta_error_data_details`. Nenhum dos três é garantido pela Meta
        // por subcode -- api-reference.md documenta que às vezes só vem
        // `message` genérico + `code`/`subcode`, sem nenhum dos três.
        metaErrorUserTitle:
            typeof record.meta_error_user_title === "string"
                ? record.meta_error_user_title
                : undefined,
        metaErrorUserMsg:
            typeof record.meta_error_user_msg === "string"
                ? record.meta_error_user_msg
                : undefined,
    };
}

// Corpo bruto de erro do bippa-messaging, para casos em que o código
// (`record.error`, já capturado por `errorMeta(exc).error`) não basta para
// saber qual campo falhou -- ex.: `400 invalid_request` genérico devolvido
// por validações compartilhadas entre rotas administrativas (visto em
// POST .../template-bindings), sem seção própria em api-reference.md.
// `errorMeta()` só extrai `record.error`/`error_description`/`message` (o
// primeiro que existir) para `.message` -- se o corpo trouxer os dois
// (`error` + `message` mais descritivo), o segundo se perde. Logar o
// payload inteiro aqui evita precisar pedir pro bippa-messaging reproduzir
// o erro só para saber qual campo veio vazio.
export function rawBippaMessagingPayload(exc: unknown): {
    bippaMessagingPayload?: unknown;
} {
    if (!(exc instanceof BippaMessagingClientError)) return {};
    if (exc.payload === undefined) return {};
    return { bippaMessagingPayload: exc.payload };
}

// Traduz qualquer falha do bippa-messaging (ou de rede/timeout) numa
// ValidationError com mensagem clara -- nunca deixa um erro genérico vazar
// para a rota. Quando a falha já é um BippaMessagingClientError, sua
// mensagem (vinda do serviço externo, ex.: "instalação pertence a outra
// organização") é preservada; qualquer outra coisa cai no fallback genérico.
export function mapBippaMessagingError(
    exc: unknown,
    code: string,
    fallbackMessage: string,
): ValidationError {
    const paymentsDisabled =
        exc instanceof BippaMessagingClientError &&
        exc.statusCode === 503 &&
        exc.payload &&
        typeof exc.payload === "object" &&
        (exc.payload as Record<string, unknown>).error === "payments_disabled";
    const message =
        paymentsDisabled
            ? "Os pagamentos nativos ainda não foram liberados no bippa-messaging. Confirme com o suporte se META_WHATSAPP_PAYMENTS_ENABLED está habilitada neste ambiente."
            : exc instanceof BippaMessagingAuthError
            ? AUTH_ERROR_MESSAGE
            : exc instanceof BippaMessagingClientError
              ? exc.message
              : fallbackMessage;
    return new ValidationError(code, message);
}
