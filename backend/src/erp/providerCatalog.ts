// Metadado de exibição/formulário dos providers de ERP — não tem tabela no
// banco (só ERP existe como categoria hoje, poucos providers), é código ao
// lado de registry.ts, mesmo padrão. "mock" fica com hidden: true porque é
// fixture de dev/QA, nunca uma opção real pro tenant escolher.

export interface ErpProviderCredentialField {
    key: string;
    label: string;
    type: "text" | "password" | "number" | "number-list";
    required: boolean;
    /** Agrupamento visual no formulário de credenciais (ver ErpProviderCredentialsModal). */
    group?: "connection" | "publishing" | "orders";
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
            { key: "clientId", label: "Client ID", type: "text", required: true, group: "connection" },
            { key: "clientSecret", label: "Client Secret", type: "password", required: true, group: "connection" },
            { key: "username", label: "Usuário", type: "text", required: true, group: "connection" },
            { key: "password", label: "Senha", type: "password", required: true, group: "connection" },
            { key: "branchCode", label: "Código da filial", type: "number", required: true, group: "connection" },
            { key: "priceCodeList", label: "Códigos de tabela de preço (separados por vírgula)", type: "number-list", required: true, group: "connection" },
            { key: "stockCodeList", label: "Códigos de depósito/estoque (separados por vírgula)", type: "number-list", required: true, group: "connection" },
            // Estes dois campos são o que liga (ver
            // erpIntegrationService.ts:saveTenantErpIntegrationCredentials)
            // catalog_sync_configs.enabled automaticamente ao salvar.
            { key: "classificationTypeCode", label: "Tipo da classificação de publicação", type: "number", required: true, group: "publishing" },
            { key: "classificationCodes", label: "Classificações que publicam o produto (separadas por vírgula)", type: "text", required: true, group: "publishing" },
            // Abaixo: só usados ao ENVIAR pedido ao TOTVS (ver
            // erp/providers/totvsmoda/mapper.ts) -- não required aqui porque
            // um tenant pode usar só a importação de produtos/clientes/pedidos
            // sem nunca enviar pedido; a falta é detectada e explicada no
            // momento do envio, não bloqueia salvar/ativar a integração.
            { key: "defaultOperationCode", label: "Código de operação (pedido de venda)", type: "number", required: false, group: "orders" },
            { key: "defaultPaymentConditionCode", label: "Código de condição de pagamento", type: "number", required: false, group: "orders" },
            { key: "defaultPriorityCode", label: "Código de prioridade do pedido", type: "number", required: false, group: "orders" },
            { key: "representativeCode", label: "Código do representante", type: "number", required: false, group: "orders" },
            { key: "representativeCpfCnpj", label: "CPF/CNPJ do representante (alternativa ao código)", type: "text", required: false, group: "orders" },
            { key: "defaultReasonCancellationCode", label: "Código do motivo de cancelamento", type: "number", required: false, group: "orders" },
            { key: "defaultDiscountTypeCode", label: "Código do tipo de desconto (só se houver pedidos com desconto)", type: "number", required: false, group: "orders" },
        ],
    },
];

export function listVisibleErpProviderCatalog(): ErpProviderCatalogEntry[] {
    return ERP_PROVIDER_CATALOG.filter((entry) => !entry.hidden);
}

export function findErpProviderCatalogEntry(code: string): ErpProviderCatalogEntry | undefined {
    return ERP_PROVIDER_CATALOG.find((entry) => entry.code === code);
}
