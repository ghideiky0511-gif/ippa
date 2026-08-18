// Regras do catálogo que ainda não possuem configuração por tenant. A
// identidade da loja (nome e slug) vem do tenant ativo, nunca deste arquivo.
//
// Liga/desliga de ferramentas opcionais do catálogo (ex. preço sugerido +
// markup) NÃO mora mais aqui — virou web/src/data/storeSettings.json
// (`features`), editável em tempo real pela plataforma admin em
// /ferramentas (GET/PUT em /api/store-settings) e aplicado em
// web/src/lib/catalog.ts (`getCatalog`, `stripDisabledFeatures`).
export const CONFIG: {
    contact: {
        email: string;
        whatsappNumber: string;
        instagramUrl: string;
        address: string;
        serviceHours: string;
    };
    footer: {
        privacyUrl: string;
        termsUrl: string;
    };
    // Opções de previsão de entrega pra quantidade que excede o estoque
    // (backorder) na grade de cor×tamanho — rótulo livre, cada loja define
    // os prazos que fazem sentido pro seu fornecedor. Mock por enquanto
    // (mesmo padrão de web/src/lib/shipping.ts), sem UI de edição — quando o
    // Bippa/ERP realmente mandar `stockQty` por variante é que vale a pena
    // decidir se isso vira editável em /admin ou continua fixo por deploy.
    backorderDeliveryOptions: { id: string; label: string }[];
    home: {
        audiences: { id: string; label: string; productIds: string[] | null }[];
    };
} = {
    // Dados públicos da loja. Preencha estes valores para exibi-los no
    // rodapé; o WhatsApp é também usado no fluxo de finalizar pedido.
    contact: {
        email: "",
        whatsappNumber: "", // formato internacional só números, ex: '5511999999999'.
        instagramUrl: "", // ex.: 'https://instagram.com/sualoja'
        address: "",
        serviceHours: "", // ex.: 'Segunda a sexta, das 9h às 18h'
    },
    footer: {
        privacyUrl: "",
        termsUrl: "",
    },

    backorderDeliveryOptions: [
        { id: "30d", label: "Em 30 dias" },
        { id: "60d", label: "Em 60 dias" },
        { id: "90d", label: "Em 90 dias" },
    ],

    home: {
        audiences: [],
    },
};

export const COLOR_MAP: Record<string, string> = {
    PRETO: "#1a1a1a",
    BRANCO: "#ffffff",
    "OFF WHITE": "#f2ede4",
    AZUL: "#2b5fa4",
    "AZUL CLARO": "#7fb3e0",
    VERMELHO: "#c0392b",
    VERDE: "#2e8b57",
    AMARELO: "#f1c40f",
    ROSA: "#e79fc4",
    "ROSA BEBE": "#f5c9dd",
    ROXO: "#8e44ad",
    LARANJA: "#e67e22",
    MARROM: "#6b4226",
    CINZA: "#9a9a9a",
    DOURADO: "#c9a227",
    PRATA: "#c0c0c0",
    BEGE: "#e8dcc8",
    VINHO: "#6d1b2f",
    PINK: "#ff2d95",
    NUDE: "#dfc0a8",
    CARAMELO: "#a86b32",
    MADELAINE: "#caa27a",
    GOIABA: "#e8607a",
    PISTACHE: "#a3b18a",
    ROSE: "#e8b4bc",
    CAFE: "#4b3221",
    MANTEIGA: "#f3e5ab",
    AMENDOA: "#c9a27a",
};
