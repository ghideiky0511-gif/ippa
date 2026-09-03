// Erros públicos dos clients de bippa-auth/bippa-messaging -- espelha
// backend/src/whatsapp/errors.ts (que por sua vez espelha
// erp/providers/totvsmoda/errors.ts). Um único conjunto de classes serve os
// dois transportes (bippaAuthClient e bippaMessagingClient): ambos falam
// HTTP JSON com o mesmo serviço central (bippa-messaging/bippa-auth), então
// não há razão para duplicar hierarquia de erro por client.

export interface BippaMessagingClientErrorOptions {
    statusCode?: number;
    endpoint?: string;
    payload?: unknown;
}

export class BippaMessagingClientError extends Error {
    readonly statusCode?: number;
    readonly endpoint?: string;
    readonly payload?: unknown;

    constructor(message: string, options: BippaMessagingClientErrorOptions = {}) {
        super(message);
        this.name = "BippaMessagingClientError";
        this.statusCode = options.statusCode;
        this.endpoint = options.endpoint;
        this.payload = options.payload;
    }
}

// Token ausente, expirado ou recusado (401/403) -- tanto do bippa-auth
// (client_credentials recusado) quanto do bippa-messaging (bearer inválido
// ou sem escopo messaging:write).
export class BippaMessagingAuthError extends BippaMessagingClientError {
    constructor(message: string, options: BippaMessagingClientErrorOptions = {}) {
        super(message, options);
        this.name = "BippaMessagingAuthError";
    }
}

// Falha de rede, DNS, TLS ou timeout antes de uma resposta HTTP válida.
export class BippaMessagingTransportError extends BippaMessagingClientError {
    constructor(message: string, options: BippaMessagingClientErrorOptions = {}) {
        super(message, options);
        this.name = "BippaMessagingTransportError";
    }
}

// Resposta HTTP com corpo que não é JSON válido, quando um corpo era
// esperado.
export class BippaMessagingResponseError extends BippaMessagingClientError {
    constructor(message: string, options: BippaMessagingClientErrorOptions = {}) {
        super(message, options);
        this.name = "BippaMessagingResponseError";
    }
}
