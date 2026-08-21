import type { CartItem, Client, Company, Order, Product, Variant } from "@/lib/types";
import { OrderChannelSchema } from "@/contracts/orders";

// Adequação do formato bruto do TOTVS Moda para os tipos internos — só aqui,
// igual mock/mapper.ts faz para o mock. Os tipos de produto (prefixo
// TotvsModaProduct.../TotvsModaPrice.../TotvsModaBalance...) seguem
// literalmente o schema documentado em docs/products.json (ProductDataModel,
// ProductPriceModel, ProductBalanceModel), e os tipos de pessoa
// (TotvsModaIndividual/TotvsModaLegalEntity/TotvsModaBranch) seguem
// docs/person.json (IndividualDataModel, LegalEntityDataModel,
// BranchListModel) — nenhum dos dois é guess. Orders (sales-order/v2) ainda
// não tem documentação equivalente: os tipos correspondentes mais abaixo
// continuam best-effort, a revisar quando a doc dessa API aparecer.

// Uma linha de product/v2/products/search é um SKU (produto+cor+tamanho),
// não uma "referência" (o item vendável com várias cores/tamanhos, que é o
// que Product representa aqui) — ReferenceCode agrupa as linhas que formam
// um Product (ver groupTotvsModaProducts). Note o "ReferenceCode" com R
// maiúsculo: é como a API realmente devolve o campo (inconsistente com o
// resto, que é camelCase), confirmado em docs/products.json.
export interface TotvsModaClassification {
    typeCode?: number;
    typeName?: string;
    code?: string;
    name?: string;
}

export interface TotvsModaProductRow {
    productCode?: number;
    productSku?: string;
    productName?: string;
    colorCode?: string;
    colorName?: string;
    size?: string;
    isActive?: boolean;
    isBlocked?: boolean;
    ReferenceCode?: string;
    referenceId?: number;
    referenceName?: string;
    classifications?: TotvsModaClassification[];
}

export interface TotvsModaPriceItem {
    branchCode?: number;
    priceCode?: number;
    price?: number;
    promotionalPrice?: number;
}

export interface TotvsModaPriceRow {
    productCode?: number;
    prices?: TotvsModaPriceItem[];
}

export interface TotvsModaBalanceItem {
    branchCode?: number;
    stockCode?: number;
    stock?: number;
}

export interface TotvsModaBalanceRow {
    productCode?: number;
    balances?: TotvsModaBalanceItem[];
}

// ViewAddressModel/EmailDataModel — mesmo formato usado em IndividualDataModel,
// LegalEntityDataModel e BranchListModel (docs/person.json), por isso um
// único par de tipos/helpers serve para os três.
export interface TotvsModaAddress {
    address?: string;
    addressNumber?: number;
    complement?: string;
    neighborhood?: string;
    cityName?: string;
    stateAbbreviation?: string;
    cep?: string;
}

export interface TotvsModaEmail {
    email?: string;
    isDefault?: boolean;
}

function primaryAddress(addresses: TotvsModaAddress[] | undefined): TotvsModaAddress | undefined {
    return addresses?.[0];
}

function primaryEmail(emails: TotvsModaEmail[] | undefined): string | undefined {
    return (emails?.find((e) => e.isDefault) ?? emails?.[0])?.email;
}

// IndividualDataModel (person/v2/individuals/search) — uma linha por pessoa
// física, chave de busca é "cpf" (IndividualFilterModel.cpfList).
export interface TotvsModaIndividual {
    code?: number;
    cpf?: string;
    name?: string;
    isInactive?: boolean;
    addresses?: TotvsModaAddress[];
    emails?: TotvsModaEmail[];
}

// LegalEntityDataModel (person/v2/legal-entities/search) — mesmo papel, para
// pessoa jurídica, chave de busca "cnpj" (LegalEntityFilterModel.cnpjList).
export interface TotvsModaLegalEntity {
    code?: number;
    cnpj?: string;
    name?: string;
    fantasyName?: string;
    isInactive?: boolean;
    addresses?: TotvsModaAddress[];
    emails?: TotvsModaEmail[];
}

