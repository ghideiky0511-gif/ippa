# Referência da API do bippa-messaging

`bippa-messaging` é a plataforma independente de WhatsApp da Bippa: guarda
credenciais Meta cifradas, WABAs, números, templates, conversas e fila de
envio, e atende **qualquer produto autorizado** (Count, Catálogo, futuros
produtos) sem que esse produto escolha ou conheça WABA, número de telefone ou
token da Meta. Este documento é a referência completa de consumo: toda rota
exposta, autenticação exigida, corpo de requisição e formato de resposta.

Para o fluxo de negócio (organização, WABA, número, perfil de envio) e o
roteiro de onboarding do Embedded Signup passo a passo, ver
[architecture.md](architecture.md). Aqui o foco é o contrato request/response
de cada rota.

## Autenticação

Toda chamada carrega o header `X-Bippa-Api-Key: bippa_<key_id>_<segredo>`, uma
API key de serviço emitida pelo `bippa-auth` (ver
`bippa-auth/docs/api-keys.md`). Ela é validada a cada requisição via
`POST {BIPPA_AUTH_BASE_URL}/internal/api-keys/validate` (resultado positivo
fica em cache por `BIPPA_AUTH_VALIDATE_CACHE_MS`; um resultado negativo nunca
é cacheado). Não há login humano, sessão ou OAuth nesse fluxo.

Os middlewares de escopo são cumulativos por prefixo de rota:

- toda rota `/v1/*` exige o escopo `messaging:write`;
- toda rota `/v1/admin/*` cai sob os dois `app.use`, então exige
  **`messaging:write` e `messaging:control`** na mesma key.

Duas rotas são a única exceção e nunca recebem a API key (ela não pode chegar
ao navegador): `POST /v1/admin/onboarding/complete` e
`POST /v1/admin/onboarding/browser-events`. Ambas são autenticadas pelo
`state` de uso único emitido por `POST /v1/admin/onboarding/attempts` — ver
seção de Onboarding.

Toda rota autenticada por API key também exige `source_reference` (no corpo
para `POST`/`PATCH`, na query para `GET`): é o identificador do tenant do
produto chamador dentro da própria aplicação. O Messaging resolve a
organização por `(application_code da key, source_reference)` em
`application_installations` — `application_code` nunca é lido do corpo da
requisição, somente do claim que o `bippa-auth` devolve para a key
(`req.auth.application_code`), então uma aplicação nunca consegue ler ou
escrever dados de outra.

Erros seguem o formato `{"error": "<código>", "message": "<mensagem>"}`.
Sem key ou key inválida/sem escopo → `401 {"error":"unauthorized"}`. Cada
rota abaixo lista o código de erro típico quando relevante; o `statusCode`
segue o valor definido no serviço (400 é o padrão quando não especificado).

## Modelo de dados

| Conceito                  | Onde vive                          | Campo de referência externa                                    | Regra                                                                                                                                                                                                                                                                 |
| ------------------------- | ---------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant do produto cliente | Aplicação chamadora                | `source_reference`                                             | Só existe dentro da própria aplicação; o Messaging nunca o expõe a outra aplicação.                                                                                                                                                                                   |
| Organização               | Messaging (`organizations`)        | `organization_id` (interno, nunca enviado pelo chamador)       | Resolvida via `application_installations(application_code, source_reference)`.                                                                                                                                                                                        |
| WABA                      | Meta / Messaging (`connections`)   | `waba_id`                                                      | Conectada e cifrada somente pelo Messaging; uma organização pode ter várias.                                                                                                                                                                                          |
| Número WhatsApp           | Meta / Messaging (`phone_numbers`) | `phone_number_id`                                              | Pertence a exatamente uma WABA; pode ter no máximo um perfil de envio.                                                                                                                                                                                                |
| Perfil de envio           | Messaging (`sender_profiles`)      | `external_reference` (= `seller_reference` nas rotas de envio) | É a única referência que o chamador usa para rotear uma mensagem; o Messaging resolve o número e a WABA no servidor. A chave interna `sender_profiles.key` (`seller:<id>` por convenção) nunca é aceita nem devolvida como identificador de roteamento pelo chamador. |

```text
Aplicação cliente (Count, Catálogo, ...)
  tenant "T-42" ── application_installation ── organization O-42
    perfil "17" ── sender profile external_reference=17 ── phone P-17 ── WABA A
    perfil "28" ── sender profile external_reference=28 ── phone P-28 ── WABA A ou B
```

## Autenticação da aplicação cliente

Crie no `bippa-auth` uma API key de serviço (ver
`bippa-auth/docs/api-keys.md`) com os escopos necessários:

```text
client_id: <nome-da-aplicacao>
application_code: <nome-da-aplicacao>
scopes: [messaging:write, messaging:control]
```

Um mesmo `application_code` pode ter várias API keys (uma por
`client_id`/ambiente); todas resolvem para as mesmas instalações. Não há
token para renovar: a API key é a própria credencial, guardada só no backend
do produto e enviada em todo request via `X-Bippa-Api-Key`. Rotacione-a com
`POST /admin/api-keys/:id/rotate` (no `bippa-auth`) sem downtime — a key
antiga continua válida até ser revogada.

---

## Provisionamento de instalação (tenant → organização)

### `POST /v1/admin/application-installations/provision`

Provisiona (ou recupera, se já existir) a organização e a instalação a partir
apenas de `application_code` (da própria key) + `source_reference` — o
chamador nunca escolhe nem conhece um `organization_id` previamente.
Idempotente: a primeira chamada cria e responde `201`; repetições com o mesmo
`source_reference` respondem `200` e nunca duplicam organização ou instalação.
Corridas concorrentes são resolvidas no banco (transação + constraint única),
nunca em memória.

```http
POST /v1/admin/application-installations/provision
X-Bippa-Api-Key: bippa_<key_id>_<segredo>
Content-Type: application/json

{
  "source_reference": "tenant-123",
  "organization_name": "Empresa Exemplo"
}
```

Resposta (`201` na primeira chamada, `200` nas repetições):

```json
{
    "organization": { "id": "uuid-gerado", "name": "Empresa Exemplo" },
    "installation": {
        "id": "uuid-da-installation",
        "application_code": "minha-aplicacao",
        "external_reference": "tenant-123",
        "created": true
    }
}
```

A mesma `source_reference` pode existir para `application_code` diferentes
sem colisão (a unicidade é sobre o par `(application_code, external_reference)`),
então duas aplicações podem usar o mesmo id de tenant sem conflito.

### `POST /v1/admin/application-installations`

Provisionamento explícito, quando o `organization_id` já é conhecido (por
exemplo, uma organização criada manualmente no Console do Messaging).

```http
POST /v1/admin/application-installations
X-Bippa-Api-Key: bippa_<key_id>_<segredo>
Content-Type: application/json

{
  "organization_id": "uuid-existente",
  "application_code": "minha-aplicacao",
  "source_reference": "tenant-123"
}
```

Resposta `201`:

```json
{
    "installation": {
        "id": "...",
        "organization_id": "...",
        "application_code": "...",
        "external_reference": "...",
        "created": true
    }
}
```

Erro `409 installation_owned_by_another_organization` se a instalação já
pertencer a outra organização.

---

## Onboarding Meta (Embedded Signup)

