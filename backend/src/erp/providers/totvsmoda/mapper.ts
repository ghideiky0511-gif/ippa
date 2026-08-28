import type {
    CartItem,
    Client,
    Company,
    Order,
    Product,
    Variant,
} from "@/lib/types";
import { OrderChannelSchema } from "@/contracts/orders";
import type {
    ErpCompositionSnapshot,
    ErpOrderPushContext,
    ErpReferenceSnapshot,
    NonRetryableErpOrderError,
} from "@/erp/types";
import type {
    TotvsModaCancelOrderInput,
    TotvsModaCredentials,
    TotvsModaDocumentType,
    TotvsModaOrderDiscountInput,
    TotvsModaOrderInput,
    TotvsModaOrderItemInput,
    TotvsModaOrderPaymentInput,
} from "./client";

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
    typeNameAux?: string;
    code?: string;
    name?: string;
    nameAux?: string;
}

// ReferenceDetailModel retornado com expand=details. A descrição principal
// cadastrada no TOTVS fica neste nível, enquanto `description` na raiz da
// referência pode vir nula.
export interface TotvsModaReferenceDetail {
    typeCode?: number;
    type?: string;
    auxiliaryType?: string;
    title?: string | null;
    description?: string | null;
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
    description?: string;
    descriptive?: string;
    details?: TotvsModaReferenceDetail[];
    maxChangeFilterDate?: string;
    classifications?: TotvsModaClassification[];
}

export interface TotvsModaPriceItem {
    branchCode?: number;
    priceCode?: number;
    price?: number | string;
    promotionalPrice?: number | string | null;
}

export interface TotvsModaPriceRow {
    productCode?: number;
    prices?: TotvsModaPriceItem[];
}

function validPrice(value: number | string | null | undefined): number | undefined {
    if (value === null || value === undefined || value === "") return undefined;
    const numeric = typeof value === "number" ? value : Number(value);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : undefined;
}

function valueOfTotvsModaPrice(item: TotvsModaPriceItem): number | undefined {
    return validPrice(item.promotionalPrice) ?? validPrice(item.price);
}

// price = preço normal/cheio, sempre o que vai para products.price/
// product_variants.price. promotionalPrice só aparece quando válido E menor
// que o preço normal -- nunca substitui `price`, quem decide o que fazer com
// a promoção é o chamador (ver catalogSyncService.processReference, que
// grava como desconto "peças específicas", não como troca de preço base).
export interface TotvsModaPriceSelection {
    price: number;
    promotionalPrice?: number;
}

function detailOfTotvsModaPrice(item: TotvsModaPriceItem): TotvsModaPriceSelection | undefined {
    const price = validPrice(item.price);
    // O ERP usa 0 para dizer "sem promoção cadastrada", não um preço
    // promocional de fato -- tratar 0 como válido gerava desconto de 100%
    // com "Promoção R$ 0,00" na vitrine.
    const rawPromotionalPrice = validPrice(item.promotionalPrice);
    const promotionalPrice = rawPromotionalPrice !== undefined && rawPromotionalPrice > 0
        ? rawPromotionalPrice
        : undefined;
    if (price === undefined) {
        // Sem preço normal cadastrado: usa a promoção como valor único
        // (mesmo fallback que o comportamento antigo tinha), já que não há
        // preço "cheio" para comparar.
        return promotionalPrice !== undefined ? { price: promotionalPrice } : undefined;
    }
    return promotionalPrice !== undefined && promotionalPrice < price
        ? { price, promotionalPrice }
        : { price };
}

/**
 * Escolhe o primeiro código configurado que realmente tenha valor. A API pode
 * devolver o item de um código solicitado com os campos de valor vazios; isso
 * não deve impedir o fallback para o próximo código configurado.
 */
