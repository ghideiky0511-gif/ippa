// Erros públicos do client TOTVS Moda — espelha errors.py.

export interface TotvsModaClientErrorOptions {
    statusCode?: number;
    endpoint?: string;
    payload?: unknown;
}

export class TotvsModaClientError extends Error {
    readonly statusCode?: number;
    readonly endpoint?: string;
    readonly payload?: unknown;

    constructor(message: string, options: TotvsModaClientErrorOptions = {}) {
        super(message);
        this.name = "TotvsModaClientError";
        this.statusCode = options.statusCode;
        this.endpoint = options.endpoint;
        this.payload = options.payload;
    }
}

// Credenciais ausentes, inválidas ou recusadas.
export class TotvsModaAuthError extends TotvsModaClientError {
    constructor(message: string, options: TotvsModaClientErrorOptions = {}) {
        super(message, options);
        this.name = "TotvsModaAuthError";
    }
}

// Falha de rede, DNS, TLS ou timeout antes de uma resposta HTTP válida.
export class TotvsModaTransportError extends TotvsModaClientError {
    constructor(message: string, options: TotvsModaClientErrorOptions = {}) {
        super(message, options);
        this.name = "TotvsModaTransportError";
    }
}

// Recurso externo não encontrado.
export class TotvsModaNotFoundError extends TotvsModaClientError {
    constructor(message: string, options: TotvsModaClientErrorOptions = {}) {
        super(message, options);
        this.name = "TotvsModaNotFoundError";
    }
}

// Resposta HTTP ou JSON incompatível com o contrato esperado.
export class TotvsModaResponseError extends TotvsModaClientError {
    constructor(message: string, options: TotvsModaClientErrorOptions = {}) {
        super(message, options);
        this.name = "TotvsModaResponseError";
    }
}
