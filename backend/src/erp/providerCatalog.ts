// Metadado de exibição/formulário dos providers de ERP — não tem tabela no
// banco (só ERP existe como categoria hoje, poucos providers), é código ao
// lado de registry.ts, mesmo padrão. "mock" fica com hidden: true porque é
// fixture de dev/QA, nunca uma opção real pro tenant escolher.

export interface ErpProviderCredentialField {
    key: string;
    label: string;
    type: "text" | "password" | "number" | "number-list";
    required: boolean;
}

export interface ErpProviderCatalogEntry {
    code: string;
    label: string;
    description: string;
    logoPath?: string;
    credentialFields: ErpProviderCredentialField[];
    hidden?: boolean;
}

export const ERP_PROVIDER_CATALOG: ErpProviderCatalogEntry[] = [
    {
        code: "mock",
        label: "Mock",
        description: "Fixtures fixas para testes internos — não é um ERP real.",
        credentialFields: [],
        hidden: true,
    },
    {
        code: "totvsmoda",
        label: "TOTVS Moda",
        description: "Sistema de gestão TOTVS para o varejo de moda: produtos, pedidos, clientes e empresas.",
        logoPath: "/img/integracoes/totvsmoda_icon_400x400.jpeg",
        credentialFields: [
            { key: "clientId", label: "Client ID", type: "text", required: true },
            { key: "clientSecret", label: "Client Secret", type: "password", required: true },
            { key: "username", label: "Usuário", type: "text", required: true },
            { key: "password", label: "Senha", type: "password", required: true },
            { key: "branchCode", label: "Código da filial", type: "number", required: true },
            { key: "priceCodeList", label: "Códigos de tabela de preço (separados por vírgula)", type: "number-list", required: true },
            { key: "stockCodeList", label: "Códigos de depósito/estoque (separados por vírgula)", type: "number-list", required: true },
        ],
    },
];

export function listVisibleErpProviderCatalog(): ErpProviderCatalogEntry[] {
    return ERP_PROVIDER_CATALOG.filter((entry) => !entry.hidden);
}

export function findErpProviderCatalogEntry(code: string): ErpProviderCatalogEntry | undefined {
    return ERP_PROVIDER_CATALOG.find((entry) => entry.code === code);
}
