import { BippaMessagingAuthError, BippaMessagingClientError } from "@/messaging/errors";
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
export function senderProfileKeyForSeller(tenantId: string, sellerId: string): string {
    return `catalogo:${tenantId}:${sellerId}`;
}

// Idem, para o external_reference (source_reference) que o bippa-messaging
// usa para reconhecer "qual conexão é esta" -- um tenant agora pode ter
// várias (uma por vendedora), então tenantId sozinho não basta mais.
export function externalReferenceForSeller(tenantId: string, sellerId: string): string {
    return `${tenantId}:${sellerId}`;
}

// Traduz qualquer falha do bippa-messaging (ou de rede/timeout) numa
// ValidationError com mensagem clara -- nunca deixa um erro genérico vazar
// para a rota. Quando a falha já é um BippaMessagingClientError, sua
// mensagem (vinda do serviço externo, ex.: "instalação pertence a outra
// organização") é preservada; qualquer outra coisa cai no fallback genérico.
export function mapBippaMessagingError(exc: unknown, code: string, fallbackMessage: string): ValidationError {
    const message =
        exc instanceof BippaMessagingAuthError
            ? AUTH_ERROR_MESSAGE
            : exc instanceof BippaMessagingClientError
              ? exc.message
              : fallbackMessage;
    return new ValidationError(code, message);
}
