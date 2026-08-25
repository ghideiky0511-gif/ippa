// Contratos sincronizados do backend: este arquivo conserva apenas o caminho
// de importação usado pela UI.
export * from "@/contracts/clients";
export {
    AdminUserSchema,
    AuthPermissionsSchema,
    AuthUserSchema,
    CatalogAreaSchema,
    ClientRegistrationSchema,
    ClientRegistrationUpdateSchema,
    CustomerSignupSchema,
    CreateUserCredentialsSchema,
    DEFAULT_SELLER_CATALOG_AREAS,
    PasswordSchema,
    UpdateTenantUserInputSchema,
    UserCredentialsSchema,
    type CatalogArea,
    type ClientRegistration,
    type ClientRegistrationUpdate,
    type CustomerSignup,
    type AdminUser,
    type AuthPermissions,
    type AuthUser,
    type UserCredentials,
    type UserRole,
} from "@/contracts/auth";
