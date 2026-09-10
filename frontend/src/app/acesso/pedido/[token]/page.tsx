"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/components/TenantProvider";
import { publicUi } from "@/lib/ui";

export default function PedidoAccessPage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = use(params);
    const router = useRouter();
    const { tenant } = useTenant();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function openOrder() {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch("/api/order-access/exchange", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token }),
            });
            const payload = await response.json().catch(() => null) as {
                orderNumber?: number;
                error?: string;
            } | null;
            if (!response.ok || !payload?.orderNumber) {
                throw new Error(payload?.error ?? "Não foi possível validar este link.");
            }
            router.replace(`/${tenant.slug}/pedidos/${payload.orderNumber}?acesso=1`);
        } catch (openError) {
            setError(
                openError instanceof Error
                    ? openError.message
                    : "Não foi possível validar este link.",
            );
        } finally {
            setLoading(false);
        }
    }

    return (
        <main className={`${publicUi.container} flex min-h-[70vh] items-center py-8 sm:py-10`}>
            <section className="mx-auto w-full max-w-md rounded-brand border border-border bg-surface p-6 text-center shadow-card">
                <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary">
                    <KeyRound className="size-6" aria-hidden="true" />
                </span>
                <h1 className="mt-4 text-2xl font-bold tracking-[-0.03em] text-foreground">
                    Abrir pedido com segurança
                </h1>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Este link é temporário e dá acesso somente ao pedido enviado para você.
                </p>
                {error && <p className="mt-4 text-sm text-red-700" role="alert">{error}</p>}
                <Button className="mt-6 w-full" type="button" loading={loading} onClick={() => void openOrder()}>
                    Abrir pedido
                </Button>
            </section>
        </main>
    );
}
