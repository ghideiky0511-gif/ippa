import type {
  CatalogLastOrderResumeOutput,
  CatalogLastOrderResumeInput,
  CatalogLastOrderSummary,
  CatalogOrderBreakdownItem,
} from '@/contracts/ai';
import type { Tenant } from '@/lib/db/tenant';
import { withTenantTransaction } from '@/lib/db/tenant';
import type { AuthUser } from '@/lib/types';
import {
  findLatestPaidOrderForClientRow,
  findPaidOrderTicketStatisticsRow,
  listCatalogOrderResumeItemRows,
  type CatalogLastPaidOrderRow,
  type CatalogOrderResumeItemRow,
  type CatalogOrderTicketStatisticsRow,
} from '@/models/catalogOrderResumeModel';
import { findOrderSessionRow } from '@/models/ordersModel';
import { ForbiddenError, NotFoundError, ValidationError } from '@/services/shared/errors';
import { runAiTool } from './aiToolEngine';
import { catalogLastOrderResumeTool } from './catalogLastOrderResumeTool';
import type { AiToolRunResult } from './types';

const TICKET_WINDOW_MONTHS = 12 as const;
const DAY_MS = 24 * 60 * 60 * 1000;

interface CatalogOrderResumeSnapshot {
  order: CatalogLastPaidOrderRow;
  items: CatalogOrderResumeItemRow[];
  tickets: CatalogOrderTicketStatisticsRow;
}

type CatalogOrderResumeReadResult = CatalogOrderResumeSnapshot | null;

export interface CatalogOrderResumeDependencies {
  readSnapshot: (
    tenant: Tenant,
    user: AuthUser,
    sessionId: string,
    periodStart: Date,
  ) => Promise<CatalogOrderResumeReadResult>;
  runTool: (
    tenant: Tenant,
    actor: { userId: string; role: string },
    input: CatalogLastOrderResumeInput,
  ) => Promise<AiToolRunResult<CatalogLastOrderResumeOutput>>;
  now: () => Date;
}

function normalizedLabel(value: string | null): string | null {
  const label = value?.trim();
  return label ? label : null;
}

function rounded(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function money(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? rounded(parsed) : null;
}

function differencePercent(value: number, average: number | null): number | null {
  if (average === null || average === 0) return null;
  return rounded(((value - average) / average) * 100, 1);
}

function breakdown(
  items: CatalogOrderResumeItemRow[],
  pick: (item: CatalogOrderResumeItemRow) => string | null,
  totalPieces: number,
): CatalogOrderBreakdownItem[] {
  const quantities = new Map<string, number>();
  for (const item of items) {
    const label = normalizedLabel(pick(item));
    if (!label) continue;
    quantities.set(label, (quantities.get(label) ?? 0) + item.qty);
  }
  return [...quantities.entries()]
    .map(([label, quantity]) => ({
      label,
      quantity,
      sharePercent: totalPieces === 0 ? 0 : rounded((quantity / totalPieces) * 100, 1),
    }))
    .sort((left, right) => right.quantity - left.quantity || left.label.localeCompare(right.label, 'pt-BR'));
}

export function buildCatalogLastOrderResumeInput(
  snapshot: CatalogOrderResumeSnapshot,
  now: Date,
): CatalogLastOrderResumeInput {
  const totalValue = money(snapshot.order.total) ?? 0;
  const totalPieces = snapshot.items.reduce((sum, item) => sum + item.qty, 0);
  const clientAverage = money(snapshot.tickets.client_average);
  const tenantAverage = money(snapshot.tickets.tenant_average);
  const daysSincePurchase = Math.max(
    0,
    Math.floor((now.getTime() - snapshot.order.created_at.getTime()) / DAY_MS),
  );

  return {
    lastOrder: {
      orderDate: snapshot.order.created_at.toISOString(),
      totalValue,
      totalPieces,
      distinctProducts: new Set(snapshot.items.map((item) => item.product_id ?? `item:${item.item_key}`)).size,
      daysSincePurchase,
    },
    tickets: {
      windowMonths: TICKET_WINDOW_MONTHS,
      client: {
        averageValue: clientAverage,
        orderCount: Number(snapshot.tickets.client_order_count),
        differencePercent: differencePercent(totalValue, clientAverage),
      },
      tenant: {
        averageValue: tenantAverage,
        orderCount: Number(snapshot.tickets.tenant_order_count),
        differencePercent: differencePercent(totalValue, tenantAverage),
      },
    },
    mix: {
      categories: breakdown(snapshot.items, (item) => item.category, totalPieces),
      subcategories: breakdown(snapshot.items, (item) => item.subcategory, totalPieces),
      colors: breakdown(snapshot.items, (item) => item.color, totalPieces),
      sizes: breakdown(snapshot.items, (item) => item.size, totalPieces),
      piecesWithoutCategory: snapshot.items.reduce(
        (sum, item) => sum + (normalizedLabel(item.category) ? 0 : item.qty),
        0,
      ),
    },
  };
}

export function canRunCatalogOrderResume(user: AuthUser, sellerId: string): boolean {
  if (user.role === 'vendedora') return user.id === sellerId;
  return user.role === 'administrador' && user.permissions?.adminAccess === true;
}

async function readCatalogOrderResumeSnapshot(
  tenant: Tenant,
  user: AuthUser,
  sessionId: string,
  periodStart: Date,
): Promise<CatalogOrderResumeReadResult> {
  return withTenantTransaction(tenant, { userId: user.id, role: user.role }, async (client) => {
    const session = await findOrderSessionRow(client, sessionId);
    if (!session) throw new NotFoundError('SESSION_NOT_FOUND');
    if (!canRunCatalogOrderResume(user, session.seller_id)) throw new ForbiddenError();
    if (!session.client_id) throw new ValidationError('CLIENT_REQUIRED');

    const order = await findLatestPaidOrderForClientRow(client, session.client_id);
    if (!order) return null;
    const items = await listCatalogOrderResumeItemRows(client, order.id);
    const tickets = await findPaidOrderTicketStatisticsRow(client, session.client_id, periodStart);
    return { order, items, tickets };
  });
}

export function createCatalogOrderResumeService(
  overrides: Partial<CatalogOrderResumeDependencies> = {},
) {
  const dependencies: CatalogOrderResumeDependencies = {
    readSnapshot: overrides.readSnapshot ?? readCatalogOrderResumeSnapshot,
    runTool: overrides.runTool ?? ((tenant, actor, input) =>
      runAiTool(tenant, actor, catalogLastOrderResumeTool, input)),
    now: overrides.now ?? (() => new Date()),
  };

  return async function catalogOrderResume(
    tenant: Tenant,
    user: AuthUser,
    sessionId: string,
  ): Promise<CatalogLastOrderSummary> {
    const now = dependencies.now();
    const periodStart = new Date(now);
    periodStart.setUTCMonth(periodStart.getUTCMonth() - TICKET_WINDOW_MONTHS);

    // A leitura termina e libera a transação antes de qualquer chamada externa.
    const snapshot = await dependencies.readSnapshot(tenant, user, sessionId, periodStart);
    if (!snapshot) return { status: 'no_history' };

    const input = buildCatalogLastOrderResumeInput(snapshot, now);
    const execution = await dependencies.runTool(
      tenant,
      { userId: user.id, role: user.role },
      input,
    );
    return {
      status: 'available',
      facts: input,
      analysis: execution.data,
      executionId: execution.executionId,
      source: execution.source,
    };
  };
}

export const catalogOrderResume = createCatalogOrderResumeService();
