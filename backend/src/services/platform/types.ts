import type {
    PlatformPlanCode,
    TenantContractBillingCycle,
    TenantContractStatus,
    TenantStatus,
} from "@/models/platformModel";
import type { UserRole } from "@/lib/types";

export interface PlatformUser { id: string; email: string; name: string }
export interface PlatformTenantContract {
    id: string;
    plan: { code: PlatformPlanCode; name: string };
    status: TenantContractStatus;
    billingCycle: TenantContractBillingCycle;
    currency: string;
    priceCents: number | null;
    startsAt: string | null;
    endsAt: string | null;
    externalReference: string | null;
}
export interface PlatformTenant {
    id: string; slug: string; name: string; status: TenantStatus; active: boolean;
    createdAt: string; userCount: number; contract: PlatformTenantContract | null;
}
export interface PlatformTenantUser {
    id: string; name: string; email: string; role: UserRole; active: boolean; createdAt: string;
}
