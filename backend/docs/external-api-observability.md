# Observabilidade de chamadas a APIs externas

## Objetivo

Toda chamada HTTP para um serviço externo (ERP, feed de catálogo, etc.) deve ficar visível: quando aconteceu, quanto demorou, se teve sucesso e, se falhou, por quê. Isso alimenta duas tabelas:

- `external_api_request_log`: uma linha por requisição (provider, operação, método, endpoint, status HTTP, duração, erro).
- `external_api_provider_status`: um snapshot por `(tenant_id, provider)` com o estado atual (`operacional`, `degradado`, `indisponivel`, `manutencao`, `desconhecido`) — atualizado a cada requisição e usado para alertar administradores quando um provider transiciona para um estado problemático.

Sem isso, uma instabilidade num ERP externo só aparece quando um usuário reclama. Com isso, o painel (e o push para administradores) mostra o problema antes.

## Como funciona

A observabilidade é feita em duas camadas, para não acoplar tenant/banco ao código de transporte HTTP:

1. **Transporte (`http.ts` de cada integração)** — continua "puro": não conhece tenant nem banco. Recebe um `ExternalApiCallReporter` opcional (`src/lib/externalApiCall.ts`) e o invoca ao final de cada requisição (sucesso ou falha) com `{ operation, method, endpoint, statusCode, success, durationMs, errorMessage, errorClass, ... }`. Nunca deixa uma falha do reporter derrubar a chamada real — o `report()` interno tem seu próprio try/catch.
2. **Service com contexto de tenant** — quem instancia o client/provider (hoje `erpSyncService.ts` e `vestiCatalogService.ts`) constrói o reporter com `createExternalApiCallReporter(tenant, actor, provider)` (`src/services/erp/externalApiLogService.ts`) e passa para a fábrica/função de transporte. Essa ponte grava o log e atualiza o snapshot do provider via `logExternalApiRequest`.

```
http.ts (transporte, sem tenant)
   └─ reporter?(report)               // ExternalApiCallReporter
        └─ createExternalApiCallReporter(tenant, actor, provider)   // fechado no service
             └─ logExternalApiRequest(tenant, actor, input)
                  ├─ grava 1 linha em external_api_request_log
                  └─ atualiza snapshot em external_api_provider_status
                       └─ se houve transição para estado problemático: notifyAdmins(...)
```

`logExternalApiRequest` nunca lança: uma falha ao gravar o log não pode derrubar o fluxo de negócio que fez a chamada real.

## Cobertura atual

| Integração | Transporte | Fábrica/função exposta | Onde o reporter é fechado |
| --- | --- | --- | --- |
| TOTVS Moda (ERP) | `erp/providers/totvsmoda/http.ts` (`totvsModaRequest`) | `createTotvsModaErpProvider`, `findTotvsModaClientByDocument` | `services/erp/erpSyncService.ts` (as 4 funções `syncTenant*`) |
| Vesti (feed de catálogo) | `catalog/vesti/http.ts` (`buscarVestiCatalogXml`) | `fetchVestiCatalogFeed` | `services/platform/vestiCatalogService.ts` (`importVestiCatalog`) |

Cada chamada HTTP individual é logada — não só a operação de negócio. `syncTenantProducts`, por exemplo, gera até três linhas em `external_api_request_log` (busca de produtos, preços e saldos), porque `TotvsModaClient` recebe o reporter no construtor e o repassa para cada requisição feita por `searchProducts`/`searchProductPrices`/`searchProductBalances`.

## Como ligar uma nova função de integração

Exemplo: uma nova integração `minhaApi` com transporte próprio em `src/algum/lugar/http.ts`.

1. No transporte, aceite um `reporter?: ExternalApiCallReporter` e invoque-o depois de cada requisição, sucesso ou falha, com a duração real:

```ts
import type { ExternalApiCallReporter } from "@/lib/externalApiCall";

export async function minhaApiRequest(path: string, options: { reporter?: ExternalApiCallReporter } = {}) {
  const startedAt = Date.now();
  try {
    const response = await fetch(url);
    // ...
    await options.reporter?.({
      operation: "buscarPedido",
      method: "GET",
      endpoint: url,
      statusCode: response.status,
      success: response.ok,
      durationMs: Date.now() - startedAt,
    });
    return payload;
  } catch (exc) {
    await options.reporter?.({
      operation: "buscarPedido",
      method: "GET",
      endpoint: url,
      statusCode: null,
      success: false,
      durationMs: Date.now() - startedAt,
      errorMessage: (exc as Error).message,
      // "timeout"/"connection"/"proxy" no errorClass é o que classifica
      // a falha como "indisponivel" em vez de "desconhecido" — ver
      // classifyProviderEvent em externalApiLogService.ts.
      errorClass: exc instanceof Error && exc.name === "AbortError" ? "TimeoutError" : "ConnectionError",
    });
    throw exc;
  }
}
```

2. No service que tem `tenant`/`actor` (dentro de `withTenantTransaction` ou logo após resolver o tenant), construa o reporter e passe adiante:

```ts
import { createExternalApiCallReporter } from "@/services/erp/externalApiLogService";

const resultado = await minhaApiRequest(path, {
  reporter: createExternalApiCallReporter(tenant, actor, "minhaApi"),
});
```

3. Se a integração tiver múltiplas operações (como `TotvsModaClient`), aceite o reporter uma vez no construtor/fábrica e passe um `operation` (nome curto, ex. `"searchProducts"`) em cada chamada de transporte — não crie um reporter novo por chamada.

Não existe hoje um mecanismo que force isso em tempo de compilação: uma função nova que chama `fetch`/`axios` direto para fora do processo sem passar por um `ExternalApiCallReporter` simplesmente não aparece em `external_api_provider_status`, e uma falha silenciosa não gera alerta. Trate isso como checklist de revisão de código sempre que uma integração externa nova for adicionada.

## Regras para os campos do relatório

- `errorClass` é comparado por substring em `classifyProviderEvent` (`"timeout"`, `"connection"`, `"proxy"`) para decidir se a falha vira `indisponivel`. Ao mapear uma exceção nativa (`AbortError`, erro de socket, etc.), normalize para uma dessas palavras — não repasse `exc.name` cru se ele não contiver uma delas.
- `statusCode` é `null` para falhas de transporte (sem resposta HTTP) e o número real do HTTP status quando houve resposta, mesmo em erro (4xx/5xx).
- `responseBody`/`errorMessage` são truncados por `logExternalApiRequest` — não é preciso truncar no transporte, mas evite mandar payloads grandes (ex.: não inclua o corpo inteiro de uma resposta de sucesso).
- `requestPayload` é opcional e vira uma coluna `jsonb`; não inclua segredos (tokens, senhas) nele.