Fluxo completo de conexão de uma WABA/número novo. Passo a passo detalhado e
o snippet de `postMessage` do popup estão em
[architecture.md](architecture.md#onboarding-centralizado-da-meta); aqui vai
só o contrato de cada chamada.

### `POST /v1/admin/onboarding/attempts`

Inicia uma tentativa de onboarding (exige `messaging:control` +
`messaging:write`).

```http
POST /v1/admin/onboarding/attempts
X-Bippa-Api-Key: bippa_<key_id>_<segredo>
Content-Type: application/json

{
  "source_reference": "tenant-123",
  "application_code": "minha-aplicacao",
  "destination_key": "whatsapp-settings",
  "actor_reference": "user-42"
}
```

`destination_key` é um rótulo interno de rota do produto (nunca uma URL do
navegador) — default `"whatsapp-settings"`. `actor_reference` é opcional; se
omitido, o autor registrado é `service:<client_id da key>`.

Resposta `201`:

```json
{
    "onboarding": {
        "attempt_id": "uuid",
        "state": "token-de-uso-unico",
        "expires_at": "2026-09-09T12:10:00.000Z",
        "connect_url": "https://messaging.bippa.com.br/meta/embedded-signup",
        "callback_url": "https://messaging.bippa.com.br/meta/oauth/callback",
        "sdk": {
            "app_id": "...",
            "config_id": "...",
            "graph_api_version": "v23.0",
            "extras": {}
        }
    }
}
```

O produto abre `connect_url` em popup e transfere `state` via `postMessage`
com `targetOrigin` exato — nunca a API key.

### `GET /v1/admin/onboarding/attempts/:id?source_reference=<tenant>`

Reconciliação de status (o `postMessage` do popup não é entrega durável).

Resposta `200`:

```json
{
    "onboarding": {
        "id": "uuid",
        "destination_key": "whatsapp-settings",
        "status": "pending | processing | completed | failed | expired",
        "result": {
            "destination_key": "...",
            "connection": { "...": "ver publicConnection abaixo" },
            "phones": ["...publicPhone..."]
        },
        "error_code": null,
        "error_message": null,
        "expires_at": "...",
        "consumed_at": "...",
        "completed_at": "...",
        "created_at": "..."
    }
}
```

`result` só é preenchido quando `status` é `completed`; é o mesmo objeto
devolvido ao popup.

### `POST /v1/admin/onboarding/complete` — só o popup chama, nunca o backend

Sem `X-Bippa-Api-Key`. Autenticado exclusivamente pelo `state` de uso único.

```http
POST /v1/admin/onboarding/complete
Content-Type: application/json

{ "state": "token-de-uso-unico", "code": "codigo-do-fb-login", "session_info": { "waba_id": "...", "phone_number_id": "..." } }
```

Resposta `200`:

```json
{
    "onboarding": {
        "destination_key": "whatsapp-settings",
        "connection": {
            "id": "...",
            "waba_id": "...",
            "status": "connected",
            "expires_at": null,
            "owner_business_id": "...",
            "granted_scopes": [
                "business_management",
                "whatsapp_business_management",
                "whatsapp_business_messaging"
            ]
        },
        "phones": [
            {
                "id": "...",
                "phone_number_id": "...",
                "display_phone_number": "...",
                "verified_name": "...",
                "quality_rating": "...",
                "active": true,
                "name_status": "...",
                "platform_type": "...",
                "code_verification_status": "...",
                "messaging_limit_tier": "..."
            }
        ]
    }
}
```

Erros comuns: `409 invalid_onboarding_attempt` (state expirado/já usado),
`422 invalid_meta_token`, `422 missing_meta_scopes`,
`422 waba_without_phone_numbers`, `422 phone_waba_mismatch`.

### `POST /v1/admin/onboarding/browser-events` — só o popup chama

Telemetria de diagnóstico do fluxo no navegador; não retorna dado de negócio.

```http
POST /v1/admin/onboarding/browser-events
Content-Type: application/json

{ "state": "token-de-uso-unico", "event": "meta_login_started", "detail": {} }
```

Resposta `202` sem corpo. Eventos aceitos: `popup_context_received`,
`meta_sdk_initialized`, `meta_login_started`, `meta_session_received`,
`meta_login_code_received`, `meta_login_no_code`, `completion_request_started`,
`completion_request_failed`, `popup_javascript_error`.

---

## Conexões, números e perfis de envio

### `GET /v1/admin/whatsapp-connections?source_reference=<tenant>&sync=<true|false>`

Lista todas as WABAs e números da organização. Com `sync=true` (default
`false`), o Messaging antes consulta a Meta Cloud API para atualizar
`quality_rating`, `name_status`, `platform_type`, `code_verification_status`
e `messaging_limit_tier` de cada número — best-effort: uma conexão cuja
credencial não pode ser usada é pulada (e marcada `reauth_required`) sem
falhar a listagem inteira; sem `sync`, os dados vêm só do último valor salvo.

```http
GET /v1/admin/whatsapp-connections?source_reference=tenant-123&sync=true
X-Bippa-Api-Key: bippa_<key_id>_<segredo>
```

Resposta `200`:

```json
{
    "data": [
        {
            "id": "uuid-da-conexao",
            "waba_id": "1234567890",
            "status": "connected",
            "expires_at": null,
            "owner_business_id": "...",
            "granted_scopes": [
                "business_management",
                "whatsapp_business_management",
                "whatsapp_business_messaging"
            ],
            "phones": [
                {
                    "id": "uuid-do-telefone",
                    "phone_number_id": "111222333",
                    "display_phone_number": "+55 11 5555-3333",
                    "verified_name": "Minha Empresa",
                    "quality_rating": "GREEN",
                    "active": true,
                    "name_status": "APPROVED",
                    "platform_type": "CLOUD_API",
                    "code_verification_status": "VERIFIED",
                    "messaging_limit_tier": "TIER_1K",
                    "sender_profile_key": "seller:17",
                    "external_reference": "17",
                    "capability_payments": false
                }
            ]
        }
    ]
}
```

**Não existe filtro por vendedor/seller no servidor.** A rota sempre devolve
todos os telefones da organização; o chamador filtra localmente comparando
`external_reference` com o próprio identificador de rota (nunca por
`sender_profile_key`, que é a chave interna e não deve ser usada para
matching por quem consome a API).

### `PATCH /v1/admin/phones/:id/sender-profile`

Vincula (ou revincula) um número a um perfil de envio, identificado pelo
`external_reference` que o produto usará depois em `seller_reference` nas
rotas de envio. `:id` é o `phone_numbers.id` retornado em
`GET /v1/admin/whatsapp-connections`.

```http
PATCH /v1/admin/phones/uuid-do-telefone/sender-profile
X-Bippa-Api-Key: bippa_<key_id>_<segredo>
Content-Type: application/json

{
  "source_reference": "tenant-123",
  "external_reference": "17",
  "capability_payments": false,
  "actor_reference": "user-42"
}
```

`sender_profile_key` é opcional (default `seller:<external_reference>`) — é
a chave interna de roteamento, nunca deve ser enviada de volta pelo produto
em chamadas futuras. Um telefone tem no máximo um perfil de envio; um
`external_reference` é único por organização (upsert por esse par).

Resposta `200`:

```json
{
    "sender_profile": {
        "id": "...",
        "organization_id": "...",
        "phone_id": "...",
        "connection_id": "...",
        "key": "seller:17",
        "external_reference": "17",
        "capability_payments": false
    }
}
```

Erro `404 phone_not_found` se o telefone não existir nesta organização.

---

## Templates

### `GET /v1/admin/connections/:wabaId/templates?source_reference=<tenant>&sync=<true|false>`

Com `sync` (default `true`), sincroniza com a Meta antes de responder —
insere/atualiza/remove localmente para refletir exatamente o que existe na
WABA. `:wabaId` é o `waba_id` (não o `connections.id`).

Resposta `200`:

```json
{
    "data": [
        {
            "id": "uuid-local",
            "organization_id": "...",
            "waba_id": "1234567890",
            "meta_template_id": "9876543210",
            "name": "pedido_confirmado",
            "language": "pt_BR",
            "category": "UTILITY",
            "status": "APPROVED",
            "quality_score": null,
            "rejection_reason": null,
            "components": [
                { "type": "BODY", "text": "Seu pedido {{1}} foi confirmado." }
            ],
            "last_synced_at": "..."
        }
    ]
}
```

Erro `409 connection_not_available` se a WABA não estiver `connected`.

### `GET /v1/admin/templates/:templateId?source_reference=<tenant>`

`:templateId` é o `id` local (uuid), não o `meta_template_id`. Busca **direto
na Meta** (`GET /{TEMPLATE_ID}` da Graph API), ignorando o cache local, e
atualiza a linha local com o que veio — útil para checar `status`/
`quality_score`/`rejected_reason` mais recentes de um único template sem
esperar o próximo `sync` completo de `GET .../templates`. Resposta `200` no
mesmo formato de item da listagem acima. Erro `404 template_not_found` se o
`id` não existir para esta organização; `409 connection_not_available` se a
WABA não estiver `connected`.

### `POST /v1/admin/connections/:wabaId/templates`

`:wabaId` é o `waba_id` (não o `connections.id`), mesma regra do `GET` acima.
Cria o template na Meta e o espelha localmente.

```http
POST /v1/admin/connections/1234567890/templates
X-Bippa-Api-Key: bippa_<key_id>_<segredo>
Content-Type: application/json

{
  "source_reference": "tenant-123",
  "name": "pedido_confirmado",
  "language": "pt_BR",
  "category": "UTILITY",
  "components": [
    {
      "type": "BODY",
      "text": "Seu pedido {{1}} foi confirmado.",
      "example": { "body_text": [ ["12345"] ] }
    }
  ]
}
```

Regras: `name` só letras minúsculas/números/`_`; `language` no formato
`pt`/`pt_BR`; `category` uma de `UTILITY`, `MARKETING`, `AUTHENTICATION`.
Resposta `201` com o mesmo formato de item de `GET` acima (status inicial
normalmente `PENDING`).

**Todo componente (`BODY` ou `HEADER` do tipo texto) que usa variáveis
(`{{1}}`, `{{2}}`, ...) precisa do campo `example` correspondente
(`example.body_text` para `BODY`, `example.header_text` para `HEADER`) com um
valor de amostra por variável — a Meta rejeita a criação do template sem isso.
Além disso, o texto de `BODY` **não pode começar nem terminar** com uma
variável — sempre precisa de uma **palavra real** (letra/número, não só
pontuação) antes da primeira e depois da última variável (ex.:
`"Seu pedido {{1}} foi confirmado."` é válido). **Pontuação sozinha depois da
variável não conta como texto estático** — `"Olá {{1}}, acompanhe aqui:
{{4}}."` (só um `.` depois de `{{4}}`) ainda é rejeitado pela Meta com
`subcode 2388299` mesmo não terminando literalmente em `}}`; é preciso uma
palavra de verdade depois, ex.: `"...{{4}}. Obrigada pela preferência!"`. Este
foi um caso real em produção (2026-09) onde a correção inicial (só adicionar
o ponto) não resolveu porque a validação local da época olhava apenas se a
string terminava em `}}`, sem checar se havia conteúdo textual de fato depois
— já corrigido. Este serviço valida os dois casos **antes** de chamar a Meta:
se o número de valores em `example.body_text`/`example.header_text` não bater
com o número de variáveis no texto, ou se não houver uma palavra real antes
da primeira/depois da última variável do `BODY`, a requisição falha aqui
mesmo com `400 invalid_template_components` (sem gastar uma chamada à Graph
API). Todo o resto de `components` (tipos de botão, formato de header,
limites de caracteres) continua sendo repassado como veio, sem validação
própria — só a Meta valida.**

**Erros comuns (`422 meta_graph_error`):** este é o código genérico deste
serviço para "a Meta recusou `components`/`name`/`category` mesmo com o
formato básico correto" — a causa real vem anexada em `message` (texto
original da Meta, ex.: _"Param components[0] is not a valid components..."_)
e, quando disponíveis, em `meta_code`/`meta_subcode` (os códigos numéricos que
a Meta retorna, ex.: `code: 100, subcode: 2388299` para variável colada na
borda do `BODY`), `meta_error_data_details`, `meta_error_user_title`,
`meta_error_user_msg` e `meta_trace_id` (`fbtrace_id` da Meta, útil para
abrir ticket no suporte deles). Os campos vêm juntos no corpo da resposta de
erro sempre que a Meta devolveu esses dados — o serviço que consome esta API
deve logar/exibir `meta_code`+`meta_subcode` em vez de só `message`, já que
`message` costuma ser um texto genérico ("Invalid parameter") enquanto o
subcode identifica a regra exata violada.
`meta_error_data_details` (de `error.error_data.details` na resposta da
Meta) costuma trazer a explicação mais específica ainda — ex.: para um
subcode não documentado publicamente, é frequentemente a única pista de
qual campo exato foi rejeitado (ex.: "Body parameter at index 3 contains a
URL", quando uma variável de `BODY` recebe um link completo como
`example` — a Meta não permite URL como valor de variável de `BODY`, só em
botão `URL` dedicado). `meta_error_user_title`/`meta_error_user_msg` (de
`error.error_user_title`/`error.error_user_msg`) são o título/explicação que
a própria Meta escreveria para um usuário final — quando ela os envia, tendem
a nomear a regra exata violada; mas **nem toda falha os traz** — a Meta às
vezes só retorna `message` genérico + `code`/`subcode`, sem
`error_user_title`/`error_user_msg`/`error_data.details` nenhum (esses três
campos são independentes e opcionais na resposta dela, não uma garantia por
subcode). Quando nenhum deles vem preenchido, `meta_trace_id` do
`fbtrace_id` retornado é o único caminho pra Meta esclarecer via suporte —
não é um problema deste serviço deixar de "descobrir" um campo que a própria
Meta não mandou. Internamente, toda falha da Graph
API também loga o `components`/`name`/`category` exato que foi enviado
(`request_body`, truncado em 2000 caracteres) junto do `meta_trace_id` — se
precisar confirmar se o que chegou na Meta é igual ao que foi enviado por
quem consome esta API, procure pelo `meta_trace_id` nos logs deste serviço em
vez de pedir o payload de volta pra equipe cliente. As causas mais frequentes
(depois de `example` e do posicionamento de variável no `BODY`, já
bloqueados localmente — URL como valor de variável de `BODY` **não** é
bloqueado localmente hoje, só detectado pela Meta e refletido em
`meta_error_data_details`):

