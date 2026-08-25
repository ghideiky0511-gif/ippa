// Erros públicos do client TOTVS Moda — espelha errors.py.

import type { NonRetryableErpOrderError } from "@/erp/types";

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

// TOTVS recusou a operação por regra de negócio (4xx que não é auth nem
// "não encontrado") — a resposta explica por que, mas repetir a MESMA
// chamada não muda o resultado (só um payload diferente mudaria). Ex.: a
// doc de CancelOrderInDto avisa "somente os pedidos que ainda não foram
// aceitos na retaguarda podem ser cancelados" — um 400 aí é definitivo, não
// uma instabilidade passageira. Implementa NonRetryableErpOrderError (ver
// erp/types.ts) para orderPushService reconhecer isso sem conhecer TOTVS:
// não tenta de novo, e sobretudo não segue de cancelar direto para criar um
// pedido novo por cima (duplicaria reserva de estoque).
export class TotvsModaOrderRejectedError extends TotvsModaClientError implements NonRetryableErpOrderError {
    readonly nonRetryable = true as const;

    constructor(message: string, options: TotvsModaClientErrorOptions = {}) {
        super(message, options);
        this.name = "TotvsModaOrderRejectedError";
    }
}
