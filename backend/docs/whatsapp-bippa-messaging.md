# WhatsApp via bippa-messaging

Revisão do WhatsApp Business no catálogo: o backend deixou de falar direto
com a Graph API da Meta (modelo antigo, por vendedora, token Meta cifrado em
`seller_whatsapp_integrations`) e passou a delegar tudo -- Embedded Signup,
token da Meta, envio de mensagem -- ao serviço central bippa-messaging
(`https://bippa-messaging.onrender.com`). O vínculo continua por
**vendedora** (não por tenant): cada tenant pode ter N vendedoras, cada uma
com seu próprio número WhatsApp Business, e é a administradora quem conecta
em nome de cada uma. A diferença para o modelo antigo é só onde a
credencial da Meta mora -- agora fica inteiramente no bippa-messaging, nunca
no banco do Catálogo.

Cada vendedora "conversa" com a integração (recebe notificação de
pedido/link de pagamento pelo WhatsApp) só se a conexão DELA estiver
`status = 'connected'` -- ver `whatsappNotificationService.resolveActiveIntegration`,
que resolve por `sellerId`, não mais por tenant.

## Env vars

```env
BIPPA_MESSAGING_BASE_URL=https://bippa-messaging.onrender.com
BIPPA_CATALOGO_API_KEY=<api key gerada pelo bippa-auth>
```

**Atualizado em 2026-09-03: o esquema de credencial de serviço mudou.**
`BIPPA_AUTH_URL`/`BIPPA_CATALOGO_MESSAGING_CLIENT_ID`/
`BIPPA_CATALOGO_MESSAGING_CLIENT_SECRET` (troca `client_credentials` contra
`{BIPPA_AUTH_URL}/oauth/token`) foram REMOVIDAS -- o bippa-auth passou a
emitir uma API key estática (`bippa_<key_id>_<segredo>`, escopos
`messaging:write` + `messaging:control`) via `POST /admin/api-keys`
(autenticado com o bootstrap token do bippa-auth), sem exchange nenhum em
tempo de execução. O Catálogo manda essa key como header
`X-Bippa-Api-Key` em toda chamada ao bippa-messaging (ver
`backend/src/messaging/bippaAuthClient.ts`/`http.ts`) -- não há mais bearer
humano nem token de serviço buscado por OAuth. Rotação: `POST
/admin/api-keys/:id/rotate` no bippa-auth gera uma key nova sem derrubar a
antiga; atualizar `BIPPA_CATALOGO_API_KEY` e só depois revogar a antiga.

**RESOLVIDO em 2026-09-03**: o bippa-messaging agora valida
`X-Bippa-Api-Key` (`requireApiKey`) contra
`POST {BIPPA_AUTH_BASE_URL}/internal/api-keys/validate` no bippa-auth (cache
curto, fail-closed em erro de rede) -- rotas `/v1` exigem `messaging:write`,
rotas `/v1/admin` exigem `messaging:control`. O JWT antigo
(`BIPPA_AUTH_JWT_SIGNING_KEY`) foi removido do bippa-messaging inteiro. Para
o 401 sumir de vez, confirmar dos dois lados: `BIPPA_CATALOGO_API_KEY`
configurada aqui (Catálogo) e `BIPPA_AUTH_BASE_URL` apontando pro bippa-auth
real (não localhost) no ambiente do bippa-messaging.

`WHATSAPP_APP_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_GRAPH_API_VERSION`,
`WHATSAPP_WEBHOOK_VERIFY_TOKEN` e `WHATSAPP_CREDENTIALS_ENCRYPTION_KEY` não
são mais usadas -- podem ser removidas do painel do Render quando for
conveniente (não quebram nada se ficarem, só ficam órfãs).

## Rotas criadas (backend, tenant-scoped, admin-only via requireSettingsAdministrator)

- `POST /api/[tenantSlug]/admin/whatsapp/installations` -- garante a
  instalação do app "bippa-catalogo" no bippa-messaging para este tenant
  (nível tenant, não por vendedora -- é a instalação do app na organização).