- `name` já existe para aquela combinação nome+idioma na WABA (a Meta não
  permite reaproveitar nome+idioma de um template excluído recentemente —
  costuma ser necessário esperar ou usar outro nome);
- `category` incompatível com o conteúdo (ex.: texto promocional em
  `UTILITY`);
- tipo de botão (`BUTTONS`) com formato inválido (`QUICK_REPLY` não aceita
  `url`/`phone_number`, `URL`/`PHONE_NUMBER` exigem esses campos).

Um `409 connection_not_available` aqui quase sempre significa que `:wabaId`
não é um `waba_id` reconhecido para esta organização (ex.: foi enviado um
`phone_number_id` no lugar) — confira com `GET /v1/admin/connections`.

### `PATCH /v1/admin/templates/:templateId`

Só `category` e `components` podem mudar (a Meta não permite renomear nem
trocar idioma depois de criado — nome/idioma existentes são sempre reenviados
como estão).

```http
PATCH /v1/admin/templates/uuid-local
X-Bippa-Api-Key: bippa_<key_id>_<segredo>
Content-Type: application/json

{
  "source_reference": "tenant-123",
  "category": "MARKETING",
  "components": [
    { "type": "BODY", "text": "Texto novo {{1}}.", "example": { "body_text": [ ["12345"] ] } }
  ]
}
```

Resposta `200` no mesmo formato; status volta para `PENDING` até a Meta
reaprovar. Erro `404 template_not_found`. Mesma exigência de `example` para
variáveis do `POST` acima, validada localmente com `400
invalid_template_components` antes de chamar a Meta (e mesmo padrão de erro
`422 meta_graph_error` com a razão da Meta anexada em `message` para o que
passa da validação local).

### `DELETE /v1/admin/templates/:templateId`

`source_reference` vai no corpo da requisição (DELETE com corpo JSON).

```http
DELETE /v1/admin/templates/uuid-local
X-Bippa-Api-Key: bippa_<key_id>_<segredo>
Content-Type: application/json

{ "source_reference": "tenant-123" }
```

Resposta `200`: `{ "template": { "...": "linha removida" } }`.

### `GET /v1/admin/sender-profiles/:senderProfileId/template-bindings?source_reference=<tenant>`

Lista os `template_key` → template aprovado vinculados a um perfil de envio
(são esses vínculos que `POST /v1/dispatches` com `kind: "template"` resolve
pelo `template_key`).

Resposta `200`:

