// Erros públicos do client da WhatsApp Cloud API — espelha
// erp/providers/totvsmoda/errors.ts.

export interface WhatsAppClientErrorOptions {
    statusCode?: number;
    endpoint?: string;
    payload?: unknown;
    /** Código de erro da Meta (`error.code` no payload de erro do Graph API). */
    metaCode?: number;
    metaSubcode?: number;
}

export class WhatsAppClientError extends Error {
    readonly statusCode?: number;
    readonly endpoint?: string;
    readonly payload?: unknown;
    readonly metaCode?: number;
    readonly metaSubcode?: number;

    constructor(message: string, options: WhatsAppClientErrorOptions = {}) {
        super(message);
        this.name = "WhatsAppClientError";
        this.statusCode = options.statusCode;
        this.endpoint = options.endpoint;
        this.payload = options.payload;
        this.metaCode = options.metaCode;
        this.metaSubcode = options.metaSubcode;
    }
}

// Token ausente, expirado ou recusado pela Meta.
export class WhatsAppAuthError extends WhatsAppClientError {
    constructor(message: string, options: WhatsAppClientErrorOptions = {}) {
        super(message, options);
        this.name = "WhatsAppAuthError";
    }
}

// Falha de rede, DNS, TLS ou timeout antes de uma resposta HTTP válida.
export class WhatsAppTransportError extends WhatsAppClientError {
    constructor(message: string, options: WhatsAppClientErrorOptions = {}) {
        super(message, options);
        this.name = "WhatsAppTransportError";
    }
}

// Resposta HTTP ou JSON incompatível com o contrato esperado.
export class WhatsAppResponseError extends WhatsAppClientError {
    constructor(message: string, options: WhatsAppClientErrorOptions = {}) {
        super(message, options);
        this.name = "WhatsAppResponseError";
    }
}

