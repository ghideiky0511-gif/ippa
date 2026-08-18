import { AUTHENTICATION_AUDIT_ACTIONS, type AuthenticationAuditAction } from './authenticationAuditActions';
import { CLIENT_AUDIT_ACTIONS, type ClientAuditAction } from './clientAuditActions';
import { CLIENT_CART_AUDIT_ACTIONS, type ClientCartAuditAction } from './clientCartAuditActions';
import { ORDER_SESSION_AUDIT_ACTIONS, type OrderSessionAuditAction } from './orderSessionAuditActions';

export { AUTHENTICATION_AUDIT_ACTIONS, CLIENT_AUDIT_ACTIONS, CLIENT_CART_AUDIT_ACTIONS, ORDER_SESSION_AUDIT_ACTIONS };

export type AuditAction = ClientAuditAction | ClientCartAuditAction | OrderSessionAuditAction | AuthenticationAuditAction;

export type AuditEntityType = 'client' | 'client_cart' | 'order_session' | 'user';

// Este mapa Ã© o contrato que impede, por exemplo, registrar
// `client.created` para a entidade `order_session`.
export const AUDIT_ENTITY_BY_ACTION = {
  [CLIENT_AUDIT_ACTIONS.CREATED]: 'client',
  [CLIENT_AUDIT_ACTIONS.UPDATED]: 'client',
  [CLIENT_CART_AUDIT_ACTIONS.SAVED]: 'client_cart',
  [ORDER_SESSION_AUDIT_ACTIONS.CREATED]: 'order_session',
  [AUTHENTICATION_AUDIT_ACTIONS.LOGGED_IN]: 'user',
  [AUTHENTICATION_AUDIT_ACTIONS.LOGGED_OUT]: 'user',
} as const satisfies Record<AuditAction, AuditEntityType>;

export type EntityForAuditAction<A extends AuditAction> = (typeof AUDIT_ENTITY_BY_ACTION)[A];
