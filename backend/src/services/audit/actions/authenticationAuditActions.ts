export const AUTHENTICATION_AUDIT_ACTIONS = {
  LOGGED_IN: 'authentication.logged_in',
  LOGGED_OUT: 'authentication.logged_out',
} as const;

export type AuthenticationAuditAction = (typeof AUTHENTICATION_AUDIT_ACTIONS)[keyof typeof AUTHENTICATION_AUDIT_ACTIONS];
