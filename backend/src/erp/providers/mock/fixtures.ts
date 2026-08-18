// Payloads brutos fictícios, no formato arbitrário de um ERP genérico
// (nomes de campo em português, aninhamento próprio) — propositalmente
// diferentes do formato interno (Product/Order/Client/Company) para exigir
// que mapper.ts faça a adequação de verdade, exatamente como um provider
// real precisaria fazer com o formato do ERP dele.

export interface MockRawProduct {
    codigo: string;
    descricao: string;
    categoria: string;
    precoVenda: number;
    precoSugerido?: number;
    marca?: string;
    referencia?: string;
}

export interface MockRawOrderItem {
    sku: string;
    nomeProduto: string;
    quantidade: number;
    precoUnitario: number;
}

export interface MockRawOrder {
    numero: string;
    dataEmissao: string;
    canalVenda: "presencial" | "whatsapp" | "online";
    itens: MockRawOrderItem[];
}

export interface MockRawClient {
    documento: string;
    nomeCompleto: string;
    emailContato?: string;
    endereco?: {
        cep?: string; logradouro?: string; numero?: string; complemento?: string;
        bairro?: string; cidade?: string; uf?: string;
    };
}

export interface MockRawCompany {
    cnpj: string;
    razaoSocial: string;
    nomeFantasia?: string;
    inscricaoEstadual?: string;
    matriz: boolean;
    endereco?: {
        cep?: string; logradouro?: string; numero?: string; complemento?: string;
        bairro?: string; cidade?: string; uf?: string;
    };
}

export const MOCK_RAW_PRODUCTS: Array<{ externalId: string; raw: MockRawProduct }> = [
    { externalId: "ERP-PROD-001", raw: { codigo: "ERP-PROD-001", descricao: "Vestido Midi Floral", categoria: "Vestidos", precoVenda: 189.9, precoSugerido: 349.9, marca: "Bippa", referencia: "VMF-001" } },
    { externalId: "ERP-PROD-002", raw: { codigo: "ERP-PROD-002", descricao: "Blusa Cropped Canelada", categoria: "Blusas", precoVenda: 79.9, marca: "Bippa", referencia: "BCC-002" } },
];

export const MOCK_RAW_ORDERS: Array<{ externalId: string; raw: MockRawOrder }> = [
    {
        externalId: "ERP-PED-1001",
        raw: {
            numero: "ERP-PED-1001",
            dataEmissao: "2026-08-10T14:30:00.000Z",
            canalVenda: "online",
            itens: [{ sku: "ERP-PROD-001", nomeProduto: "Vestido Midi Floral", quantidade: 1, precoUnitario: 189.9 }],
        },
    },
];

export const MOCK_RAW_CLIENTS: Array<{ externalId: string; raw: MockRawClient }> = [
    {
        externalId: "ERP-CLI-500",
        raw: {
            documento: "12345678900",
            nomeCompleto: "Maria Souza",
            emailContato: "maria.souza@example.com",
            endereco: { cep: "01310-100", logradouro: "Av. Paulista", numero: "1000", bairro: "Bela Vista", cidade: "São Paulo", uf: "SP" },
        },
    },
];

export const MOCK_RAW_COMPANIES: Array<{ externalId: string; raw: MockRawCompany }> = [
    {
        externalId: "ERP-EMP-01",
        raw: {
            cnpj: "11222333000181",
            razaoSocial: "Bippa Comercio de Roupas Ltda",
            nomeFantasia: "Bippa",
            inscricaoEstadual: "110042490114",
            matriz: true,
            endereco: { cep: "04547-005", logradouro: "Rua Funchal", numero: "418", bairro: "Vila Olímpia", cidade: "São Paulo", uf: "SP" },
        },
    },
    {
        externalId: "ERP-EMP-02",
        raw: {
            cnpj: "11222333000262",
            razaoSocial: "Bippa Comercio de Roupas Ltda - Filial Sul",
            nomeFantasia: "Bippa Sul",
            matriz: false,
            endereco: { cep: "90010-000", logradouro: "Rua dos Andradas", numero: "500", bairro: "Centro Histórico", cidade: "Porto Alegre", uf: "RS" },
        },
    },
];
