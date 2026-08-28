import { AUTHENTICATION_AUDIT_ACTIONS, type AuthenticationAuditAction } from './authenticationAuditActions';
import { CLIENT_AUDIT_ACTIONS, type ClientAuditAction } from './clientAuditActions';
import { COMMERCIAL_GROUP_AUDIT_ACTIONS, type CommercialGroupAuditAction } from './commercialGroupAuditActions';
import { COMPANY_AUDIT_ACTIONS, type CompanyAuditAction } from './companyAuditActions';
import { DELIVERY_TYPE_AUDIT_ACTIONS, type DeliveryTypeAuditAction } from './deliveryTypeAuditActions';
import { ERP_INTEGRATION_AUDIT_ACTIONS, type ErpIntegrationAuditAction } from './erpIntegrationAuditActions';
import { ORDER_AUDIT_ACTIONS, type OrderAuditAction } from './orderAuditActions';
import { ORDER_SESSION_AUDIT_ACTIONS, type OrderSessionAuditAction } from './orderSessionAuditActions';
import { PAYMENT_INTEGRATION_AUDIT_ACTIONS, type PaymentIntegrationAuditAction } from './paymentIntegrationAuditActions';
import { PROVIDER_ORDER_AUDIT_ACTIONS, type ProviderOrderAuditAction } from './providerOrderAuditActions';
import { USER_AUDIT_ACTIONS, type UserAuditAction } from './userAuditActions';

export { AUTHENTICATION_AUDIT_ACTIONS, CLIENT_AUDIT_ACTIONS, COMMERCIAL_GROUP_AUDIT_ACTIONS, COMPANY_AUDIT_ACTIONS, DELIVERY_TYPE_AUDIT_ACTIONS, ERP_INTEGRATION_AUDIT_ACTIONS, ORDER_AUDIT_ACTIONS, ORDER_SESSION_AUDIT_ACTIONS, PAYMENT_INTEGRATION_AUDIT_ACTIONS, PROVIDER_ORDER_AUDIT_ACTIONS, USER_AUDIT_ACTIONS };

export type AuditAction = ClientAuditAction | CommercialGroupAuditAction | CompanyAuditAction | DeliveryTypeAuditAction | ErpIntegrationAuditAction | OrderAuditAction | OrderSessionAuditAction | PaymentIntegrationAuditAction | ProviderOrderAuditAction | AuthenticationAuditAction | UserAuditAction;

export type AuditEntityType = 'client' | 'commercial_group' | 'company' | 'delivery_type' | 'erp_integration' | 'order' | 'order_session' | 'payment_integration' | 'provider_order' | 'user';

// Este mapa Ã© o contrato que impede, por exemplo, registrar
// `client.created` para a entidade `order_session`.
export const AUDIT_ENTITY_BY_ACTION = {
  [CLIENT_AUDIT_ACTIONS.CREATED]: 'client',
  [CLIENT_AUDIT_ACTIONS.UPDATED]: 'client',
  [COMMERCIAL_GROUP_AUDIT_ACTIONS.CREATED]: 'commercial_group',
  [COMMERCIAL_GROUP_AUDIT_ACTIONS.UPDATED]: 'commercial_group',
  [COMMERCIAL_GROUP_AUDIT_ACTIONS.ACTIVATED]: 'commercial_group',
  [COMMERCIAL_GROUP_AUDIT_ACTIONS.DEACTIVATED]: 'commercial_group',
  [COMMERCIAL_GROUP_AUDIT_ACTIONS.MEMBER_ADDED]: 'commercial_group',
  [COMMERCIAL_GROUP_AUDIT_ACTIONS.MEMBER_REMOVED]: 'commercial_group',
  [COMMERCIAL_GROUP_AUDIT_ACTIONS.PRIMARY_MEMBER_CHANGED]: 'commercial_group',
  [COMPANY_AUDIT_ACTIONS.CREATED]: 'company',
  [COMPANY_AUDIT_ACTIONS.UPDATED]: 'company',
  [DELIVERY_TYPE_AUDIT_ACTIONS.UPDATED]: 'delivery_type',
  [DELIVERY_TYPE_AUDIT_ACTIONS.ACTIVATED]: 'delivery_type',
  [DELIVERY_TYPE_AUDIT_ACTIONS.DEACTIVATED]: 'delivery_type',
  [ERP_INTEGRATION_AUDIT_ACTIONS.CONFIGURED]: 'erp_integration',
  [ERP_INTEGRATION_AUDIT_ACTIONS.ACTIVATED]: 'erp_integration',
  [ERP_INTEGRATION_AUDIT_ACTIONS.DEACTIVATED]: 'erp_integration',
  [PAYMENT_INTEGRATION_AUDIT_ACTIONS.CONFIGURED]: 'payment_integration',
  [PAYMENT_INTEGRATION_AUDIT_ACTIONS.ACTIVATED]: 'payment_integration',
  [PAYMENT_INTEGRATION_AUDIT_ACTIONS.DEACTIVATED]: 'payment_integration',
  [ORDER_AUDIT_ACTIONS.MANUALLY_MARKED_PAID]: 'order',
  [ORDER_AUDIT_ACTIONS.MANUALLY_CANCELLED]: 'order',
  [ORDER_AUDIT_ACTIONS.FREIGHT_METHOD_CHANGED]: 'order',
  [ORDER_SESSION_AUDIT_ACTIONS.CREATED]: 'order_session',
  [PROVIDER_ORDER_AUDIT_ACTIONS.RESEND_REQUESTED]: 'provider_order',
  [PROVIDER_ORDER_AUDIT_ACTIONS.CANCEL_REQUESTED]: 'provider_order',
  [AUTHENTICATION_AUDIT_ACTIONS.LOGGED_IN]: 'user',
  [AUTHENTICATION_AUDIT_ACTIONS.LOGGED_OUT]: 'user',
  [USER_AUDIT_ACTIONS.CREATED]: 'user',
  [USER_AUDIT_ACTIONS.UPDATED]: 'user',
} as const satisfies Record<AuditAction, AuditEntityType>;

export type EntityForAuditAction<A extends AuditAction> = (typeof AUDIT_ENTITY_BY_ACTION)[A];