```json
{
    "data": [
        {
            "id": "...",
            "organization_id": "...",
            "sender_profile_id": "...",
            "template_key": "pedido_confirmado",
            "template_id": "uuid-local",
            "name": "pedido_confirmado",
            "language": "pt_BR",
            "status": "APPROVED"
        }
    ]
}
```

### `POST /v1/admin/sender-profiles/:senderProfileId/template-bindings`

```http
POST /v1/admin/sender-profiles/uuid-do-perfil/template-bindings
X-Bippa-Api-Key: bippa_<key_id>_<segredo>
Content-Type: application/json

{ "source_reference": "tenant-123", "template_id": "uuid-local", "template_key": "pedido_confirmado" }
```

`template_key` é a chave de negócio que o produto usa em
`POST /v1/dispatches` (nunca o nome real do template na Meta). `template_id`
é o `id` local (UUID) retornado na resposta de
`POST /v1/admin/connections/:wabaId/templates` — não é o `meta_template_id`
da Meta. Resposta `201` no mesmo formato de uma linha de binding. Erros `404
sender_profile_not_found` / `404 template_not_found` / `400 invalid_request`
se `source_reference`, `template_id` ou `template_key` vier ausente/vazio
(mensagem no `message` identifica qual campo, ex.: `"template_id e
obrigatorio."`). Não há restrição de `status` do template para o bind — um
template ainda `PENDING` (aprovação da Meta é assíncrona) pode ser vinculado
normalmente.

---

## Envio de mensagens

### `POST /v1/dispatches`

Envio de texto, template ou mídia. `payment_order`/`payment_status` **não**
são aceitos aqui — use as rotas de Orders abaixo, que são o único caminho
para pagamentos.

Campos comuns: `source_reference`, `seller_reference` (o
`external_reference` do perfil de envio), `recipient` (telefone E.164, com ou
sem `+`), `kind`, `idempotency_key` (obrigatória e única por organização —
deve incluir tenant, vendedor, entidade de negócio e evento para retries
seguros), `payload` (formato depende de `kind`).

**`kind: "text"`** — só é aceito se a janela de 24h da Meta estiver aberta
(há mensagem inbound recente do destinatário); fora dela, `422` com mensagem
"Fora da janela de atendimento da Meta; use um template aprovado."

```json
{
    "source_reference": "tenant-123",
    "seller_reference": "17",
    "recipient": "5511999999999",
    "kind": "text",
    "idempotency_key": "minha-app:T-42:seller:17:conversation:abc:reply-1",
    "payload": {
        "text": "Olá! Já estamos preparando seu pedido.",
        "preview_url": false
    }
}
```

**`kind: "template"`** — referencia um `template_key` já vinculado ao
perfil de envio via template-bindings; o Messaging resolve nome/idioma no
servidor:

```json
{
    "source_reference": "tenant-123",
    "seller_reference": "17",
    "recipient": "5511999999999",
    "kind": "template",
    "idempotency_key": "minha-app:T-42:seller:17:order:9081:created",
    "payload": {
        "template_key": "pedido_confirmado",
        "params": { "1": "9081" },
        "media_url": "https://exemplo.com/banner.png"
    }
}
```

`params` vira, em ordem, os parâmetros do componente `body` do template;
`media_url` (opcional) vira o componente `header` de imagem. Esse atalho só
monta componentes `body`/`header` — pra Payment Request CTA (botão
`PAYMENT_REQUEST`) e Order Details Template (botão `ORDER_DETAILS`), que têm
validação local dedicada, use `POST /v1/payment-requests` e
`POST /v1/payment-orders` com `template`, documentados na seção **Orders /
Pagamentos (Meta Payments)** abaixo — não construa esses componentes à mão
aqui. Para qualquer outro componente de botão que a Meta venha a adicionar e
que ainda não tenha rota dedicada, passe o objeto `template` já pronto, no
formato exato que a Meta espera — ele é repassado sem transformação nenhuma
(`payload.template` bruto é usado como veio em `worker.js`; `name`/`language`
precisam bater com um template já `ACTIVE` na WABA, e o `index`/`sub_type` de
cada componente de botão têm que corresponder à posição real do botão no
template aprovado). Não há validação local desse formato — erro de estrutura
aqui vira `422 meta_graph_error` vindo da Graph API, não um `400` local.

**`kind: "media"`** — o objeto `media` segue o formato de mensagem da Meta
Cloud API diretamente (`type` + `content` no formato que a Meta espera para
aquele tipo, ex.: `{ "link": "https://..." }` ou `{ "id": "media-id-da-meta" }`):

```json
{
    "source_reference": "tenant-123",
    "seller_reference": "17",
    "recipient": "5511999999999",
    "kind": "media",
    "idempotency_key": "minha-app:T-42:seller:17:order:9081:invoice",
    "payload": {
        "media": {
            "type": "document",
            "content": {
                "link": "https://exemplo.com/nota-fiscal.pdf",
                "filename": "nota-fiscal.pdf"
            }
        }
    }
}
```

**`kind: "reaction"`** — reage com um emoji a uma mensagem existente
(inbound ou outbound) identificada pelo `provider_message_id` (wamid) dela.
Está sujeita à mesma janela de 24h do `kind: "text"` (mesmo erro `422` fora
dela). Enviar `emoji: ""` remove uma reação enviada anteriormente — é assim
que a própria Cloud API da Meta modela "desfazer reação", não existe um
`kind` separado para isso:

```json
{
    "source_reference": "tenant-123",
    "seller_reference": "17",
    "recipient": "5511999999999",
    "kind": "reaction",
    "idempotency_key": "minha-app:T-42:seller:17:message:wamid123:reaction",
    "payload": { "message_id": "wamid.HBg...", "emoji": "👍" }
}
```

> Requer a migration `db/migrations/20260909000000_dispatches_allow_reaction_kind.sql`
> aplicada no banco (adiciona `'reaction'` ao `CHECK` de `dispatches.kind`);
> sem ela a Meta nunca chega a ser chamada, o insert falha antes.

**`kind: "interactive"`** — botões de resposta rápida (até 3), lista de
opções ou mensagem de catálogo/produto. Sujeita à mesma janela de 24h de
`kind: "text"`. `payload.type` é `"button"`, `"list"`, `"product"` ou
`"product_list"`; `header`/`footer` são opcionais (texto simples), exceto
para `"product"` (nunca aceita `header`) e `"product_list"` (`header`
obrigatório).

Botões (`payload.buttons`: 1 a 3 itens, `title` até 20 caracteres, `id` só
seu para identificar a escolha depois — nunca reaproveite o `title` para
lógica de negócio):

```json
{
    "source_reference": "tenant-123",
    "seller_reference": "17",
    "recipient": "5511999999999",
    "kind": "interactive",
    "idempotency_key": "minha-app:T-42:seller:17:order:9081:confirm",
    "payload": {
        "type": "button",
        "body": "Confirma o recebimento do pedido 9081?",
        "buttons": [
            { "id": "order:9081:confirm", "title": "Confirmar" },
            { "id": "order:9081:reject", "title": "Recusar" }
        ]
    }
}
```

Lista (`payload.button` é o rótulo do menu, até 20 caracteres;
`payload.sections[].rows` soma no máximo 10 linhas entre todas as seções;
`row.title` até 24 caracteres, `row.description` opcional até 72):

```json
{
    "source_reference": "tenant-123",
    "seller_reference": "17",
    "recipient": "5511999999999",
    "kind": "interactive",
    "idempotency_key": "minha-app:T-42:seller:17:order:9081:pick-shipping",
    "payload": {
        "type": "list",
        "body": "Escolha a forma de envio:",
        "button": "Ver opções",
        "sections": [
            {
                "title": "Envio",
                "rows": [
                    {
                        "id": "shipping:sedex",
                        "title": "Sedex",
                        "description": "2 dias úteis"
                    },
                    {
                        "id": "shipping:pac",
                        "title": "PAC",
                        "description": "5 dias úteis"
                    }
                ]
            }
        ]
    }
}
```

Produto único (`payload.type: "product"`; exige um catálogo do Meta Commerce
já vinculado à WABA e `product_retailer_id` cadastrado nesse catálogo):