- `POST /api/[tenantSlug]/admin/whatsapp/onboarding-attempts` -- abre uma
  tentativa de Embedded Signup em nome da vendedora `sellerId` (no corpo),
  devolve `{ connectUrl, state }`.
- `GET /api/[tenantSlug]/admin/whatsapp/connections` -- lista telefones já
  conectados à organização no bippa-messaging (proxy remoto, não filtrado
  por vendedora -- é a lista bruta que a administradora escolhe ao
  associar).
- `GET /api/[tenantSlug]/admin/whatsapp/status` -- estado LOCAL de
  referência (tabela `whatsapp_connections`) de TODAS as vendedoras deste
  tenant, como lista. **Adicionado além dos 4 endpoints A-D do plano
  original** -- necessário para a tela mostrar "conectado"/"não conectado"
  por vendedora no carregamento sem uma chamada remota a cada acesso.
- `PATCH /api/[tenantSlug]/admin/whatsapp/phones/[phoneId]/sender-profile`
  -- associa um telefone ao sender profile da vendedora `sellerId` (no
  corpo).

Rotas antigas removidas (grupo inteiro):
`api/[tenantSlug]/whatsapp-integration/{route,connect,activate,deactivate,sellers,test}.ts`,
e `api/internal/whatsapp/webhook/route.ts` (webhook da Meta -- agora é o
bippa-messaging quem recebe).

## Tabela nova

`whatsapp_connections` (migration `063_bippa_messaging_whatsapp.sql`) -- uma
linha por VENDEDORA (`seller_id`, `UNIQUE`, FK `users(id)`), com `tenant_id`
só para RLS/isolamento e para listar todas as conexões de um tenant. Resto é
estado local de referência (`phone_id`, `external_reference`,
`sender_profile_key`, `capability_payments`, `display_phone_masked`,
`verified_name`, `quality_rating`, `status`, `last_synced_at`). **Nenhuma
credencial da Meta** -- token, WABA ID e App Secret ficam só no
bippa-messaging. RLS com a mesma policy `tenant_isolation` das demais
tabelas de tenant.

`external_reference` = `"<tenant_id>:<seller_id>"` e `sender_profile_key` =
`"catalogo:<tenant_id>:<seller_id>"` -- ambos incluem `seller_id` porque um
tenant agora pode ter várias conexões (uma por vendedora), diferente do
desenho anterior (só `tenant_id`, quando cada tenant só podia ter uma
conexão). Ver `senderProfileKeyForSeller`/`externalReferenceForSeller` em
`backend/src/services/whatsapp/whatsappServiceErrors.ts`.

Tabelas removidas: `seller_whatsapp_integrations` (migration 056),
`whatsapp_webhook_events` (migration 057). Os valores de enum
`audit_action.whatsapp_integration.*` e `audit_entity_type.whatsapp_integration`
(migration 056) foram MANTIDOS -- Postgres não suporta `ALTER TYPE ... DROP
VALUE`, e continuam semanticamente válidos no novo modelo.

## Alteração manual necessária em `backend/db/stage/stage.sql`

Este arquivo não foi editado (instrução explícita). **Verificado byte a
byte antes de escrever isto:** `backend/db/stage/stage.sql` já está
significativamente desatualizado em relação às migrations aplicadas -- ele
não contém `seller_whatsapp_integrations`, `whatsapp_webhook_events`, o tipo
`whatsapp_integration_status`, nem qualquer valor de enum
`whatsapp_integration.*`/`payment_integration.mercadopago` etc. Ou seja,
**não há nada para remover** relativo às tabelas antigas -- elas nunca
chegaram a entrar nesse arquivo. Só falta ADICIONAR a tabela nova, caso
quem mantém `stage.sql` quiser esta migration especificamente refletida
nele (independente de sincronizar o resto do atraso).

