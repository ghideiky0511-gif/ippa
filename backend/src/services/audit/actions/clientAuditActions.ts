export const CLIENT_AUDIT_ACTIONS = {
  CREATED: 'client.created',
  UPDATED: 'client.updated',
} as const;

export type ClientAuditAction = (typeof CLIENT_AUDIT_ACTIONS)[keyof typeof CLIENT_AUDIT_ACTIONS];
