export const COMMERCIAL_GROUP_AUDIT_ACTIONS = {
  CREATED: 'commercial_group.created',
  UPDATED: 'commercial_group.updated',
  ACTIVATED: 'commercial_group.activated',
  DEACTIVATED: 'commercial_group.deactivated',
  MEMBER_ADDED: 'commercial_group.member_added',
  MEMBER_REMOVED: 'commercial_group.member_removed',
  PRIMARY_MEMBER_CHANGED: 'commercial_group.primary_member_changed',
} as const;

export type CommercialGroupAuditAction = (typeof COMMERCIAL_GROUP_AUDIT_ACTIONS)[keyof typeof COMMERCIAL_GROUP_AUDIT_ACTIONS];