```json
{
    "source_reference": "tenant-123",
    "seller_reference": "17",
    "recipient": "5511999999999",
    "kind": "interactive",
    "idempotency_key": "minha-app:T-42:seller:17:product:SKU-1:share",
    "payload": {
        "type": "product",
        "body": "Que tal esse aqui?",
        "catalog_id": "1234567890",
        "product_retailer_id": "SKU-1"
    }
}
```

Lista de produtos (`payload.type: "product_list"`; `header` é obrigatório
neste tipo — é o único título mostrado acima das seções; até 10 seções e 30
produtos somados entre todas elas):

```json
{
    "source_reference": "tenant-123",
    "seller_reference": "17",
    "recipient": "5511999999999",
    "kind": "interactive",
    "idempotency_key": "minha-app:T-42:seller:17:catalog:vitrine",
    "payload": {
        "type": "product_list",
        "header": "Nossos destaques",
        "body": "Separamos alguns itens para você:",
        "catalog_id": "1234567890",
        "sections": [
            {
                "title": "Promoções",
                "product_items": [
                    { "product_retailer_id": "SKU-1" },
                    { "product_retailer_id": "SKU-2" }
                ]
            }
        ]
    }
}
```

A resposta do destinatário chega como `type: "interactive"` em
`GET /v1/conversations/:id/messages`, com `body` = título do botão/linha
escolhida e `metadata.interactive_id` = o `id` que você definiu ao enviar
(use este campo para lógica de negócio, nunca o `body`/título, que pode se
repetir ou ser traduzido). Requer a migration
`db/migrations/20260909010000_dispatches_allow_interactive_kind.sql`.

> **Carrinho de catálogo:** quando o contato finaliza um carrinho a partir de
> uma mensagem de catálogo, a Meta entrega isso como `message.type: "order"`
> (não como `interactive.list_reply`). Esse tipo chega em
> `GET /v1/conversations/:id/messages` com `type: "order"`,
> `metadata.catalog_id` e `metadata.product_items` (array
> `{ product_retailer_id, quantity, item_price, currency }` — o conteúdo
> exato do carrinho); `body` traz o texto opcional que o contato pode anexar
> ao pedido (`order.text`), quando presente.

**`kind: "location"`** — envia um ponto geográfico. Sujeita à mesma janela
de 24h de `kind: "text"`. `latitude`/`longitude` são obrigatórios
(-90..90 / -180..180); `name`/`address` são opcionais (texto livre):

```json
{
    "source_reference": "tenant-123",
    "seller_reference": "17",
    "recipient": "5511999999999",
    "kind": "location",
    "idempotency_key": "minha-app:T-42:seller:17:order:9081:pickup-point",
    "payload": {
        "latitude": -23.5614,
        "longitude": -46.6558,
        "name": "Loja Paulista",
        "address": "Av. Paulista, 1000"
    }
}
```

Requer a migration
`db/migrations/20260909020000_dispatches_allow_location_kind.sql`.

**`kind: "contacts"`** — envia um ou mais cartões de contato. Sujeita à
mesma janela de 24h de `kind: "text"`. `payload.contacts` exige pelo menos 1
item; em cada contato só `name.formatted_name` é obrigatório —
`phones`/`emails`/`urls`/`addresses`/`org`/`birthday` são opcionais e, se
presentes, seguem o mesmo formato de campos da Meta (`phones[].phone`,
`emails[].email`, `urls[].url`):

```json
{
    "source_reference": "tenant-123",
    "seller_reference": "17",
    "recipient": "5511999999999",
    "kind": "contacts",
    "idempotency_key": "minha-app:T-42:seller:17:order:9081:share-contact",
    "payload": {
        "contacts": [
            {
                "name": {
                    "formatted_name": "Suporte Minha Empresa",
                    "first_name": "Suporte"
                },
                "phones": [{ "phone": "+5511999999999", "type": "WORK" }],
                "emails": [{ "email": "suporte@exemplo.com", "type": "WORK" }]
            }
        ]
    }
}
```

Requer a migration
`db/migrations/20260909030000_dispatches_allow_contacts_kind.sql`.

**`context.message_id`** — campo opcional, aceito junto com qualquer `kind`
(exceto `"reaction"`, que já referencia a mensagem via `payload.message_id`),
para responder "em cima" de uma mensagem específica da conversa (aparece na
Meta como uma citação). `message_id` é o `provider_message_id` (wamid) da
mensagem citada, inbound ou outbound:

```json
{
    "source_reference": "tenant-123",
    "seller_reference": "17",
    "recipient": "5511999999999",
    "kind": "text",
    "idempotency_key": "minha-app:T-42:seller:17:conversation:abc:reply-2",
    "context": { "message_id": "wamid.HBg..." },
    "payload": { "text": "Sobre isso: já está a caminho." }
}
```

Não requer migration (é armazenado dentro do `payload` cifrado, sem impacto
no `CHECK` de `dispatches.kind`).

Resposta `202` (ou `200` se `idempotency_key` já havia sido usada —
`duplicate: true`, sem reenviar):

```json
{
    "dispatch": {
        "id": "uuid",
        "organization_id": "...",
        "conversation_id": null,
        "sender_profile_id": "...",
        "idempotency_key": "...",
        "kind": "text",
        "status": "queued",
        "provider_message_id": null,
        "error_code": null,
        "created_at": "...",
        "sent_at": null
    },
    "duplicate": false
}
```

`status` evolui de forma assíncrona (`queued` → `sent`/`failed`) conforme o
worker processa a outbox; consulte pelo `id`/`idempotency_key` via
`GET /v1/conversations/:id/messages` quando o dispatch estiver associado a
uma conversa, ou via os eventos de saída `message.sent`/`message.failed`
(seção "Eventos de saída" abaixo).

### `POST /v1/media`

Armazena um arquivo privado no bucket configurado (Supabase Storage) e
devolve o caminho interno. É um utilitário independente de armazenamento —
**não** popula automaticamente o `payload.media.content` de um dispatch
`kind: "media"`, que precisa de um link ou id já aceito pela Meta.

```http
POST /v1/media
X-Bippa-Api-Key: bippa_<key_id>_<segredo>
Content-Type: application/json

{
  "source_reference": "tenant-123",
  "content_base64": "<arquivo em base64>",
  "filename": "nota-fiscal.pdf",
  "mime_type": "application/pdf"
}
```

Limite de 16 MB por arquivo. Resposta `201`:

```json
{
    "storage_path": "uuid-gerado/nota-fiscal.pdf",
    "mime_type": "application/pdf",
    "size_bytes": 48213
}
```

---

## Inbox / Conversas

Visão humana das conversas, isolada por organização.

### `GET /v1/conversations?source_reference=<tenant>`

```json
{
    "data": [
        {
            "id": "uuid",
            "organization_id": "...",
            "phone_id": "...",
            "contact_id": "...",
            "status": "open",
            "assigned_user_id": null,
            "last_inbound_at": "...",
            "created_at": "...",
            "updated_at": "...",
            "phone_number": "5511988887777",
            "preview": "Última mensagem em texto puro"
        }
    ]
}
```

Ordenado por `updated_at desc`, limitado a 100 conversas.

### `GET /v1/service-window?source_reference=<tenant>&seller_reference=<id>&recipient=<telefone>`

Consulta se a janela de atendimento de 24h da Meta está aberta pra um
`recipient` específico, **antes** de tentar enviar — sem isso, a única forma
de descobrir é reativa (o `422` de `kind: "text"`/`"location"`/etc. em
`POST /v1/dispatches`, ver acima). Não existe checagem local equivalente
para `payment_order`/`payment_status` (rotas de Orders) — a Meta valida a
janela do lado dela para mensagens interativas, então enviar um
`payment_order` fora da janela ainda resulta em erro vindo da Graph API, não
deste endpoint.

```json
{
    "recipient": "5511999999999",
    "within_window": true,
    "last_inbound_at": "2026-09-09T15:40:00.000Z",
    "expires_at": "2026-09-10T15:40:00.000Z"
}
```