export function selectTotvsModaPrice(
    row: TotvsModaPriceRow,
    priceCodeList: number[],
): TotvsModaPriceSelection | undefined {
    for (const priceCode of priceCodeList) {
        const candidates =
            row.prices?.filter((item) => item.priceCode === priceCode) ?? [];
        for (const candidate of candidates) {
            const detail = detailOfTotvsModaPrice(candidate);
            if (detail !== undefined) return detail;
        }
    }
    for (const candidate of row.prices ?? []) {
        const detail = detailOfTotvsModaPrice(candidate);
        if (detail !== undefined) return detail;
    }
    return undefined;
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

// RelatedModel (person/v2/.../search com expand "relateds") — coligados do
// PESFM010 (PESFM024), cada um já com o próprio CPF/CNPJ. Só vem quando
// pedido explicitamente no expand (ver TotvsModaClient.searchIndividualRelateds/
// searchLegalEntityRelateds) — nenhuma busca em lote (searchIndividuals/
// searchLegalEntities, usadas por getClients) pede esse campo, pra não
// pesar o sync de clientes com um dado que só a tela de grupo comercial usa.
export interface TotvsModaRelated {
    code?: number;
    cpfCnpj?: string;
    name?: string;
}

function primaryAddress(
    addresses: TotvsModaAddress[] | undefined,
): TotvsModaAddress | undefined {
    return addresses?.[0];
}

function primaryEmail(
    emails: TotvsModaEmail[] | undefined,
): string | undefined {
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
    relateds?: TotvsModaRelated[];
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
    relateds?: TotvsModaRelated[];
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
function findClassification(
    classifications: TotvsModaClassification[] | undefined,
    ...keywords: string[]
): string | undefined {
    const match = classifications?.find((c) =>
        keywords.some((keyword) =>
            (c.typeName ?? "").toLowerCase().includes(keyword),
        ),
    );
    return match?.name;
}

export function referenceCodeOfTotvsModaProduct(
    row: TotvsModaProductRow,
): string {
    return String(
        row.ReferenceCode ?? row.referenceId ?? row.productCode ?? "",
    ).trim();
}

function firstNonEmptyText(
    values: Array<string | null | undefined>,
): string | undefined {
    return values
        .find(
            (value): value is string =>
                typeof value === "string" && value.trim().length > 0,
        )
        ?.trim();
}

function descriptionOfTotvsModaReference(rows: TotvsModaProductRow[]): string {
    return (
        firstNonEmptyText([
            ...rows.flatMap((row) =>
                (row.details ?? []).map((detail) => detail.description),
            ),
            ...rows.flatMap((row) => [row.description, row.descriptive]),
        ]) ?? ""
    );
}

export function mapTotvsModaReferenceSnapshot(
    rows: TotvsModaProductRow[],
): ErpReferenceSnapshot | null {
    const first = rows[0];
    if (!first) return null;
    const externalId = referenceCodeOfTotvsModaProduct(first);
    if (!externalId) return null;
    const classifications = Array.from(
        new Map(
            rows
                .flatMap((row) => row.classifications ?? [])
                .map((classification) => [
                    `${classification.typeCode ?? ""}:${classification.code ?? classification.name ?? ""}`,
                    classification,
                ]),
        ).values(),
    );
    return {
        externalId,
        name: first.referenceName ?? first.productName ?? externalId,
        description: descriptionOfTotvsModaReference(rows),
        classifications: classifications.map((classification) => ({
            typeCode: classification.typeCode,
            typeName: classification.typeName,
            code: classification.code,
            name: classification.name,
            typeNameAux: classification.typeNameAux,
            nameAux: classification.nameAux,
        })),
        skus: rows.flatMap((row) => {
            if (row.productCode === undefined) return [];
            return [
                {
                    externalId: String(row.productCode),
                    sku: row.productSku?.trim() || undefined,
                    color: row.colorName ?? row.colorCode ?? "",
                    size: row.size ?? "",
                    isActive: row.isActive !== false,
                    isBlocked: row.isBlocked === true,
                    classifications: (row.classifications ?? []).map(
                        (classification) => ({
                            typeCode: classification.typeCode,
                            typeName: classification.typeName,
                            code: classification.code,
                            name: classification.name,
                            typeNameAux: classification.typeNameAux,
                            nameAux: classification.nameAux,
                        }),
                    ),
                },
            ];
        }),
    };
}

// CompositionGroupProductResultModel (product/v2/composition-group-product,
// "composição por grupo" — ver comentário em client.ts:searchCompositionGroupProducts):
// um grupo pode ter mais de uma composição (ex.: "PRINCIPAL" x tecido de forro),
// cada uma com sua lista de fibras. Achatamos direto pra uma lista de
// ErpCompositionSnapshot, sem representar o grupo como entidade própria — o
// que interessa pro produto é "quais composições ele tem", não o grupo em si.
interface TotvsModaCompositionItemRow {
    fiberCode?: number;
    fiberDescription?: string;
    fiberPercentage?: number;
}

interface TotvsModaCompositionRow {
    code?: number | string;
    description?: string;
    typeDescription?: string;
    itemsComposition?: TotvsModaCompositionItemRow[];
}

export interface TotvsModaCompositionGroupRow {
    groupCode?: string;
    groupDescription?: string;
    compositions?: TotvsModaCompositionRow[];
}

export function mapTotvsModaCompositions(
    rows: TotvsModaCompositionGroupRow[],
): ErpCompositionSnapshot[] {
    return rows
        .flatMap((group) =>
            (group.compositions ?? []).map((composition) => ({
                externalCode: String(composition.code ?? "").trim(),
                description: composition.description ?? "",
                typeDescription: composition.typeDescription,
                externalGroupCode: group.groupCode,
                groupDescription: group.groupDescription,
                items: (composition.itemsComposition ?? []).map((item) => ({
                    externalCode:
                        item.fiberCode !== undefined
                            ? String(item.fiberCode)
                            : undefined,
                    material: item.fiberDescription ?? "",
                    percentage: item.fiberPercentage ?? 0,
                })),
            })),
        )
        .filter((composition) => composition.externalCode);
}

function sumStock(
    productCode: number | undefined,
    balanceByCode: Map<number, TotvsModaBalanceRow>,
): number {
    if (productCode === undefined) return 0;
    const balances = balanceByCode.get(productCode)?.balances ?? [];
    return balances.reduce((sum, item) => sum + (item.stock ?? 0), 0);
}

function priceFor(
    productCode: number | undefined,
    priceByCode: Map<number, TotvsModaPriceRow>,
): number {
    if (productCode === undefined) return 0;
    const item = priceByCode.get(productCode)?.prices?.[0];
    return item ? (valueOfTotvsModaPrice(item) ?? 0) : 0;
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
    const priceByCode = new Map(
        priceRows
            .filter((r) => r.productCode !== undefined)
            .map((r) => [r.productCode as number, r]),
    );
    const balanceByCode = new Map(
        balanceRows
            .filter((r) => r.productCode !== undefined)
            .map((r) => [r.productCode as number, r]),
    );

    const groups = new Map<string, TotvsModaProductRow[]>();
    for (const row of rows) {
        const key = referenceCodeOfTotvsModaProduct(row);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(row);
    }

    return Array.from(groups.entries()).map(([referenceCode, skuRows]) => {
        const first = skuRows[0];
        const colors = Array.from(
            new Set(
                skuRows.map((r) => r.colorName).filter((v): v is string => !!v),
            ),
        );
        const sizes = Array.from(
            new Set(skuRows.map((r) => r.size).filter((v): v is string => !!v)),
        );
        const variants: Variant[] = skuRows.map((row, index) => {
            const stockQty = sumStock(row.productCode, balanceByCode);
            return {
                id: String(row.productCode ?? `${referenceCode}-${index}`),
                color: row.colorName ?? "",
                size: row.size ?? "",
                price: priceFor(row.productCode, priceByCode),
                availability:
                    row.isActive === false || row.isBlocked
                        ? "out_of_stock"
                        : stockQty > 0
                          ? "in_stock"
                          : "out_of_stock",
                stockQty,
                classifications: [],
            };
        });
        const price = variants.find((v) => v.price > 0)?.price ?? 0;
        return {
            externalId: referenceCode,
            data: {
                name: first.referenceName ?? first.productName ?? "",
                description: "",
                referenceId: referenceCode,
                price,
                colors,
                sizes,
                variants,
            },
        };
    });
}

export function mapTotvsModaOrder(
    raw: TotvsModaOrder,
): Omit<Order, "id" | "orderNumber"> {
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
export function mapTotvsModaIndividualClient(
    raw: TotvsModaIndividual,
): Omit<Client, "id" | "createdAt" | "updatedAt"> {
    const address = primaryAddress(raw.addresses);
    return {
        name: raw.name ?? "",
        cpfCnpj: raw.cpf,
        email: primaryEmail(raw.emails),
        cep: address?.cep,
        street: address?.address,
        number:
            address?.addressNumber !== undefined
                ? String(address.addressNumber)
                : undefined,
        complement: address?.complement,
        neighborhood: address?.neighborhood,
        city: address?.cityName,
        state: address?.stateAbbreviation,
    };
}

export function mapTotvsModaLegalEntityClient(
    raw: TotvsModaLegalEntity,
): Omit<Client, "id" | "createdAt" | "updatedAt"> {
    const address = primaryAddress(raw.addresses);
    return {
        name: raw.name ?? raw.fantasyName ?? "",
        cpfCnpj: raw.cnpj,
        email: primaryEmail(raw.emails),
        cep: address?.cep,
        street: address?.address,
        number:
            address?.addressNumber !== undefined
                ? String(address.addressNumber)
                : undefined,
        complement: address?.complement,
        neighborhood: address?.neighborhood,
        city: address?.cityName,
        state: address?.stateAbbreviation,
    };
}

// Erro de MAPEAMENTO (antes de qualquer chamada HTTP): falta dado que o
// TOTVS exige e que não existe no nosso lado ainda -- credenciais/config
// incompletas, cliente sem documento, produto sem reference_id sincronizado.
// Retentar sem corrigir o cadastro nunca resolve sozinho, por isso implementa
// NonRetryableErpOrderError (mesmo motivo de TotvsModaOrderRejectedError em
// errors.ts, só que detectado antes de chamar a API, não depois).
export class TotvsModaOrderMappingError
    extends Error
    implements NonRetryableErpOrderError
{
    readonly nonRetryable = true as const;
    constructor(message: string) {
        super(message);
        this.name = "TotvsModaOrderMappingError";
    }
}

// Meio de pagamento ainda é texto livre/mockado no domínio interno (ver
// CreateCustomerOrderInputSchema em contracts/orders.ts — frete e pagamento
// reais ainda não existem) — esta é uma heurística por palavra-chave, não
// uma integração de verdade com o meio de pagamento. "Invoice" (fatura) é o
// fallback quando nada bate, por ser o tipo mais neutro (não exige dado de
// cartão/NSU que não temos).
function mapPaymentMethodToDocumentType(
    paymentMethod: string | undefined,
): TotvsModaDocumentType {
    const normalized = (paymentMethod ?? "").toLowerCase();
    if (normalized.includes("pix")) return "Pix";
    if (normalized.includes("boleto")) return "Billet";
    if (normalized.includes("debito") || normalized.includes("débito"))
        return "DebitCard";
    if (
        normalized.includes("credito") ||
        normalized.includes("crédito") ||
        normalized.includes("cartao") ||
        normalized.includes("cartão")
    )
        return "CreditCard";
    if (normalized.includes("dinheiro") || normalized.includes("cash"))
        return "Cash";
    return "Invoice";
}

// OrderInDto exige branchCode/operationCode/paymentConditionCode/priorityCode/
// representative(Code|CpfCnpj) -- parâmetros de negócio do TOTVS sem
// equivalente no domínio interno (Order), por isso vêm de credentials
// (configurados por tenant, ver providerCatalog.ts), não do pedido.
// customerCpfCnpj e o reference_id de cada item vêm de `context`, resolvido
// por quem tem acesso a banco (orderPushService) -- este mapper não consulta
// nada, só transforma o que já chegou pronto.
export function mapOrderToTotvsModaOrderInDto(
    order: Order,
    context: ErpOrderPushContext,
    credentials: TotvsModaCredentials,
    orderId: string,
): TotvsModaOrderInput {
    if (
        !credentials.defaultOperationCode ||
        !credentials.defaultPaymentConditionCode ||
        !credentials.defaultPriorityCode
    ) {
        throw new TotvsModaOrderMappingError(
            "Configuração do TOTVS Moda incompleta: código de operação, condição de pagamento ou prioridade não definidos.",
        );
    }
    if (!credentials.representativeCode && !credentials.representativeCpfCnpj) {
        throw new TotvsModaOrderMappingError(
            "Configuração do TOTVS Moda incompleta: representante (código ou CPF/CNPJ) não definido.",
        );
    }
    // "Um dos dois, nunca os dois" -- mesma regra que customerCode/
    // customerCpfCnpj e branchCode/orderCode/orderId têm na doc do TOTVS;
    // configurar os dois é ambíguo (qual prevalece?), então falha alto em
    // vez de silenciosamente preferir representativeCode.
    if (credentials.representativeCode && credentials.representativeCpfCnpj) {
        throw new TotvsModaOrderMappingError(
            "Configuração do TOTVS Moda ambígua: defina representante por código OU por CPF/CNPJ, não os dois.",
        );
    }
    if (!context.clientDocument) {
        throw new TotvsModaOrderMappingError(
            "Cliente do pedido não tem CPF/CNPJ cadastrado -- necessário para enviar o pedido ao TOTVS Moda.",
        );
    }
    if (order.items.length === 0) {
        throw new TotvsModaOrderMappingError(
            "Pedido sem itens -- nada para enviar ao TOTVS Moda.",
        );
    }

    const items: TotvsModaOrderItemInput[] = order.items.map((item) => {
        // productCode (não productSku): productSku é o código da REFERÊNCIA
        // (compartilhado por todas as variantes de cor/tamanho de um produto
        // no nosso catálogo -- ver products.reference_id), então mandar o
        // mesmo valor em duas linhas de item do mesmo pedido (ex.: dois
        // tamanhos da mesma peça) o TOTVS rejeita com RepeatedValue. productCode
        // é o código da VARIANTE (erp_external_references, entity_type
        // product_variant), único por item.
        const productCode = context.productCodesByItemKey[item.key];
        if (!productCode) {
            throw new TotvsModaOrderMappingError(
                `Produto "${item.name}" (${item.id}) sem productCode do TOTVS Moda sincronizado -- não é possível enviar este item.`,
            );
        }
        return { productCode: Number(productCode), quantity: item.qty, price: item.price };
    });

    // Simplificação deliberada: um pagamento à vista pelo total do pedido
    // (já líquido de desconto e com frete somado). O domínio interno não
    // rastreia parcelas nem múltiplos meios de pagamento por pedido hoje
    // (ver comentário de mapPaymentMethodToDocumentType) -- revisar quando/se
    // isso passar a existir. LIMITAÇÃO CONHECIDA, não validada contra um
    // TOTVS real: a doc não deixa claro se o valor esperado em payments para
    // reconciliar com totalAmountOrder é o total líquido (o que mandamos
    // aqui) ou o bruto dos itens sem o desconto -- best-effort até termos
    // confirmação/acesso a sandbox para testar um pedido com desconto de
    // verdade.
    const payments: TotvsModaOrderPaymentInput[] | undefined =
        order.total > 0
            ? [
                  {
                      documentType: mapPaymentMethodToDocumentType(
                          order.paymentMethod,
                      ),
                      installment: 1,
                      paymentValue: order.total,
                  },
              ]
            : undefined;

    // totalAmountOrder é conferido pelo TOTVS contra a soma de items e
    // payments (doc: "utilizado para conferência da soma dos itens e dos
    // pagamentos") -- e order.total = Σ(item.price×qty) - discount + frete
    // (ver paymentService.confirmPayment). Sem freightValue/discounts abaixo,
    // qualquer pedido com frete ou desconto manda um totalAmountOrder que não
    // bate com a soma dos itens sozinha, e o TOTVS rejeitaria o pedido.
    const freightValue = order.freight?.price;
    let discounts: TotvsModaOrderDiscountInput[] | undefined;
    if (order.discount && order.discount.amount > 0) {
        if (!credentials.defaultDiscountTypeCode) {
            throw new TotvsModaOrderMappingError(
                "Configuração do TOTVS Moda incompleta: código de tipo de desconto (defaultDiscountTypeCode) não definido, e este pedido tem desconto.",
            );
        }
        discounts = [
            {
                typeDiscountCode: credentials.defaultDiscountTypeCode,
                discountValue: order.discount.amount,
            },
        ];
    }

    return {
        orderId,
        branchCode: credentials.branchCode,
        orderDate: order.date,
        customerCpfCnpj: context.clientDocument,
        representativeCode: credentials.representativeCode,
        representativeCpfCnpj: credentials.representativeCode
            ? undefined
            : credentials.representativeCpfCnpj,
        operationCode: credentials.defaultOperationCode,
        paymentConditionCode: credentials.defaultPaymentConditionCode,
        priorityCode: credentials.defaultPriorityCode,
        statusOrder: 1,
        totalAmountOrder: order.total,
        items,
        payments,
        discounts,
        freightValue,
    };
}

// CancelOrderInDto: identifica por branchCode+orderCode (ver comentário em
// TotvsModaCancelOrderInput, client.ts, sobre por que não usamos orderId).
// reasonCancellationCode é catálogo do próprio TOTVS do tenant (Motivo
// canc.) -- sem valor configurado não há como cancelar corretamente, então
// lança TotvsModaOrderMappingError em vez de adivinhar um código.
export function mapCancelOrderInput(
    externalOrderCode: string,
    credentials: TotvsModaCredentials,
    reason?: string,
): TotvsModaCancelOrderInput {
    if (!credentials.defaultReasonCancellationCode) {
        throw new TotvsModaOrderMappingError(
            "Configuração do TOTVS Moda incompleta: motivo de cancelamento (defaultReasonCancellationCode) não definido.",
        );
    }
    const orderCode = Number(externalOrderCode);
    if (!Number.isFinite(orderCode)) {
        throw new TotvsModaOrderMappingError(
            `external_id "${externalOrderCode}" não é um orderCode válido do TOTVS Moda.`,
        );
    }
    return {
        branchCode: credentials.branchCode,
        orderCode,
        reasonCancellationCode: credentials.defaultReasonCancellationCode,
        ReasonCancellationDescription: reason?.slice(0, 80),
    };
}

// BranchListModel não tem inscrição estadual, matriz/filial ou ativo/inativo
// — só o que dá pra preencher com segurança fica preenchido; isMatriz/active
// ficam com um default fixo até a API expor isso por outro campo/endpoint.
export function mapTotvsModaCompany(
    raw: TotvsModaBranch,
): Omit<Company, "id" | "createdAt" | "updatedAt"> {
    const address = primaryAddress(raw.addresses);
    return {
        cnpj: raw.cnpj ?? "",
        razaoSocial: raw.personName ?? raw.fantasyName ?? "",
        nomeFantasia: raw.fantasyName,
        isMatriz: false,
        cep: address?.cep,
        street: address?.address,
        number:
            address?.addressNumber !== undefined
                ? String(address.addressNumber)
                : undefined,
        complement: address?.complement,
        neighborhood: address?.neighborhood,
        city: address?.cityName,
        state: address?.stateAbbreviation,
        active: true,
    };
}
