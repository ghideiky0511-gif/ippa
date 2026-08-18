import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { HomeSection } from "@/lib/types";
import { listHomeBannerRows, listHomeSectionRows } from "@/models/settingsModel";

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