`last_inbound_at`/`expires_at` vêm `null` quando o contato nunca mandou
mensagem pra esse número (`within_window: false` nesse caso). `seller_reference`
precisa resolver pra um perfil de envio existente na organização (`Perfil de
envio indisponivel para esta organizacao.` caso contrário).

### `GET /v1/conversations/:id/messages?source_reference=<tenant>`

```json
{
    "data": [
        {
            "id": "uuid",
            "conversation_id": "...",
            "direction": "inbound",
            "type": "text",
            "provider_message_id": "wamid...",
            "body": "Olá, quero saber do meu pedido",
            "metadata": { "type": "text" },
            "occurred_at": "...",
            "expires_at": "..."
        }
    ]
}
```

`body` já vem decifrado; após 90 dias o conteúdo é purgado e `body` volta
vazio com `metadata: {"retained": true}`. Para `type: "reaction"`, `body` é
o próprio emoji recebido e `metadata.reacted_to` traz o `provider_message_id`
(wamid) da mensagem que foi reagida. Para `type: "interactive"` (resposta a
um `kind: "interactive"` enviado), `body` é o título do botão/linha
escolhida e `metadata.interactive_id`/`metadata.interactive_type`
(`button_reply` ou `list_reply`) trazem o `id` que você definiu ao enviar.
Para `type: "location"`, `body` é o endereço/nome enviado pelo contato (se
houver) e `metadata.latitude`/`metadata.longitude` trazem as coordenadas.
Para `type: "contacts"`, `body` é o `formatted_name` do primeiro cartão
recebido e `metadata.contact_count` traz quantos cartões vieram na mensagem
(o conteúdo completo de cada cartão não é decomposto em `metadata`, só o
resumo). Quando o contato responde citando uma mensagem específica (o
"responder" do WhatsApp), `metadata.context_message_id` traz o
`provider_message_id` (wamid) da mensagem citada, em qualquer `type`.

Toda mensagem inbound recebe automaticamente, no worker, uma confirmação de
leitura à Meta (equivalente ao "✓✓ azul") acompanhada de um indicador de
"digitando..." de ~25s — uma única chamada Graph por evento
`conversation.inbound`, sem rota própria nem opção de desativar por
enquanto.

### `POST /v1/conversations/:id/reply`

Atalho para `POST /v1/dispatches` com `kind` fixo em `"text"` e vinculado à
conversa (o `provider_message_id` da resposta enviada aparece depois em
`GET /v1/conversations/:id/messages`).

```http
POST /v1/conversations/uuid-da-conversa/reply
X-Bippa-Api-Key: bippa_<key_id>_<segredo>
Content-Type: application/json

{ "source_reference": "tenant-123", "seller_reference": "17", "recipient": "5511988887777", "idempotency_key": "minha-app:T-42:conversation:uuid:reply-1", "payload": { "text": "Já verifico para você." } }
```

Resposta `202`: `{ "dispatch": { "...": "mesmo formato de POST /v1/dispatches" } }`.

### `POST /v1/conversations/:id/assign`

```json
{ "source_reference": "tenant-123", "assigned_user_id": "user-42" }
```

Se `assigned_user_id` for omitido, usa `client_id` da própria API key.
Resposta `200`: `{ "conversation": { "...": "linha atualizada" } }`. `404
not_found` se a conversa não existir nesta organização.

### `POST /v1/conversations/:id/close`

```json
{ "source_reference": "tenant-123" }
```

Resposta `200`: `{ "conversation": { "...": "status: closed" } }`.

### `GET /v1/events?source_reference=<tenant>`

Stream SSE (`text/event-stream`). **Estado atual: só emite `heartbeat` a
cada 25s com `data: {}`, sem payload de negócio ainda** — não é hoje uma
forma de acompanhar dispatches/conversas em tempo real; use polling nas
rotas acima ou os webhooks assinados (próxima seção) para isso.

---

## Orders / Pagamentos (Meta Payments)

Único caminho para `payment_order`, `payment_status` e `payment_request` —
`POST /v1/dispatches` recusa esses `kind`. Valores monetários são sempre
inteiros em centavos.

**A Payments API inteira é desligada por padrão neste serviço** — as duas
rotas abaixo respondem `503 payments_disabled` até a env var
`META_WHATSAPP_PAYMENTS_ENABLED=true` estar setada (além de `META_WHATSAPP_ENABLED`
também precisar estar ativo). Confirme isso no ambiente antes de integrar;
não é um erro de configuração do chamador, é uma feature flag deste serviço.

**Fluxo, conforme a [Payments API da
Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-br):**
o negócio envia uma mensagem `order_details` (`POST /v1/payment-orders`,
abaixo) com um `reference_id` **único** escolhido pelo próprio negócio; o
comprador paga por fora do WhatsApp (Pix, link de pagamento, boleto — ver
métodos suportados abaixo); o negócio então confirma o novo estado com
`POST /v1/payment-orders/:referenceId/order-status`, gerando uma mensagem
`order_status`. **A Meta não faz reconciliação de pagamento** — quem chama
esta API é responsável por conciliar o pagamento com o PSP usando o
`reference_id`, e por decidir quando chamar `order-status` (esta API não
descobre isso sozinha; hoje o único disparo automático de mudança de status é
o webhook de pagamento da Meta atualizando `payment_status`, não
`order_status`, ver `paymentStatusFromWebhook`/`recordPaymentWebhookStatus`
em `messaging_repository.js`).

A Meta oferece 6 variantes de integração para a Payments API Brasil; **cobertura
atual deste serviço**:

| Variante Meta                                                                                                                                       | Status aqui                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Dynamic Pix Codes](https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-br/offsite-pix)                     | ✅ implementado (`payment.methods[].type: "pix_dynamic_code"`)                                                                                                          |
| [Payment Links](https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-br/payment-links)                       | ✅ implementado (`"payment_link"`)                                                                                                                                      |
| [Boleto](https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-br/boleto)                                     | ✅ implementado (`"boleto"`)                                                                                                                                            |
| [One-click offsite card payment](https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-br/one-click-payments) | ✅ implementado (`"offsite_card_pay"`) — requer habilitação da WABA pela Meta/Solution Partner                                                                          |
| [Order Details Template](https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-br/orderdetailstemplate)       | ✅ implementado nativamente — `POST /v1/payment-orders` com `template` (ver seção dedicada abaixo), validado e rastreado em `payment_orders` como qualquer outro pedido |
| [Payment Request CTA Templates](https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payment-request-cta-templates)   | ✅ implementado nativamente — `POST /v1/payment-requests` (ver seção dedicada abaixo)                                                                                   |

**One-Click Payments (`offsite_card_pay`)** — o negócio já guarda a credencial
de cartão do comprador (tokenizada) junto ao seu PSP; nenhum dado de cartão
passa por este serviço, só a referência opaca (`credential_id`) e os últimos 4
dígitos exibidos ao comprador para confirmação:

```json
{
    "payment": {
        "methods": [
            {
                "type": "offsite_card_pay",
                "offsite_card_pay": {
                    "last_four_digits": "5235",
                    "credential_id": "1234567"
                }
            }
        ]
    }
}
```

`last_four_digits` precisa ter exatamente 4 dígitos; `credential_id` é
obrigatório (`buildOffsiteCardPay`, `orders.js`). Depois de enviado, o
comprador toca em "Revisar pagamento" no WhatsApp e aprova a cobrança — a Meta
então manda uma mensagem inbound com `interactive.type: "payment_method"`
(formato distinto do webhook de status `statuses[]`), que este serviço
processa em `ingestInbound` (`messaging_repository.js`) e repassa como um novo
evento de webhook assinado, **`payment.method_confirmed`** (ver tabela de
eventos de saída abaixo) — é nesse evento que quem integra recebe o
`credential_id` aprovado e deve efetivamente cobrar o cartão junto ao PSP.
Como em qualquer variante desta API, a Meta não faz a cobrança nem a
reconciliação — só confirma que o comprador aprovou; depois de cobrar, quem
integra ainda precisa chamar `POST /v1/payment-orders/:referenceId/order-status`
pra atualizar `payment_status`.

> Feature ainda em rollout controlado pela Meta (exige habilitação da WABA via
> Solution Partner) — confirme o acesso antes de usar em produção.

