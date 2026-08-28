import { z } from "zod";
import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser, HomeSection } from "@/lib/types";
import { HomeSectionSchema } from "@/contracts/catalog";
import {
    deleteHomeSectionRows, insertHomeBannerRow, insertHomeSectionRow,
    listHomeBannerRows, listHomeSectionRows, type HomeSectionLayout,
} from "@/models/settingsModel";
import { ValidationError } from "@/services/shared/errors";
import { requireSettingsAdministrator } from "./settingsAuthorization";
import { databaseId } from "@/services/shared/identifiers";

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

const HomeSectionsSchema = z.array(HomeSectionSchema);

export async function replaceHomeSections(tenant: Tenant, actor: AuthUser, value: unknown): Promise<HomeSection[]> {
    requireSettingsAdministrator(actor);
    const parsed = HomeSectionsSchema.safeParse(value);
    if (!parsed.success) throw new ValidationError("INVALID_INPUT", "Dados inválidos.", parsed.error.issues);
    const sections = parsed.data.map((section): HomeSection => section.type === "product"
        ? { ...section, id: databaseId(section.id) }
        : {
            ...section,
            id: databaseId(section.id),
            banners: section.banners.map((banner) => ({ ...banner, id: databaseId(banner.id) })),
        });
    await withTenantTransaction(tenant, actor, async (client) => {
        await deleteHomeSectionRows(client);
        for (const [position, section] of sections.entries()) {
            const layout: HomeSectionLayout = {};
            for (const key of ["x", "y", "width", "height"] as const) {
                if (typeof section[key] === "number") layout[key] = section[key];
            }
            // Ajustes por breakpoint (o que a loja mexeu nos modos tablet /
            // celular) e o modo largura-total do banner viajam no mesmo blob
            // de layout — somem juntos se forem limpos e a loja salvar de novo.
            if (section.tablet) layout.tablet = section.tablet;
            if (section.mobile) layout.mobile = section.mobile;
            if (section.type === "banner") {
                if (section.fullBleed) layout.fullBleed = true;
                if (section.fullHeight) layout.fullHeight = true;
            }
            // `cta` viaja no mesmo blob de layout — some junto se a loja
            // desmarcar o hiperlink e salvar de novo.
            if (section.cta) layout.cta = section.cta;
            await insertHomeSectionRow(client, {
                id: section.id, type: section.type,
                productId: section.type === "product" ? section.productId : undefined,
                layout, position,
            });
            if (section.type === "banner") {
                for (const [bannerPosition, banner] of section.banners.entries()) {
                    await insertHomeBannerRow(client, section.id, { ...banner, position: bannerPosition });
                }
            }
        }
    });
    return sections;
}
