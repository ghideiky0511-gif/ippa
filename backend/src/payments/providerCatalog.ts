// Metadado de exibição/formulário dos providers de pagamento -- não tem
// tabela no banco (mesmo padrão de erp/providerCatalog.ts). "mock" fica com
// hidden: true porque é fixture de dev/QA, nunca uma opção real pro tenant
// escolher. Providers reais (iugu, depois Mercado Pago/Cielo/Rede) entram
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
}

export const PAYMENT_PROVIDER_CATALOG: PaymentProviderCatalogEntry[] = [
    {
        code: "mock",
        label: "Mock",
        description: "Fixtures fixas para testes internos -- não é um gateway real.",
        credentialFields: [],
        hidden: true,
    },
];

export function listVisiblePaymentProviderCatalog(): PaymentProviderCatalogEntry[] {
    return PAYMENT_PROVIDER_CATALOG.filter((entry) => !entry.hidden);
}

export function findPaymentProviderCatalogEntry(code: string): PaymentProviderCatalogEntry | undefined {
    return PAYMENT_PROVIDER_CATALOG.find((entry) => entry.code === code);
}