// BranchListModel (person/v2/branchesList) — não tem os campos que
// mapTotvsModaCompany assumia antes (isHeadquarters, active,
// stateRegistration não existem neste schema): isMatriz/active ficam com
// default fixo até a API expor essa informação por outro meio.
export interface TotvsModaBranch {
    code?: number;
    cnpj?: string;
    personName?: string;
    fantasyName?: string;
    addresses?: TotvsModaAddress[];
}

export interface TotvsModaOrderItem {
    productCode?: string | number;
    productDescription?: string;
    quantity?: number;
    unitPrice?: number;
    color?: string;
    size?: string;
}

export interface TotvsModaOrder {
    orderNumber?: string | number;
    issueDate?: string;
    salesChannel?: string;
    items?: TotvsModaOrderItem[];
}

// ClassificationModel não tem um campo fixo "é categoria"/"é marca": tipos de
// classificação são configuráveis por tenant (PRDFL011). Na ausência da
// tabela de tipos configurada, usamos o nome do tipo (typeName) como
// heurística — funciona para as nomeações usuais da TOTVS ("Categoria",
// "Subcategoria", "Marca"), mas o certo a médio prazo é receber os
// typeCodes corretos via credentials, igual branchCode/priceCodeList.
function findClassification(classifications: TotvsModaClassification[] | undefined, ...keywords: string[]): string | undefined {
    const match = classifications?.find((c) => keywords.some((keyword) => (c.typeName ?? "").toLowerCase().includes(keyword)));
    return match?.name;
}

function sumStock(productCode: number | undefined, balanceByCode: Map<number, TotvsModaBalanceRow>): number {
    if (productCode === undefined) return 0;
    const balances = balanceByCode.get(productCode)?.balances ?? [];
    return balances.reduce((sum, item) => sum + (item.stock ?? 0), 0);
}

function priceFor(productCode: number | undefined, priceByCode: Map<number, TotvsModaPriceRow>): number {
    if (productCode === undefined) return 0;
    const item = priceByCode.get(productCode)?.prices?.[0];
    return item?.promotionalPrice ?? item?.price ?? 0;
}

// products/search devolve uma linha por SKU; agrupamos por ReferenceCode
// (a "referência"/item vendável) para montar o Product com colors/sizes/
// variants, cruzando preço (prices/search) e saldo (balances/search) por
// productCode — ver TotvsModaClient.searchProducts/searchProductPrices/
// searchProductBalances. Uma referência cujos SKUs caiam em páginas
// diferentes de products/search (paginação é por linha, não por referência)
// fica fatiada em mais de um Product; é uma limitação conhecida do modelo de
// paginação por cursor deste provider, não um bug de mapeamento.
export function groupTotvsModaProducts(
    rows: TotvsModaProductRow[],
    priceRows: TotvsModaPriceRow[],
    balanceRows: TotvsModaBalanceRow[],
): Array<{ externalId: string; data: Omit<Product, "id"> }> {
    const priceByCode = new Map(priceRows.filter((r) => r.productCode !== undefined).map((r) => [r.productCode as number, r]));
    const balanceByCode = new Map(balanceRows.filter((r) => r.productCode !== undefined).map((r) => [r.productCode as number, r]));

    const groups = new Map<string, TotvsModaProductRow[]>();
    for (const row of rows) {
        const key = row.ReferenceCode ?? (row.referenceId !== undefined ? String(row.referenceId) : String(row.productCode));
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(row);
    }

    return Array.from(groups.entries()).map(([referenceCode, skuRows]) => {
        const first = skuRows[0];
        const colors = Array.from(new Set(skuRows.map((r) => r.colorName).filter((v): v is string => !!v)));
        const sizes = Array.from(new Set(skuRows.map((r) => r.size).filter((v): v is string => !!v)));
        const variants: Variant[] = skuRows.map((row, index) => {
            const stockQty = sumStock(row.productCode, balanceByCode);
            return {
                id: String(row.productCode ?? `${referenceCode}-${index}`),
                color: row.colorName ?? "",
                size: row.size ?? "",
                price: priceFor(row.productCode, priceByCode),
                availability: row.isActive === false || row.isBlocked ? "out_of_stock" : stockQty > 0 ? "in_stock" : "out_of_stock",
                stockQty,
            };
        });
        const price = variants.find((v) => v.price > 0)?.price ?? 0;
        return {
            externalId: referenceCode,
            data: {
                name: first.referenceName ?? first.productName ?? "",
                description: "",
                category: findClassification(first.classifications, "categoria") ?? "",
                subcategory: findClassification(first.classifications, "subcategoria"),
                brand: findClassification(first.classifications, "marca"),
                referenceId: referenceCode,
                price,
                colors,
                sizes,
                variants,
            },
        };
    });
}