Cole o bloco abaixo em `backend/db/stage/stage.sql` (mesmo texto de
`backend/db/migrations/063_bippa_messaging_whatsapp.sql`, sem os
comentários) em algum lugar depois da criação da tabela `tenants` e antes
dos `GRANT`s finais do arquivo, seguindo a posição das outras tabelas de
tenant já presentes:

```sql
CREATE TABLE public.whatsapp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone_id text,
  external_reference text NOT NULL,
  sender_profile_key text NOT NULL,
  capability_payments boolean NOT NULL DEFAULT false,
  display_phone_masked text,
  verified_name text,
  quality_rating text,
  status text NOT NULL DEFAULT 'not_connected',
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (seller_id)
);

CREATE INDEX whatsapp_connections_tenant_id_idx ON public.whatsapp_connections (tenant_id);

ALTER TABLE public.whatsapp_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_connections FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.whatsapp_connections FOR ALL TO PUBLIC
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_connections TO ippa_app;
```

Também precisa da migration `064_seller_whatsapp_phone.sql` (coluna
`users.whatsapp_phone`, ver seção "Telefone da vendedora" abaixo) se
`stage.sql` for sincronizado.

## Telefone da vendedora e carteira de clientes

Duas peças adicionadas na mesma leva de trabalho, fora do escopo original
de "migrar para bippa-messaging" mas dependentes do mesmo `seller_id`:

- **Telefone da vendedora**: `users.whatsapp_phone` (migration
  `064_seller_whatsapp_phone.sql`), mesmo padrão de `clients.whatsapp_phone`
  (E.164, CHECK). Cadastrado em Usuários → Vendedora, é só um dado de
  contato -- quem efetivamente conecta o WhatsApp Business é o fluxo de
  Embedded Signup acima, não este campo.
- **Carteira** (`clients.last_seller_id`, já existente desde
  `002_core_schema.sql`, setada automaticamente pelo fluxo de atendimento em
  `orderSessionService.ts`): agora tem um endpoint estreito para reatribuição
  manual pelo admin -- `PATCH /api/[tenantSlug]/admin/clients/[id]/seller`
  (`clientService.reassignClientSeller`) e um filtro `sellerId` em
  `GET /api/[tenantSlug]/admin/clients`. Endpoint deliberadamente estreito
  (só troca `last_seller_id`) para não reabrir a edição geral de cliente
  removida no commit `360f78d`.

If (separately from this task) `stage.sql` is ever brought fully up to
date with all pending migrations, that pass should also drop
`seller_whatsapp_integrations`, `whatsapp_webhook_events` and the type
`whatsapp_integration_status` if a prior manual sync had added them --
but as verified above, none of that exists in the file today, so this
migration's own diff against current `stage.sql` is purely additive.

## Gaps assumidos

1. ~~Token humano reaproveitado no popup do Embedded Signup, sem endpoint de
   short-lived token dedicado.~~ **RESOLVIDO em 2026-09-03.** Confirmado com
   quem administra bippa-auth/bippa-messaging que não existe (nem nunca
   existiu) uma credencial separada para o popup: o único dado que
   `bippa.meta.onboarding.start` leva é a própria `state` que
   `POST /v1/admin/onboarding/attempts` já devolve (uso único, hash no
   banco, expira em 10min). O popup resolve o login com a Meta sozinho
   (FB.login via SDK da Meta) e conclui chamando
   `POST /v1/admin/onboarding/complete` autenticado só por essa `state` --
   rota deliberadamente fora do middleware de API key, porque roda no
   navegador e nunca pode ver `BIPPA_CATALOGO_API_KEY`. Não há `access_token`
   nem token de sessão do admin envolvido em nenhum momento.

   `WhatsAppIntegrationApp.tsx` foi corrigido para mandar só `{ type:
   "bippa.meta.onboarding.start", state }` via `postMessage`. O endpoint
   `frontend/src/app/api/workspace-session/onboarding-token/route.ts`, que
   vazava o cookie HttpOnly de sessão pro JS do navegador só para esse
   propósito, foi removido -- o retrocesso de segurança que ele representava
   não existe mais.
