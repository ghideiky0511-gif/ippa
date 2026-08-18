# Eventos de auditoria

## Objetivo

Um evento de auditoria registra, de forma durável e imutável, **quem** executou uma ação, **qual** a ação, em **qual entidade**, **quando** e com quais dados contextuais.

Ele não é um evento de WebSocket. A auditoria é gravada no PostgreSQL dentro da mesma transação da alteração de negócio; WebSocket poderá depois notificar clientes sobre uma mudança já confirmada.

Cada registro em `audit_events` possui:

- `actor_id`, `actor_role` e `actor_name`: a fotografia do responsável pela ação;
- `action`: a ação permitida pelo catálogo;
- `entity_type` e `entity_id`: o alvo da ação;
- `occurred_at`: instante registrado pelo banco;
- `metadata`: contexto não sensível específico da ação.

Os registros são isolados por tenant via RLS e a conta da aplicação não tem permissão de `UPDATE` ou `DELETE`.

## Catálogo atual

| Entidade | Ações |
| --- | --- |
| Cliente | `client.created`, `client.updated` |
| Carrinho do cliente | `client_cart.saved` |
| Sessão de pedido | `order_session.created` |
| Usuário | `authentication.logged_in`, `authentication.logged_out` |

O catálogo TypeScript está em `src/services/audit/actions/`, separado por entidade. O mapa em `src/services/audit/actions/index.ts` associa cada ação ao seu tipo de entidade. Assim, `client.updated` sempre gera uma auditoria de `client`.

## Como registrar em um service

Importe a função geral e o catálogo da entidade. Registre o evento após a mutação e antes de a transação terminar.

```ts
import { recordAuditEvent } from './auditService';
import { CLIENT_AUDIT_ACTIONS } from './audit/actions';

return withTenantTransaction(tenant, user, async (client) => {
  const updated = await replaceClient(client, clientId, changes);

  await recordAuditEvent(client, {
    action: CLIENT_AUDIT_ACTIONS.UPDATED,
    entityId: updated.id,
    actor: user,
    metadata: { changedFields: ['email'] },
  });

  return updated;
});
```

`recordAuditEvent` é a única API autorizada para um service registrar auditoria. Ela recebe o `PoolClient` da transação, a ação, o ID da entidade, o ator e metadados opcionais; deriva `entity_type` automaticamente. Se a gravação falhar, `withTenantTransaction` desfaz também a alteração de negócio.

Não chame a função fora de `withTenantTransaction`, nem depois do `COMMIT`. Não crie queries, models, helpers ou caminhos alternativos que gravem em `audit_events`; todo service deve importar e usar apenas `recordAuditEvent`.

## Como adicionar uma ação

Exemplo: registrar o cancelamento de uma sessão de pedido.

1. Crie ou amplie o arquivo da entidade em `src/services/audit/actions/`:

```ts
export const ORDER_SESSION_AUDIT_ACTIONS = {
  CREATED: 'order_session.created',
  CANCELLED: 'order_session.cancelled',
} as const;
```

2. Atualize `src/services/audit/actions/index.ts`:

```ts
export type AuditAction =
  | /* tipos existentes */
  | OrderSessionAuditAction;

export const AUDIT_ENTITY_BY_ACTION = {
  // mapeamentos existentes
  [ORDER_SESSION_AUDIT_ACTIONS.CANCELLED]: 'order_session',
} as const satisfies Record<AuditAction, AuditEntityType>;
```

3. Crie uma nova migration; nunca altere uma migration já aplicada. Para o exemplo:

```sql
ALTER TYPE audit_action ADD VALUE 'order_session.cancelled';
```

4. No service responsável, registre a ação dentro da mesma `withTenantTransaction`:

```ts
await recordAuditEvent(client, {
  action: ORDER_SESSION_AUDIT_ACTIONS.CANCELLED,
  entityId: session.id,
  actor: user,
  metadata: { reason: 'client_request' },
});
```

5. Execute `npm run db:migrate` no ambiente alvo e valide com `npx tsc --noEmit` e `npm run lint`.

Se uma ação tratar uma entidade inteiramente nova, acrescente também seu valor ao tipo SQL `audit_entity_type` por migration e ao tipo `AuditEntityType` no catálogo. A entidade deve ser adicionada ao mapa de ações.

## Regras para metadados

- Registre contexto útil para investigação, como campos alterados, canal ou motivo.
- Não inclua senhas, tokens, documentos completos, endereços completos ou qualquer segredo.
- Prefira valores pequenos e estáveis; `metadata` é um objeto JSON, não um espelho da entidade.
- Uma correção é um novo evento. Eventos de auditoria não são editados nem apagados.
