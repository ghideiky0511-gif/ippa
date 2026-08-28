export const DELIVERY_TYPE_AUDIT_ACTIONS = {
  UPDATED: 'delivery_type.updated',
  ACTIVATED: 'delivery_type.activated',
  DEACTIVATED: 'delivery_type.deactivated',
} as const;

export type DeliveryTypeAuditAction = (typeof DELIVERY_TYPE_AUDIT_ACTIONS)[keyof typeof DELIVERY_TYPE_AUDIT_ACTIONS];
