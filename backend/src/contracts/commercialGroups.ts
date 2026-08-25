import { z } from "zod";
import { ClientSchema } from "./clients";
import { EntityIdSchema, IsoDateTimeSchema, OptionalCpfCnpjSchema, RequiredTextSchema } from "./shared";

// Só 'client' por enquanto — sem fornecedor/supplier nesta versão (ver
// commercial_groups.group_type CHECK na migration 027).
export const CommercialGroupTypeSchema = z.literal("client");
export type CommercialGroupType = z.infer<typeof CommercialGroupTypeSchema>;

export const CommercialGroupSchema = z.object({
    id: EntityIdSchema,
    name: RequiredTextSchema,
    groupType: CommercialGroupTypeSchema,
    isActive: z.boolean(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
});
export type CommercialGroup = z.infer<typeof CommercialGroupSchema>;

export const CreateCommercialGroupInputSchema = z.object({
    name: RequiredTextSchema,
});
export type CreateCommercialGroupInput = z.infer<typeof CreateCommercialGroupInputSchema>;

export const UpdateCommercialGroupInputSchema = CreateCommercialGroupInputSchema.partial();
export type UpdateCommercialGroupInput = z.infer<typeof UpdateCommercialGroupInputSchema>;

export const CommercialGroupMemberSchema = z.object({
    id: EntityIdSchema,
    groupId: EntityIdSchema,
    clientId: EntityIdSchema,
    isPrimary: z.boolean(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
});
export type CommercialGroupMember = z.infer<typeof CommercialGroupMemberSchema>;

// Vista usada nas telas: membro já com o cadastro do client embutido, pra
// evitar N chamadas separadas no front.
export const CommercialGroupMemberWithClientSchema = CommercialGroupMemberSchema.extend({
    client: ClientSchema,
});
export type CommercialGroupMemberWithClient = z.infer<typeof CommercialGroupMemberWithClientSchema>;

export const CommercialGroupWithMembersSchema = CommercialGroupSchema.extend({
    members: z.array(CommercialGroupMemberWithClientSchema),
});
export type CommercialGroupWithMembers = z.infer<typeof CommercialGroupWithMembersSchema>;

// Duas formas de adicionar um membro: apontando um client já existente
// (clientId, escolhido numa busca) ou por documento (dispara o mesmo fluxo
// local-then-ERP de findOrImportTenantClientByDocument). Nunca os dois ao
// mesmo tempo.
export const AddCommercialGroupMemberInputSchema = z.object({
    clientId: EntityIdSchema.optional(),
    document: OptionalCpfCnpjSchema,
    isPrimary: z.boolean().optional(),
}).refine((value) => Boolean(value.clientId) !== Boolean(value.document), {
    message: "Informe clientId ou document, nunca os dois.",
});
export type AddCommercialGroupMemberInput = z.infer<typeof AddCommercialGroupMemberInputSchema>;

// Coligado do TOTVS Moda (ver erp/types.ts:lookupRelatedPartiesByDocument) —
// ainda não é um client local, só um CPF/CNPJ + nome vindos do ERP. Cada um
// vira membro de fato só quando escolhido e enviado a
// POST .../members com { document }, que reaproveita o mesmo fluxo
// local-then-ERP de findOrImportTenantClientByDocument.
export const ErpRelatedPartySchema = z.object({
    cpfCnpj: RequiredTextSchema,
    name: RequiredTextSchema,
});
export type ErpRelatedParty = z.infer<typeof ErpRelatedPartySchema>;
