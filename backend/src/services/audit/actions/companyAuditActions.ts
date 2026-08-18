export const COMPANY_AUDIT_ACTIONS = {
  CREATED: 'company.created',
  UPDATED: 'company.updated',
} as const;

export type CompanyAuditAction = (typeof COMPANY_AUDIT_ACTIONS)[keyof typeof COMPANY_AUDIT_ACTIONS];
