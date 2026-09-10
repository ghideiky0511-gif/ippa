import Link from "@/components/TenantLink";
import { Button } from "@/components/ui/button";
import { HubHeader } from "@/workspace/components/shared/HubHeader";

export default function WhatsAppTemplatesApp() {
    return (
        <div className="min-h-full bg-brand-background">
            <HubHeader
                title="Templates personalizados"
                description="Em breve você poderá criar e administrar outros templates do WhatsApp aqui."
                secondaryActions={
                    <Link
                        href="/workspace/integracoes/whatsapp"
                        className="text-sm font-semibold text-brand-primary hover:underline"
                    >
                        Voltar para WhatsApp
                    </Link>
                }
            />
            <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
                <section className="rounded-brand border border-border bg-surface p-5 shadow-card">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-brand-primary">
                                Templates personalizados
                            </p>
                            <h2 className="mt-1 text-lg font-bold text-foreground">
                                Em breve
                            </h2>
                            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                                Por enquanto, os únicos envios do app são os modelos
                                fixos exibidos na configuração principal do WhatsApp.
                                A criação, edição, análise e exclusão de modelos
                                personalizados será liberada nesta área futuramente.
                            </p>
                        </div>
                        <span className="group relative inline-flex" tabIndex={0}>
                            <Button type="button" disabled>
                                Criar template
                            </Button>
                            <span
                                role="tooltip"
                                className="pointer-events-none absolute right-0 top-full z-10 mt-2 w-44 rounded-control bg-foreground px-3 py-2 text-center text-xs font-medium text-surface opacity-0 shadow-card transition-opacity group-hover:opacity-100 group-focus:opacity-100"
                            >
                                Em breve
                            </span>
                        </span>
                    </div>
                </section>
            </main>
        </div>
    );
}