export function mapTotvsModaOrder(raw: TotvsModaOrder): Omit<Order, "id"> {
    const items: CartItem[] = (raw.items ?? []).map((item, index) => {
        const key = String(item.productCode ?? index);
        return {
            key,
            id: key,
            name: item.productDescription ?? "",
            color: item.color,
            size: item.size,
            price: item.unitPrice ?? 0,
            qty: item.quantity ?? 0,
        };
    });
    return {
        date: raw.issueDate ?? new Date().toISOString(),
        status: "pago",
        items,
        total: items.reduce((sum, item) => sum + item.price * item.qty, 0),
        channel: OrderChannelSchema.catch("online").parse(raw.salesChannel),
    };
}

// IndividualDataModel/LegalEntityDataModel só devolvem "addresses"/"emails"
// quando o "expand" da busca pede (ver TotvsModaClient.searchIndividuals/
// searchLegalEntities) — usamos sempre o primeiro endereço e o e-mail padrão
// (isDefault), já que Client não modela múltiplos endereços/e-mails por
// pessoa.
export function mapTotvsModaIndividualClient(raw: TotvsModaIndividual): Omit<Client, "id" | "createdAt" | "updatedAt"> {
    const address = primaryAddress(raw.addresses);
    return {
        name: raw.name ?? "",
        cpfCnpj: raw.cpf,
        email: primaryEmail(raw.emails),
        cep: address?.cep,
        street: address?.address,
        number: address?.addressNumber !== undefined ? String(address.addressNumber) : undefined,
        complement: address?.complement,
        neighborhood: address?.neighborhood,
        city: address?.cityName,
        state: address?.stateAbbreviation,
    };
}

export function mapTotvsModaLegalEntityClient(raw: TotvsModaLegalEntity): Omit<Client, "id" | "createdAt" | "updatedAt"> {
    const address = primaryAddress(raw.addresses);
    return {
        name: raw.name ?? raw.fantasyName ?? "",
        cpfCnpj: raw.cnpj,
        email: primaryEmail(raw.emails),
        cep: address?.cep,
        street: address?.address,
        number: address?.addressNumber !== undefined ? String(address.addressNumber) : undefined,
        complement: address?.complement,
        neighborhood: address?.neighborhood,
        city: address?.cityName,
        state: address?.stateAbbreviation,
    };
}

// BranchListModel não tem inscrição estadual, matriz/filial ou ativo/inativo
// — só o que dá pra preencher com segurança fica preenchido; isMatriz/active
// ficam com um default fixo até a API expor isso por outro campo/endpoint.
export function mapTotvsModaCompany(raw: TotvsModaBranch): Omit<Company, "id" | "createdAt" | "updatedAt"> {
    const address = primaryAddress(raw.addresses);
    return {
        cnpj: raw.cnpj ?? "",
        razaoSocial: raw.personName ?? raw.fantasyName ?? "",
        nomeFantasia: raw.fantasyName,
        isMatriz: false,
        cep: address?.cep,
        street: address?.address,
        number: address?.addressNumber !== undefined ? String(address.addressNumber) : undefined,
        complement: address?.complement,
        neighborhood: address?.neighborhood,
        city: address?.cityName,
        state: address?.stateAbbreviation,
        active: true,
    };
}
