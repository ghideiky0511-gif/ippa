import { AUTHENTICATION_AUDIT_ACTIONS, type AuthenticationAuditAction } from './authenticationAuditActions';
import { CLIENT_AUDIT_ACTIONS, type ClientAuditAction } from './clientAuditActions';
import { CLIENT_CART_AUDIT_ACTIONS, type ClientCartAuditAction } from './clientCartAuditActions';
import { COMPANY_AUDIT_ACTIONS, type CompanyAuditAction } from './companyAuditActions';
import { ERP_INTEGRATION_AUDIT_ACTIONS, type ErpIntegrationAuditAction } from './erpIntegrationAuditActions';
import { ORDER_SESSION_AUDIT_ACTIONS, type OrderSessionAuditAction } from './orderSessionAuditActions';
import { USER_AUDIT_ACTIONS, type UserAuditAction } from './userAuditActions';

export { AUTHENTICATION_AUDIT_ACTIONS, CLIENT_AUDIT_ACTIONS, CLIENT_CART_AUDIT_ACTIONS, COMPANY_AUDIT_ACTIONS, ERP_INTEGRATION_AUDIT_ACTIONS, ORDER_SESSION_AUDIT_ACTIONS, USER_AUDIT_ACTIONS };

export type AuditAction = ClientAuditAction | ClientCartAuditAction | CompanyAuditAction | ErpIntegrationAuditAction | OrderSessionAuditAction | AuthenticationAuditAction | UserAuditAction;

export type AuditEntityType = 'client' | 'client_cart' | 'company' | 'erp_integration' | 'order_session' | 'user';

// Este mapa Ã© o contrato que impede, por exemplo, registrar
// `client.created` para a entidade `order_session`.
export const AUDIT_ENTITY_BY_ACTION = {
  [CLIENT_AUDIT_ACTIONS.CREATED]: 'client',
  [CLIENT_AUDIT_ACTIONS.UPDATED]: 'client',
  [CLIENT_CART_AUDIT_ACTIONS.SAVED]: 'client_cart',
  [COMPANY_AUDIT_ACTIONS.CREATED]: 'company',
  [COMPANY_AUDIT_ACTIONS.UPDATED]: 'company',
  [ERP_INTEGRATION_AUDIT_ACTIONS.CONFIGURED]: 'erp_integration',
  [ORDER_SESSION_AUDIT_ACTIONS.CREATED]: 'order_session',
  [AUTHENTICATION_AUDIT_ACTIONS.LOGGED_IN]: 'user',
  [AUTHENTICATION_AUDIT_ACTIONS.LOGGED_OUT]: 'user',
  [USER_AUDIT_ACTIONS.CREATED]: 'user',
} as const satisfies Record<AuditAction, AuditEntityType>;

export type EntityForAuditAction<A extends AuditAction> = (typeof AUDIT_ENTITY_BY_ACTION)[A];
