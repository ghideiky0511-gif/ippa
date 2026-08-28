import type { PoolClient } from "pg";
import type { Tenant } from "@/lib/db/tenant";
import { safeRedis } from "@/lib/redis";
import { listInventoryBalanceRowsByVariantIds } from "@/models/catalogModel";

// TTL curto como rede de segurança -- o mecanismo principal de frescor é a
// invalidação ativa (chamada por quem grava em inventory_balances, ver
// applyErpInventorySnapshotRow/stockSyncService/stockGate), não o TTL.
// 90s cobre o intervalo entre um saldo mudar e a invalidação correspondente
// nunca ter sido disparada por algum caminho ainda não coberto.
const TTL_SECONDS = 90;

function cacheKey(tenantId: string, variantId: string): string {
    return `stock:${tenantId}:${variantId}`;
}

interface CachedStock {
    availableQty: number;
    asOf: number;
}

function parseCachedStock(raw: string | null): CachedStock | undefined {
    if (!raw) return undefined;
    try {
        const parsed = JSON.parse(raw) as CachedStock;
        if (typeof parsed.availableQty !== "number" || typeof parsed.asOf !== "number") return undefined;
        return parsed;
    } catch {
        return undefined;
    }
}

async function readFromPostgresAndBackfill(
    tenant: Tenant,
    client: PoolClient,
    variantIds: string[],
): Promise<Map<string, number>> {
    const rows = await listInventoryBalanceRowsByVariantIds(client, variantIds);
    const result = new Map(rows.map((row) => [row.variant_id, row.stock_qty]));
    const asOf = Date.now();
    await safeRedis(async (redis) => {
        const pipeline = redis.pipeline();
        for (const variantId of variantIds) {
            const availableQty = result.get(variantId) ?? 0;
            pipeline.setex(
                cacheKey(tenant.id, variantId),
                TTL_SECONDS,
                JSON.stringify({ availableQty, asOf } satisfies CachedStock),
            );
        }
        await pipeline.exec();
    });
    return result;
}

// Lê o saldo disponível (on_hand - reserved, somado entre locais ativos) de
// um conjunto de variantes, priorizando o cache Redis. Miss/falha de Redis
// cai pro Postgres (listInventoryBalanceRowsByVariantIds) de forma
// transparente -- Redis nunca é dependência obrigatória de leitura.
export async function getStockForVariants(
    tenant: Tenant,
    client: PoolClient,
    variantIds: string[],
): Promise<Map<string, number>> {
    if (variantIds.length === 0) return new Map();
    const result = new Map<string, number>();
    const missing: string[] = [];
    const cached = await safeRedis((redis) => redis.mget(variantIds.map((id) => cacheKey(tenant.id, id))));
    variantIds.forEach((variantId, index) => {
        const parsed = parseCachedStock(cached?.[index] ?? null);
        if (parsed) result.set(variantId, parsed.availableQty);
        else missing.push(variantId);
    });
    if (missing.length > 0) {
        const fromPostgres = await readFromPostgresAndBackfill(tenant, client, missing);
        for (const [variantId, qty] of fromPostgres) result.set(variantId, qty);
    }
    return result;
}

// Mesma leitura, mas trata uma entrada de cache mais velha que maxAgeMs como
// miss -- usada pelo gate de finalização de pedido (stockGate), que precisa
// de uma garantia de frescor mais forte do que a leitura de catálogo comum.
export async function getStockForVariantsFresh(
    tenant: Tenant,
    client: PoolClient,
    variantIds: string[],
    maxAgeMs: number,
): Promise<Map<string, number>> {
    if (variantIds.length === 0) return new Map();
    const result = new Map<string, number>();
    const missing: string[] = [];
    const cached = await safeRedis((redis) => redis.mget(variantIds.map((id) => cacheKey(tenant.id, id))));
    const now = Date.now();
    variantIds.forEach((variantId, index) => {
        const parsed = parseCachedStock(cached?.[index] ?? null);
        if (parsed && now - parsed.asOf <= maxAgeMs) result.set(variantId, parsed.availableQty);
        else missing.push(variantId);
    });
    if (missing.length > 0) {
        const fromPostgres = await readFromPostgresAndBackfill(tenant, client, missing);
        for (const [variantId, qty] of fromPostgres) result.set(variantId, qty);
    }
    return result;
}

// Chamado depois que uma escrita em inventory_balances é commitada (sync de
// catálogo, poll de saldo dedicado, ou o gate de finalização buscando ao
// vivo) -- garante que a próxima leitura nunca sirva um valor mais velho
// que o que acabou de ser gravado, sem depender só do TTL.
export async function invalidateVariantStock(tenant: Tenant, variantIds: string[]): Promise<void> {
    if (variantIds.length === 0) return;
    await safeRedis((redis) => redis.del(...variantIds.map((id) => cacheKey(tenant.id, id))));
}
