export const USER_AUDIT_ACTIONS = {
  CREATED: 'user.created',
} as const;

export type UserAuditAction = (typeof USER_AUDIT_ACTIONS)[keyof typeof USER_AUDIT_ACTIONS];
