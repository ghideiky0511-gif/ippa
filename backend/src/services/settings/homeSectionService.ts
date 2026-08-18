import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser, HomeSection } from "@/lib/types";
import {
    deleteHomeSectionRows, insertHomeBannerRow, insertHomeSectionRow,
    listHomeBannerRows, listHomeSectionRows,
} from "@/models/settingsModel";
import { ValidationError } from "@/services/shared/errors";
import { requireSettingsAdministrator } from "./settingsAuthorization";

export async function listHomeSections(tenant: Tenant): Promise<HomeSection[]> {
    return withTenantTransaction(tenant, {}, async (client) => {
        const [sections, banners] = await Promise.all([
            listHomeSectionRows(client), listHomeBannerRows(client),
        ]);
        return sections.map((section): HomeSection => section.type === "product"
            ? { type: "product", id: section.id, productId: section.product_id!, ...section.layout }
            : {
                type: "banner",
                id: section.id,
                banners: banners.filter((banner) => banner.home_section_id === section.id).map((banner) => ({
                    id: banner.id,
                    type: banner.type,
                    mediaUrl: banner.media_url,
                    title: banner.title ?? undefined,
                    subtitle: banner.subtitle ?? undefined,
                })),
                ...section.layout,
            });
    });
}

export async function replaceHomeSections(tenant: Tenant, actor: AuthUser, value: unknown): Promise<HomeSection[]> {
    requireSettingsAdministrator(actor);
    if (!Array.isArray(value) || !value.every((section) => section && typeof section === "object" &&
        typeof section.id === "string" && (section.type === "banner" || section.type === "product") &&
        (section.type !== "product" || typeof section.productId === "string") &&
        (section.type !== "banner" || Array.isArray(section.banners)))) throw new ValidationError();
    const sections = value as HomeSection[];
    await withTenantTransaction(tenant, actor, async (client) => {
        await deleteHomeSectionRows(client);
        for (const [position, section] of sections.entries()) {
            const layout = Object.fromEntries(["x", "y", "width", "height"]
                .filter((key) => typeof section[key as keyof HomeSection] === "number")
                .map((key) => [key, section[key as keyof HomeSection]])) as Record<string, number>;
            await insertHomeSectionRow(client, {
                id: section.id, type: section.type,
                productId: section.type === "product" ? section.productId : undefined,
                layout, position,
            });
            if (section.type === "banner") {
                for (const [bannerPosition, banner] of section.banners.entries()) {
                    if (!banner || typeof banner.id !== "string" || (banner.type !== "image" && banner.type !== "video") ||
                        typeof banner.mediaUrl !== "string") throw new ValidationError();
                    await insertHomeBannerRow(client, section.id, { ...banner, position: bannerPosition });
                }
            }
        }
    });
    return sections;
}