2. **Contratos de API assumidos, não confirmados contra documentação real:**
   - `POST {BIPPA_MESSAGING_BASE_URL}/v1/messages` em
     `backend/src/messaging/bippaMessagingClient.ts` (`sendMessage`) -- o
     contrato deste endpoint NÃO estava especificado na tarefa original;
     o body implementado (`source_reference`, `sender_profile`, `to`,
     `template: { name, languageCode, bodyParameters }`) é plausível, mas
     precisa validação antes do primeiro envio real.
   - Os demais 4 endpoints (`application-installations`,
     `onboarding/attempts`, `whatsapp-connections`,
     `phones/:phoneId/sender-profile`) seguem a convenção REST descrita na
     tarefa; os nomes de campo da resposta (`onboarding.connect_url`,
     `onboarding.state`, `phone_id`, etc.) também são melhores palpites, não
     confirmados.
3. **Stage.sql** -- ver seção acima, alteração manual necessária.
4. **Sinal `bippa.meta.onboarding.ready` não confirmado.** O plano previa
   mandar `onboarding.start` "quando o popup sinalizar pronto -- ou, se não
   houver esse sinal confiável, após o popup carregar". Implementado com os
   dois caminhos: `WhatsAppIntegrationApp.tsx` manda o início assim que
   recebe `ready`, OU depois de `READY_FALLBACK_MS` (4s) se `ready` nunca
   chegar -- e um timeout geral (`ONBOARDING_TIMEOUT_MS`, 90s) evita que a
   tela fique presa em "Conectando…" para sempre se nada
   (completed/failed) responder depois disso. Os dois valores de timeout
   são palpites razoáveis, não confirmados contra o comportamento real do
   bippa-messaging -- ajustar se a Embedded Signup real demorar mais que
   isso para carregar.
5. **Sem teste de frontend automatizado** -- este repositório não tem
   runner de teste configurado no frontend (`frontend/package.json` não tem
   script `test`). `isTrustedBippaMessagingOrigin` foi implementada como
   função pura exportada (`frontend/src/workspace/lib/whatsappIntegrationClient.ts`)
   para ficar testável assim que houver infraestrutura de teste no
   frontend; por ora só foi exercitada manualmente.
6. **Templates order_confirmed/payment_link** -- o Catálogo não registra
   mais templates (essa lógica era Graph-API-specific); assume-se que o
   bippa-messaging/Meta já tem os templates aprovados centralmente, fora do
   escopo do Catálogo.

## Roteiro manual de smoke test

1. Acessar Integrações → WhatsApp (lista as vendedoras da loja) -- uma
   vendedora sem conexão deve mostrar "Conectar WhatsApp".
2. Clicar em "Conectar WhatsApp" na linha de uma vendedora: deve chamar
   `ensureWhatsAppInstallation` → `startWhatsAppOnboardingAttempt(sellerId)`
   → abrir popup com `connectUrl`. Concluir o Embedded Signup com uma conta
   Meta de teste e um número de teste.
3. Ao concluir (`bippa.meta.onboarding.completed`), o popup fecha e a lista
   de telefones aparece. Selecionar o telefone retornado -- deve chamar
   `associateWhatsAppSenderProfile(sellerId, phoneId)`.
4. A tela só deve mostrar "Conectado" depois da resposta confirmada da
   associação (nunca antes, mesmo que o popup já tenha fechado).
5. Clicar em "Verificar conexão" (ação restrita) -- deve confirmar telefone +
   sender profile associado via nova chamada a `fetchWhatsAppConnections`.
6. Testar mensagem livre: mandar uma mensagem do celular de teste para o
   número conectado, responder pelo Catálogo (via um pedido de teste que
   dispare `sendOrderConfirmedWhatsApp`) dentro da janela de 24h.
7. Confirmar que `capability_payments` permanece `false` na tela (sem
   toggle disponível) -- só liberado após aprovação Meta Payments, fora de
   escopo aqui.