### `POST /v1/payment-orders`

```json
{
    "source_reference": "tenant-123",
    "seller_reference": "17",
    "recipient": "5511999999999",
    "idempotency_key": "minha-app:T-42:order:9081:payment-request",
    "reference_id": "pedido-9081",
    "body": "Revise e pague seu pedido.",
    "footer": "Pagamento seguro",
    "goods_type": "physical-goods",
    "payment": {
        "methods": [
            {
                "type": "pix_dynamic_code",
                "pix_dynamic_code": {
                    "code": "copia-e-cola-gerado-pelo-psp",
                    "merchant_name": "Minha Empresa",
                    "key": "chave-pix-do-recebedor",
                    "key_type": "EVP"
                }
            }
        ]
    },
    "items": [
        {
            "retailer_id": "SKU-1",
            "name": "Produto",
            "unit_amount": 5000,
            "quantity": 1
        }
    ],
    "tax_amount": 0,
    "total_amount": 5000
}
```

Regras: `reference_id` até 60 caracteres (`[A-Za-z0-9_.-]`), único por
requisição de pagamento — ele identifica o pedido, não a mensagem.
`seller_reference` precisa ter `capability_payments: true` (definido via
`PATCH /v1/admin/phones/:id/sender-profile`), senão `422
payments_not_enabled_for_sender`. Com `items`, o Messaging calcula
`subtotal` e exige `total_amount = subtotal + tax_amount + shipping_amount -
discount_amount`; sem `items`, o pedido é simplificado e só `total_amount` é
obrigatório (nesse caso um `header` de imagem é rejeitado — mesma regra da
Meta: pedido simplificado não aceita header de imagem, ver
[Orders API](https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-br/orders#full-api-reference)).
Métodos de pagamento aceitos: `pix_dynamic_code`, `payment_link`
(`payment_link.uri` HTTPS) e `boleto` (`boleto.digitable_line`) — nenhum
dado de cartão é aceito.

Campos opcionais além do exemplo acima (todos validados localmente antes de
chamar a Meta, espelhando 1:1 o [Order
Object](https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-br/orders#orderobject)
da Meta):

| Campo                                                                | Tipo                                                | Regra                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `header` (ou `header_image_url`)                                     | string (URL HTTPS)                                  | Vira o thumbnail do pedido. **Só permitido quando `items` está presente** — em pedido simplificado (sem `items`) é rejeitado com `400`.                                                                                                                                                                                                         |
| `catalog_id`                                                         | string                                              | Id do catálogo Meta Commerce associado ao pedido (opcional; não valida existência do catálogo).                                                                                                                                                                                                                                                 |
| `expiration.timestamp`                                               | epoch seconds                                       | Precisa estar pelo menos 300s no futuro; após expirar, o botão de pagamento fica desabilitado no WhatsApp do comprador.                                                                                                                                                                                                                         |
| `expiration.description`                                             | string, até 120 chars                               | Obrigatório junto com `expiration.timestamp`.                                                                                                                                                                                                                                                                                                   |
| `shipping_amount` / `shipping_description`                           | inteiro em centavos / string até 60 chars           | Entra no cálculo de `total_amount`; `shipping_description` é opcional.                                                                                                                                                                                                                                                                          |
| `discount_amount` / `discount_description` / `discount_program_name` | inteiro em centavos / string até 60 / string até 60 | `discount_amount` é subtraído no cálculo de `total_amount`; os dois campos de texto são opcionais.                                                                                                                                                                                                                                              |
| `tax_description`                                                    | string até 60 chars                                 | Texto opcional anexado ao `tax_amount` (que é sempre obrigatório, podendo ser `0`).                                                                                                                                                                                                                                                             |
| `items[].sale_unit_amount` (ou `sale_amount`)                        | inteiro em centavos                                 | Preço promocional do item; precisa ser menor que `unit_amount`. Quando presente, é o valor usado no cálculo do `subtotal` (não o `unit_amount`).                                                                                                                                                                                                |
| `goods_type` (ou `type`)                                             | `"physical-goods"` \| `"digital-goods"`             | Default `"physical-goods"` quando omitido.                                                                                                                                                                                                                                                                                                      |
| `template.name` / `template.language`                                | string / string (locale, ex. `"pt_BR"`)             | Quando presente, muda o `order_details` de mensagem interativa (`body`/`footer`/`header` acima são ignorados) para o botão `ORDER_DETAILS` de um [Order Details Template](https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-br/orderdetailstemplate) já `ACTIVE` na WABA — ver seção dedicada abaixo. |

Resposta `202` (ou `200` se `idempotency_key` repetida — `duplicate: true`):

```json
{
    "payment_order": { "reference_id": "pedido-9081", "total_amount": 5000 },
    "dispatch": {
        "...": "mesmo formato de POST /v1/dispatches, kind: payment_order"
    },
    "duplicate": false
}
```

Erro `409 reference_conflict` se `reference_id` já pertence a outro pedido
com `idempotency_key` diferente.

### `POST /v1/payment-orders/:referenceId/order-status`

```json
{
    "source_reference": "tenant-123",
    "idempotency_key": "minha-app:T-42:order:9081:status-shipped",
    "body": "Seu pedido foi enviado!",
    "order_status": "shipped"
}
```

`order_status` ∈ `pending`, `processing`, `partially_shipped`, `shipped`,
`completed`, `canceled`; `payment_status` ∈ `pending`, `captured`, `failed`
— pelo menos um dos dois é obrigatório. `recipient` e `seller_reference`,
se enviados, precisam ser iguais aos do pedido original
(`409` caso contrário). Um pedido em estado final (`completed`/`canceled`)
não aceita nova transição de `order_status` (`409
invalid_order_transition`) — essa é só a checagem feita **localmente**; a
Meta valida outras transições do lado dela e pode recusar com `422
meta_graph_error` e um dos códigos abaixo (ver `meta_code` na resposta):

| `meta_code` | Significado                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------- |
| `2046`      | Transição de `order_status` inválida (além das já bloqueadas localmente).                       |
| `2047`      | Falha ao cancelar — a Meta não cancela um pedido que já tem pagamento bem-sucedido ou pendente. |
| `2040`      | Mensagem não suportada para este destinatário (ex.: destinatário bloqueou o número).            |

Resposta `202`/`200`:

```json
{
    "payment_order": {
        "reference_id": "pedido-9081",
        "status": "shipped",
        "payment_status": "pending"
    },
    "dispatch": {
        "...": "mesmo formato de POST /v1/dispatches, kind: payment_status"
    },
    "duplicate": false
}
```

### Variante: Order Details Template

`POST /v1/payment-orders` sem `template` manda o `order_details` como
mensagem interativa comum (`type: "interactive"`), o que exige a janela de
24h de atendimento aberta (ver `GET /v1/service-window`) e não aceita anexar
um PDF. A Meta também oferece uma variante de **template** para
`order_details` — um template aprovado com um botão `ORDER_DETAILS`, que
funciona fora da janela de 24h (é um template, como qualquer outro) e aceita
header em `DOCUMENT` (PDF) além de `IMAGE`/`TEXT` — ver [Send order details
template
(Brazil)](https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-br/orderdetailstemplate).

Depois de criar o template com um botão `ORDER_DETAILS` (via `POST
/v1/admin/connections/:wabaId/templates`, `components` com `type: "BUTTONS"`
e `buttons: [{ "type": "ORDER_DETAILS", "text": "..." }]`) e ele estar
`ACTIVE` na WABA, basta chamar `POST /v1/payment-orders` normalmente
adicionando `template.name`/`template.language`:

```json
{
    "source_reference": "tenant-123",
    "seller_reference": "17",
    "recipient": "5511999999999",
    "idempotency_key": "minha-app:T-42:order:9081:order-details-template",
    "reference_id": "pedido-9081",
    "template": { "name": "pedido_9081_fatura", "language": "pt_BR" },
    "goods_type": "physical-goods",
    "payment": {
        "methods": [
            {
                "type": "pix_dynamic_code",
                "pix_dynamic_code": {
                    "code": "copia-e-cola-gerado-pelo-psp",
                    "merchant_name": "Minha Empresa",
                    "key": "chave-pix-do-recebedor",
                    "key_type": "EVP"
                }
            }
        ]
    },
    "items": [
        {
            "retailer_id": "SKU-1",
            "name": "Produto",
            "unit_amount": 5000,
            "quantity": 1
        }
    ],
    "tax_amount": 0,
    "total_amount": 5000
}
```

Quando `template` está presente, `body`/`footer`/`header` de nível raiz (que
só existem na variante interativa) são ignorados; todo o resto —
`reference_id` único, cálculo de `subtotal`/`total_amount`, `items`,
`payment.methods`, `expiration`, `discount`/`shipping`, `goods_type` — segue
**exatamente as mesmas regras e a mesma validação local** já documentadas
acima para a variante interativa (`buildOrderDetails` em `orders.js` monta o
botão `ORDER_DETAILS` em vez do `interactive.order_details`, mas reaproveita
o mesmo cálculo). O pedido fica **registrado normalmente** em
`bippa_messaging.payment_orders` — `POST
/v1/payment-orders/:referenceId/order-status` funciona depois do mesmo jeito
que para um pedido enviado como interativo. `name`/`language` precisam bater
com um template `ACTIVE` na WABA que tenha o botão `ORDER_DETAILS` no índice
`0`.

Se o template aprovado tiver um header de mídia (`IMAGE` ou `DOCUMENT`/PDF),
preencha `template.header` — vira um componente `header` extra no envio,
antes do botão `ORDER_DETAILS`:

```json
"template": {
    "name": "pedido_9081_fatura",
    "language": "pt_BR",
    "header": {
        "document": { "link": "https://cdn.example.com/fatura-9081.pdf", "filename": "fatura-9081.pdf" }
    }
}
```

Use `template.header.image.link` em vez de `document` se o template usa
header `IMAGE`. Sem `template.header`, nenhum componente `header` é enviado
— use isso só se o template realmente tiver esse placeholder, senão a Graph
API rejeita com `422 meta_graph_error`.

### `POST /v1/payment-requests`

Envia um [Payment Request CTA
Template](https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payment-request-cta-templates)
— até 3 botões `PAYMENT_REQUEST` num template aprovado, cada um embutindo
diretamente um Pix, Boleto ou Payment Link, **sem precisar de Orders API**
(sem `order`, sem `reference_id`, sem rastreamento em `payment_orders`). Útil
pra cobrar um valor avulso sem itemizar um pedido, e funciona fora da janela
de 24h por ser um template. Antes de usar, crie o template com botões
`PAYMENT_REQUEST` (`POST /v1/admin/connections/:wabaId/templates`, um botão
por método de pagamento desejado) e espere ficar `ACTIVE`.

```json
{
    "source_reference": "tenant-123",
    "seller_reference": "17",
    "recipient": "5511999999999",
    "idempotency_key": "minha-app:T-42:cobranca-avulsa:9081",
    "template": { "name": "cobranca_padrao", "language": "pt_BR" },
    "buttons": [
        {
            "type": "pix_dynamic_code",
            "pix_dynamic_code": { "code": "copia-e-cola-gerado-pelo-psp" }
        },
        {
            "type": "boleto",
            "boleto": {
                "digitable_line": "03399026944140000002628346101018898510000008848"
            }
        },
        {
            "type": "payment_link",
            "payment_link": {
                "uri": "https://minha-loja.example.com/pagar/9081"
            }
        }
    ]
}
```

`buttons` aceita de 1 a 3 entradas, `type` ∈ `pix_dynamic_code` \| `boleto` \|
`payment_link` (mesmos objetos de método usados em `POST /v1/payment-orders`,
sem o array `payment.methods` — aqui cada botão é um método). O `index` de
cada botão é a posição no array (`0`, `1`, `2`...) e precisa corresponder à
posição real do botão `PAYMENT_REQUEST` no template aprovado; passe
`buttons[].index` explicitamente só se a ordem dos botões no template não
bater com a ordem enviada. Requer `seller_reference` com
`capability_payments: true`, igual às outras rotas de pagamento, e responde
`503 payments_disabled` sob a mesma feature flag.

Resposta `202` (ou `200` se `idempotency_key` repetida):

```json
{
    "dispatch": {
        "...": "mesmo formato de POST /v1/dispatches, kind: payment_request"
    },
    "duplicate": false
}
```

---

## Eventos de saída (webhooks assinados HMAC)

O worker da outbox entrega eventos ao endpoint HTTP da aplicação cliente:

| Tipo                       | Quando dispara                                    | `data`                                                                                                   |
| -------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `conversation.inbound`     | Mensagem recebida de um contato                   | `{ conversation_id, message_id, sender_reference }`                                                      |
| `message.sent`             | Mensagem entregue à Meta com sucesso              | `{ dispatch_id, provider_message_id, sender_reference }`                                                 |
| `message.delivered`        | Meta confirma entrega ao destinatário             | `{ dispatch_id, provider_message_id, sender_reference }`                                                 |
| `message.read`             | Destinatário leu a mensagem                       | `{ dispatch_id, provider_message_id, sender_reference }`                                                 |
| `message.failed`           | Envio falhou definitivamente                      | `{ dispatch_id, sender_reference }`                                                                      |
| `payment.status_changed`   | Status de pagamento mudou (webhook da Meta)       | `{ reference_id, order_status, payment_status, payment_timestamp, sender_reference }`                    |
| `payment.method_confirmed` | Comprador aprovou cobrança via One-Click Payments | `{ reference_id, payment_method, credential_id, last_four_digits, payment_timestamp, sender_reference }` |
| `template.status_changed`  | Meta aprovou/rejeitou/pausou um template          | `{ template_id, name, language, status, rejection_reason }`                                              |

Corpo entregue (`POST` para o `callback_url` cadastrado):

```json
{
    "id": "uuid-do-evento",
    "type": "message.sent",
    "occurred_at": "...",
    "data": {
        "dispatch_id": "...",
        "provider_message_id": "wamid...",
        "sender_reference": "17"
    }
}
```

Header `x-bippa-signature-256: sha256=<hmac-sha256 hex do corpo exato acima,
usando o signing_secret da subscription>`. A aplicação cliente deve validar a
assinatura, deduplicar pelo `id` do evento e responder `2xx` rapidamente —
uma resposta não-`2xx` faz o worker tentar de novo com backoff exponencial
(até 8 tentativas, depois marca `failed`).

> **Lacuna atual:** não existe ainda uma rota administrativa para a própria
> aplicação cliente cadastrar seu `callback_url`/`signing_secret`
> (`bippa_messaging.event_subscriptions`) — hoje isso é feito manualmente no
> banco. Uma API `POST /v1/admin/event-subscriptions` (ou equivalente) fica
> como pendência antes de liberar novos consumidores em produção.
>
> `conversation.inbound` dispara tanto o webhook assinado acima (para
> subscribers cadastrados) quanto, internamente no worker, a confirmação de
> leitura + indicador de digitação (ver seção Inbox) — as duas coisas
> acontecem para o mesmo evento, na ordem: leitura primeiro, depois o webhook.

---

## Rotas que a Meta chama (não são para produtos integrados)

Estas rotas existem para conformidade e integração direta com a Meta;
nenhuma aplicação cliente deve chamá-las.

- `GET|POST /webhooks/meta/whatsapp` — verificação e eventos assinados da
  Meta (mensagens inbound, status de entrega, status de template).
- `POST /webhooks/meta/deauthorize` / `POST /webhooks/meta/data-deletion` —
  callbacks de privacidade da Meta (`signed_request`).
- `GET /privacy/deletions/:confirmationCode` — página de status de uma
  solicitação de exclusão de dados, pública por design (é o link que a Meta
  mostra ao usuário final).
- `GET /meta/embedded-signup`, `GET /meta/oauth/callback` — páginas HTML
  abertas em popup pelo navegador, não endpoints JSON.

## Infraestrutura interna (não é para produtos)

- `GET /health` — liveness check, sem autenticação.
- `POST /internal/jobs/run` — chamado só pelo Cloudflare Cron Worker via
  segredo interno (`INTERNAL_JOBS_SECRET`), processa a outbox/retenção.
