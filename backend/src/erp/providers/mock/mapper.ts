import type { CartItem, Client, Company, Order, Product } from "@/lib/types";
import type { MockRawClient, MockRawCompany, MockRawOrder, MockRawProduct } from "./fixtures";

// Aqui, e só aqui, mora a adequação do formato bruto do mock (nomes de
// campo/estrutura arbitrários, ver fixtures.ts) para os tipos internos —
// um provider real repetiria essa mesma ideia com o formato do ERP dele,
// nunca reaproveitando este mapper.

export function mapMockProduct(raw: MockRawProduct): Omit<Product, "id"> {
    return {
        name: raw.descricao,
        description: "",
        referenceId: raw.referencia ?? raw.codigo,
        price: raw.precoVenda,
        suggestedRetailPrice: raw.precoSugerido,
        markup: raw.precoSugerido ? raw.precoSugerido / raw.precoVenda : undefined,
        colors: [],
        sizes: [],
        variants: [],
    };
}

export function mapMockOrder(raw: MockRawOrder): Omit<Order, "id" | "orderNumber"> {
    const items: CartItem[] = raw.itens.map((item) => ({
        key: item.sku,
        id: item.sku,
        name: item.nomeProduto,
        price: item.precoUnitario,
        qty: item.quantidade,
    }));
    return {
        date: raw.dataEmissao,
        status: "pago",
        items,
        total: items.reduce((sum, item) => sum + item.price * item.qty, 0),
        channel: raw.canalVenda,
    };
}

export function mapMockClient(raw: MockRawClient): Omit<Client, "id" | "createdAt" | "updatedAt"> {
    return {
        name: raw.nomeCompleto,
        cpfCnpj: raw.documento,
        email: raw.emailContato,
        cep: raw.endereco?.cep,
        street: raw.endereco?.logradouro,
        number: raw.endereco?.numero,
        complement: raw.endereco?.complemento,
        neighborhood: raw.endereco?.bairro,
        city: raw.endereco?.cidade,
        state: raw.endereco?.uf,
    };
}

export function mapMockCompany(raw: MockRawCompany): Omit<Company, "id" | "createdAt" | "updatedAt"> {
    return {
        cnpj: raw.cnpj,
        razaoSocial: raw.razaoSocial,
        nomeFantasia: raw.nomeFantasia,
        inscricaoEstadual: raw.inscricaoEstadual,
        isMatriz: raw.matriz,
        cep: raw.endereco?.cep,
        street: raw.endereco?.logradouro,
        number: raw.endereco?.numero,
        complement: raw.endereco?.complemento,
        neighborhood: raw.endereco?.bairro,
        city: raw.endereco?.cidade,
        state: raw.endereco?.uf,
        active: true,
    };
}
