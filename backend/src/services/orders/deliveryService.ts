import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser, DeliveryQuote, DeliveryType, UpdateDeliveryTypeInput } from "@/lib/types";
import {
    countOtherActiveDeliveryTypes,
    findDeliveryConfigurationRow,
    listActiveDeliveryConfigurationRows,
    listDeliveryConfigurationRows,
    updateDeliveryConfigurationRow,
    type DeliveryConfigurationRow,
} from "@/models/deliveryModel";
import { DELIVERY_TYPE_AUDIT_ACTIONS, recordAuditEvent, type AuditRequestContext } from "@/services/audit";
import { ForbiddenError, NotFoundError, ValidationError } from "@/services/shared/errors";

export function toDeliveryType(row: DeliveryConfigurationRow): DeliveryType {
    return {
        id: row.id,
        code: row.code,
        fulfillmentMode: row.fulfillment_mode,
        name: row.name,
        active: row.active,
        sortOrder: row.sort_order,
        offering: {
            id: row.offering_id,
            deliveryTypeId: row.id,
            provider: {
                id: row.provider_id,
                code: row.provider_code,
                kind: row.provider_kind,
                name: row.provider_name,
                companyId: row.provider_company_id,
                active: row.provider_active,
            },
            pricingMode: row.pricing_mode,
            fixedPrice: row.fixed_price == null ? null : Number(row.fixed_price),
            etaLabel: row.eta_label,
            active: row.offering_active,
        },
    };
}

export function deliveryQuoteFromConfiguration(row: DeliveryConfigurationRow): DeliveryQuote {
    if (row.pricing_mode !== "fixed" || row.fixed_price == null) {
        throw new ValidationError("DELIVERY_EXTERNAL_QUOTE_NOT_AVAILABLE");
    }
    return {
        id: row.offering_id,
        quoteId: null,
        deliveryTypeId: row.id,
        deliveryOfferingId: row.offering_id,
        providerId: row.provider_id,
        fulfillmentMode: row.fulfillment_mode,
        deliveryTypeName: row.name,
        providerName: row.provider_name,
        destinationCep: null,
        label: row.name,
        price: Number(row.fixed_price),
        etaLabel: row.eta_label,
        kind: row.fulfillment_mode === "pickup" ? "pickup" : "fixed",
    };
}

export async function listDeliveryOptions(tenant: Tenant, user: AuthUser): Promise<DeliveryQuote[]> {
    return withTenantTransaction(tenant, user, async (client) =>
        (await listActiveDeliveryConfigurationRows(client)).map(deliveryQuoteFromConfiguration),
    );
}

export async function listDeliveryTypes(tenant: Tenant, user: AuthUser): Promise<DeliveryType[]> {
    if (user.role !== "administrador") throw new ForbiddenError();
    return withTenantTransaction(tenant, user, async (client) =>
        (await listDeliveryConfigurationRows(client)).map(toDeliveryType),
    );
}

export async function updateDeliveryType(
    tenant: Tenant,
    user: AuthUser,
    id: string,
    value: UpdateDeliveryTypeInput,
    context: AuditRequestContext,
): Promise<DeliveryType> {
    if (user.role !== "administrador") throw new ForbiddenError();
    return withTenantTransaction(tenant, user, async (client) => {
        const existing = await findDeliveryConfigurationRow(client, id);
        if (!existing) throw new NotFoundError("DELIVERY_TYPE_NOT_FOUND");
        if (value.active === false && existing.active && await countOtherActiveDeliveryTypes(client, id) === 0) {
            throw new ValidationError("DELIVERY_LAST_ACTIVE_TYPE");
        }
        const updated = await updateDeliveryConfigurationRow(client, id, value);
        if (!updated) throw new NotFoundError("DELIVERY_TYPE_NOT_FOUND");
        const changedFields = Object.keys(value);
        const action = value.active === true && !existing.active
            ? DELIVERY_TYPE_AUDIT_ACTIONS.ACTIVATED
            : value.active === false && existing.active
                ? DELIVERY_TYPE_AUDIT_ACTIONS.DEACTIVATED
                : DELIVERY_TYPE_AUDIT_ACTIONS.UPDATED;
        await recordAuditEvent(client, {
            action,
            entityId: id,
            actor: user,
            context,
            metadata: { changedFields },
        });
        return toDeliveryType(updated);
    });
}
