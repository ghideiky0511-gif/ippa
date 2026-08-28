// Fábrica de ErpProvider ciente de integração: carrega o token de acesso já
// cacheado em banco (migration 054) e devolve um callback que persiste o
// próximo token emitido -- sem isto, createErpProvider (erp/registry,
// fábrica pura, sem banco/tenant) cria uma instância nova a cada chamada e
// reautentica do zero, mesmo dentro da janela de validade do token
// anterior. Só o TOTVS Moda usa isto de fato hoje (client.ts); outros
// providers simplesmente ignoram o parâmetro extra.
//
// Abre sua própria transação pra persistir o token (em vez de reaproveitar
// o client de quem chamou) porque o callback dispara de dentro de
// TotvsModaClient.authenticate(), que pode acontecer bem depois da
// transação que carregou `integration` já ter comitado (ver
// catalogSyncService.syncReferenceOnDemand, que reusa um único provider por
// várias transações curtas) -- não há um client de banco garantidamente
// aberto no momento em que o token novo chega.
import type { ExternalApiCallReporter } from "@/lib/externalApiCall";
import type { ActorContext, Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { ErpProvider } from "@/erp/types";
import { createErpProvider } from "@/erp/registry";
import { updateErpIntegrationTokenCacheRow, type ErpIntegrationRow } from "@/models/erpIntegrationsModel";

export function createErpProviderForIntegration(
    tenant: Tenant,
    actor: ActorContext,
    integration: ErpIntegrationRow,
    reporter?: ExternalApiCallReporter,
): ErpProvider {
    return createErpProvider(integration.provider, integration.credentials, reporter, {
        token: integration.cached_access_token ?? undefined,
        expiresAt: integration.cached_access_token_expires_at?.getTime(),
        onTokenIssued: (token, expiresAt) =>
            withTenantTransaction(tenant, actor, (client) =>
                updateErpIntegrationTokenCacheRow(
                    client,
                    integration.id,
                    token,
                    expiresAt ? new Date(expiresAt) : null,
                ),
            ),
    });
}
