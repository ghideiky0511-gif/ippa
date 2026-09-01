// Metadado de exibição/formulário dos providers de pagamento -- não tem
// tabela no banco (mesmo padrão de erp/providerCatalog.ts). "mock" fica com
// hidden: true porque é fixture de dev/QA, nunca uma opção real pro tenant
// escolher. Providers reais (stripe, depois Mercado Pago/Cielo/Rede) entram
// aqui um de cada vez -- ver backend/src/payments/registry.ts para a fábrica
// correspondente de cada `code`.

export interface PaymentProviderCredentialField {
    key: string;
    label: string;
    type: "text" | "password" | "number" | "number-list";
    required: boolean;
    /** Agrupamento visual no formulário de credenciais (ver PaymentProviderCredentialsModal). */
    group?: "connection";
}

export interface PaymentProviderCatalogEntry {
    code: string;
    label: string;
    description: string;
    logoPath?: string;
    credentialFields: PaymentProviderCredentialField[];
    hidden?: boolean;
    // Omitido (ou "credentials") = formulário de credenciais de sempre (PUT
    // /payment-integration com os credentialFields acima). "redirect" =
    // provider tipo Stripe Connect, sem formulário -- o front mostra um
    // botão que chama um endpoint específico do provider (ex.
    // /payment-integration/stripe/onboarding-link) e redireciona pro fluxo
    // hospedado; ativação não é um clique manual, vem de webhook.
    onboardingType?: "credentials" | "redirect";
}

export const PAYMENT_PROVIDER_CATALOG: PaymentProviderCatalogEntry[] = [
    {
        code: "mock",
        label: "Mock",
        description: "Fixtures fixas para testes internos -- não é um gateway real.",
        credentialFields: [],
        hidden: true,
    },
    {
        code: "stripe",
        label: "Stripe",
        description:
            "Pagamento com cartão via Stripe Connect -- sem formulário, ativado por um cadastro guiado hospedado pela Stripe.",
        credentialFields: [],
        onboardingType: "redirect",
    },
];

export function listVisiblePaymentProviderCatalog(): PaymentProviderCatalogEntry[] {
    return PAYMENT_PROVIDER_CATALOG.filter((entry) => !entry.hidden);
}

export function findPaymentProviderCatalogEntry(code: string): PaymentProviderCatalogEntry | undefined {
    return PAYMENT_PROVIDER_CATALOG.find((entry) => entry.code === code);
}
