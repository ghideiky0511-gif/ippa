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
- `POST /api/[tenantSlug]/admin/orders/[id]/whatsapp` -- envio manual pelo
  FAB do pedido. Aceita `{ "kind": "order" }` para o resumo do pedido ou
  `{ "kind": "payment_link" }` para gerar e enviar um novo link seguro de
  pagamento. Toda resolução de pedido, cliente, telefone e conexão ocorre no
  backend; a resposta expõe apenas o `messageId` e o telefone mascarado.

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
     `onboarding.state`, etc.) ainda são melhores palpites para os dois
     primeiros, não confirmados.
   - **`GET /v1/admin/whatsapp-connections` -- CONFIRMADO em 2026-09-08**
     contra o código-fonte do bippa-messaging (`messaging_repository.js`,
     função `publicPhone`, usada por `listConnectionsForOrganization`): cada
     item devolvido é `{ id, phone_number_id, display_phone_number,
     verified_name, quality_rating, active }`. O palpite anterior
     (`phone_id`, `display_phone_masked`, `status`, `sender_profile_key`)
     estava incorreto -- `entry.phone_id` vinha `undefined`, e esse valor
     percorria intacto até `PATCH /v1/admin/phones/undefined/sender-profile`
     (rejeitado pelo bippa-messaging com `400 onboarding_rejected`; a
     verificação `if (!normalizedPhoneId)` não pega isso porque
     `encodeURIComponent(undefined)` produz a string não-vazia
     `"undefined"`). Corrigido em `bippaMessagingClient.ts` para usar `id`;
     `sender_profile_key` não existe nesta resposta (sempre `null` aqui --
     o vínculo por vendedora é só o espelho local em `whatsapp_connections`).
   - **`PATCH /v1/admin/phones/:id/sender-profile` -- CONFIRMADO em
     2026-09-08** contra `messaging_repository.js` (`assignPhoneToSender`,
     `INSERT ... RETURNING *` em `bippa_messaging.sender_profiles`) e
     `db/schema.sql` (tabela `sender_profiles`: `id, organization_id,
     phone_id, key, external_reference, capability_payments`, mais
     `connection_id` do JOIN) e `server.js`, que embrulha o retorno em
     `{ sender_profile: {...} }`. Diferente do `GET /whatsapp-connections`,
     aqui `phone_id` É um nome de coluna real (FK para `phone_numbers.id`),
     não um apelido -- então o parâmetro da URL (`:id`) e o campo do corpo
     (`sender_profile.phone_id`) são coisas diferentes, ambas corretas com
     esses nomes. Mas o código antigo lia `response.phone_id` direto (sem
     desembrulhar `sender_profile`) e esperava `sender_profile_key`/
     `display_phone_masked`/`verified_name`/`quality_rating`/`status`, que
     nunca existiram nessa resposta (as três primeiras são colunas de
     `phone_numbers`, a chave real é `key`, e não há coluna de status em
     `sender_profiles`). Corrigido em `bippaMessagingClient.ts`
     (`associateSenderProfile`) para ler `response.sender_profile.*`; os
     metadados do telefone (display/verified/quality) são buscados de novo
     via `listWhatsAppConnections` em
     `whatsappIntegrationService.associateWhatsAppSenderProfile`, já que este
     PATCH não os devolve.

     **Segunda rodada, confirmado em produção pelo próprio bippa-messaging
     (2026-09-08):** depois do fix acima, o PATCH passou a chegar com
     `phone_id` correto mas foi rejeitado com `400 "source_reference e
     obrigatorio"`. Corrigido no código-fonte do bippa-messaging
     (`onboarding.js` `assignPhone` + `messaging_service.js`
     `organizationForRequest`): `source_reference` e `external_reference` são
     DOIS campos distintos no corpo do PATCH, ambos obrigatórios --
     `source_reference` resolve a organização (o installation desta
     vendedora), `external_reference` vira `sender_profiles.external_reference`
     (usado depois por `resolveSender()` pra achar o perfil de envio de um
     pedido). Não é um caso de um nome errado pelo outro -- o fix anterior
     trocou um pelo outro e teria gerado um novo 400 para
     `external_reference`. Corrigido para mandar os dois, com o mesmo valor
     (`externalReferenceForSeller(tenant.id, sellerId)`, já usado como
     `sourceReference` em `ensureApplicationInstallation`/
     `listWhatsAppConnections`/`getOnboardingAttempt`). `sender_profile_key`
     tem fallback no bippa-messaging (`sender:${externalReference}` se
     ausente) -- não obrigatório, não precisa mexer.

     **Terceira rodada, confirmado em produção (2026-09-08):** o fix acima
     mandava `source_reference` E `external_reference` com o MESMO valor
     (a referência composta `tenant:seller`), o que gerou `phone_not_found`.
     Confirmado que os dois campos são semanticamente distintos e não
     intercambiáveis: `source_reference` = só o tenant (o mesmo valor de
     `tenant.id`), `external_reference` = só a vendedora (`sellerId`) --
     nunca a referência composta em nenhum dos dois. Corrigido em
     `AssociateSenderProfileInput`/`associateSenderProfile`
     (`bippaMessagingClient.ts`) e no chamador
     (`whatsappIntegrationService.associateWhatsAppSenderProfile`), que agora
     passa `sourceReference: tenant.id` e `externalReference: sellerId`
     separadamente só nesta chamada -- o espelho local
     (`whatsapp_connections.external_reference`, via
     `externalReferenceForSeller`) e as outras chamadas
     (`ensureApplicationInstallation`, `listWhatsAppConnections`,
     `getOnboardingAttempt`, `sendMessage`) continuam usando a referência
     composta como já usavam, sem alteração -- não confirmado se também
     precisam desse mesmo split (essas chamadas retornam 200 mesmo com a
     referência composta, então não há evidência de bug ali ainda; mexer
     nelas sem confirmação arrisca regressão num fluxo que hoje funciona).

     **Quarta rodada, confirmado em produção (2026-09-08):** o fix acima
     (`sourceReference: tenant.id`) gerou um erro novo: `400 "Instalacao da
     aplicacao nao autorizada"`. Causa: `organizationForRequest`
     (bippa-messaging) resolve a instalação por
     `(application_code, source_reference)` contra `application_installations`
     -- e essa linha foi criada por `ensureWhatsAppInstallation`
     (`whatsappInstallationService.ts`), que **sempre** provisionou com a
     referência composta `externalReferenceForSeller(tenant.id, sellerId)`
     (`tenant:seller`), nunca com `tenant.id` sozinho. Ou seja: no nosso
     desenho, cada vendedora tem sua própria "organização"/instalação no
     bippa-messaging -- a composta É o "tenant" do ponto de vista do
     bippa-messaging para este app. `source_reference` no PATCH precisa
     bater com o valor usado na instalação, senão `resolveInstallation` não
     acha a linha. Corrigido revertendo `sourceReference` para a referência
     composta (mesmo valor de `ensureWhatsAppInstallation`,
     `listWhatsAppConnections`, `startOnboardingAttempt`) -- só
     `external_reference` continua distinto (`sellerId` puro). Ou seja: a
     "regra de ouro" (source_reference=tenant, external_reference=vendedora)
     está correta em espírito, mas "tenant" aqui É a composta, não
     `tenant.id` isolado -- resolve também a pergunta em aberto da rodada
     anterior: as outras chamadas (`ensureApplicationInstallation`,
     `listWhatsAppConnections`, `getOnboardingAttempt`, `sendMessage`) já
     usavam o valor certo e não precisam de nenhum split; só
     `associateSenderProfile` tinha um segundo campo (`external_reference`)
     que exige um valor diferente (a vendedora) do `source_reference`
     (a instalação/composta).

     **Quinta rodada, confirmado por leitura direta do código-fonte do
     bippa-messaging (2026-09-08), fechando as dúvidas em aberto da rodada
     anterior:**
     - **Troca de telefone (reassociação):** `assignPhoneToSender` faz
       `INSERT ... ON CONFLICT(organization_id, external_reference) DO UPDATE
       SET phone_id=EXCLUDED.phone_id, key=EXCLUDED.key,
       capability_payments=EXCLUDED.capability_payments`
       (`messaging_repository.js:247-259`; índice único
       `(organization_id, external_reference)` em `schema.sql:50-52`). Upsert
       por vendedora, não por telefone -- chamar o PATCH de novo com um
       `:id` de telefone diferente para a mesma vendedora move a mesma linha
       para o novo `phone_id`, sem erro de conflito e sem precisar
       "desconectar" o telefone antigo antes.
     - **`capability_payments` é full-replace, não merge** (mesma linha do
       upsert acima: `capability_payments=EXCLUDED.capability_payments`).
       **Gap real para o futuro:** hoje sempre mandamos
       `capabilityPayments: false` neste PATCH
       (`whatsappIntegrationService.ts`, `associateWhatsAppSenderProfile`) e
       não há problema porque nada mais escreve `true`. No dia em que um
       fluxo de aprovação Meta Payments passar a setar
       `capability_payments: true`, uma troca de telefone que chame este
       mesmo PATCH com `capabilityPayments: false` hardcoded vai resetar essa
       aprovação silenciosamente -- nesse dia, essa chamada precisa ler o
       valor atual (via `listWhatsAppConnections` ou equivalente) antes de
       decidir o que enviar, em vez de hardcodar `false`. Comentário de aviso
       já deixado no código no ponto exato.
     - **Múltiplos `sender_profiles` para a mesma vendedora:** estruturalmente
       impossível -- o mesmo índice único `(organization_id,
       external_reference)`, mais `UNIQUE(organization_id, key)`
       (`schema.sql:47`), garante no máximo uma linha ativa por vendedora
       antes mesmo de `resolveSender` rodar (`messaging_repository.js:274-277`).
     - **Isolamento do `GET /v1/admin/whatsapp-connections`:** confirmado em
       dois níveis independentes -- `listConnectionsForOrganization` filtra
       estritamente pelo `organization_id` resolvido via
       `resolveInstallation(application_code, source_reference)`
       (`messaging_repository.js:221-228`, `messaging_service.js:10-23`,
       ambos com `UNIQUE(application_code, external_reference)` em
       `application_installations`); e mesmo que duas vendedoras tentassem
       conectar a mesma conta Meta Business, `connections.waba_id` e
       `phone_numbers.phone_number_id` são `UNIQUE` globalmente
       (`schema.sql:186-189,208`) -- a segunda organização a tentar recebe
       erro explícito ("Esta WABA ja esta conectada a outra organizacao."),
       nunca um vazamento silencioso de dado entre vendedoras.

     **Sexta rodada, bug real confirmado em produção (2026-09-09), NO NOSSO
     LADO desta vez:** o "phone_not_found" desta rodada não era mais
     divergência de `source_reference` (o log provou os dois lados idênticos
     -- GET e PATCH usando o mesmo valor, segundos de diferença, GET achando
     o telefone e PATCH não). Causa raiz: `GET /v1/admin/whatsapp-connections`
     devolve uma lista de CONEXÕES (`publicConnection`: `id` = id da
     conexão/WABA), cada uma com `phones: []` aninhado (`publicPhone`: `id` =
     `phone_numbers.id`) -- `messaging_repository.js:227`. Os dois níveis têm
     um campo `id` com o MESMO NOME e significados diferentes.
     `listWhatsAppConnections` (`bippaMessagingClient.ts`) estava lendo
     `entry.id` (id da conexão) como se fosse o `phoneId`, tratando a
     resposta como uma lista flat de telefones -- nunca era. Confirmado via
     log de auditoria do bippa-messaging: o UUID usado nos testes anteriores
     (`d75c4c2e-...`) reapareceu idêntico em 6 eventos
     `meta_onboarding_completed` distintos ao longo de várias horas -- exatamente
     o comportamento de um `connection_id` (estável entre reconexões da mesma
     WABA), nunca de um `phone_numbers.id`. Corrigido: `WhatsAppConnectionEntryResponse`
     virou `WhatsAppConnectionResponse` (nível da conexão, com `phones:
     WhatsAppConnectionPhoneResponse[]`), e o mapeamento em
     `listWhatsAppConnections` agora faz `flatMap` sobre `connection.phones`,
     lendo `phone.id` (não `connection.id`) como `phoneId`. Isso também
     resolve, sem precisar de mudança adicional, o caso de uma conexão/WABA
     com mais de um número -- antes essa listagem so retornaria 1 "telefone"
     por conexão (o id errado dela), agora retorna todos os telefones reais
     de todas as conexões da organização.
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
6. **Cadastro de templates padronizados** -- a tela de Integrações permite
   que somente o admin envie os modelos `bippa_order_confirmed_v1` e
   `bippa_payment_link_v1` para o WABA de uma conexão ativa. O browser envia
   apenas `sellerId` + chave lógica; texto, nome, idioma `pt_BR`, categoria
   `UTILITY` e exemplos são definidos no backend em
   `whatsappTemplates.ts`. O Catálogo chama
   `POST /v1/admin/phones/:phoneId/message-templates` no bippa-messaging,
   que deve resolver o WABA e encaminhar o componente à Graph API sem expor
   WABA ID ou token Meta ao Catálogo. Esse novo contrato interno precisa
   existir no deploy do bippa-messaging antes do teste integrado.

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
6. Na seção "Templates de pedidos", selecionar a conexão, revisar os dois
   modelos e clicar em "Enviar para a Meta". Confirmar que o retorno mostra
   `PENDING` (ou `APPROVED`, se o modelo já existir/aprovar imediatamente) e
   que nenhum texto livre pode ser enviado pelo browser.
7. Testar mensagem livre: mandar uma mensagem do celular de teste para o
   número conectado, responder pelo Catálogo (via um pedido de teste que
   dispare `sendOrderConfirmedWhatsApp`) dentro da janela de 24h.
8. Confirmar que `capability_payments` permanece `false` na tela (sem
   toggle disponível) -- só liberado após aprovação Meta Payments, fora de
   escopo aqui.
9. Abrir um pedido no workspace e usar "Enviar pedido pelo WhatsApp" no FAB.
   A ação deve retornar sucesso somente depois que o bippa-messaging aceitar
   o envio. Em um pedido `separado` e ainda não pago, repetir com "Enviar link
   de pagamento pelo WhatsApp" e validar a abertura de `/pagar/[token]` no
   aparelho destinatário.
