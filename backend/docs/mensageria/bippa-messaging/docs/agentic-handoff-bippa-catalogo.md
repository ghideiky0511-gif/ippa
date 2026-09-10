# Handoff agentico: Meta onboarding no bippa-catalogo

## Objetivo

Implementar no `bippa-catalogo` a integracao duravel com o Meta Embedded Signup
exposto pelo `bippa-messaging`. O Catalogo inicia a tentativa no backend, abre o
popup no frontend e reconcilia o resultado pelo backend. O `bippa-auth` valida a
API key do Catalogo, mas nao recebe nem retransmite o resultado da Meta.

## Fronteiras de seguranca

- `X-Bippa-Api-Key` existe somente no backend do Catalogo.
- O navegador recebe apenas `attempt_id`, `state`, `expires_at`, `connect_url` e
  configuracao publica do SDK retornada pelo Messaging.
- Nunca enviar a API key, token Meta ou credenciais de sessao para o frontend.
- Nunca aceitar `connect_url` ou uma URL de retorno informada pelo navegador.
- No `postMessage`, validar simultaneamente `event.origin` e `event.source`.
- Usar como `targetOrigin` o origin exato derivado do `connect_url`; nunca usar
  `*` ao transmitir o `state`.
- `source_reference` deve ser a referencia canonica e imutavel do tenant no
  Catalogo. O mesmo valor deve ser usado em provisionamento, inicio e consulta.

## Configuracao do Catalogo

Variaveis somente no backend:

```env
BIPPA_MESSAGING_URL=https://bippa-messaging.onrender.com
BIPPA_MESSAGING_API_KEY=<api-key emitida pelo bippa-auth>
```

A API key precisa pertencer ao `application_code` usado pela instalacao do
Catalogo e possuir o scope `messaging:control`. Nao copiar segredos internos do
Messaging ou do Meta para o Catalogo.

## Contrato servidor-a-servidor

Todas as chamadas abaixo usam:

```http
X-Bippa-Api-Key: <BIPPA_MESSAGING_API_KEY>
Content-Type: application/json
```

### 1. Garantir a instalacao do tenant

Antes do onboarding, a instalacao `application_code + source_reference` precisa
existir no Messaging. Use o fluxo de provisionamento ja adotado pelo Catalogo.
Se ele ainda nao existir, integrar `POST /v1/admin/application-installations/provision`
conforme `docs/api-reference.md`.

### 2. Criar a tentativa

O frontend chama uma rota propria do backend do Catalogo, por exemplo:

```http
POST /api/integrations/whatsapp/onboarding
```

O backend resolve o tenant a partir da sessao autenticada e chama:

```http
POST /v1/admin/onboarding/attempts
```

```json
{
    "application_code": "bippa-catalogo",
    "source_reference": "<tenant-id-canonico>",
    "actor_reference": "<usuario-admin-id>",
    "destination_key": "whatsapp-settings"
}
```

Resposta `201`:

```json
{
    "onboarding": {
        "attempt_id": "<uuid>",
        "state": "<token-opaco-de-uso-unico>",
        "expires_at": "<timestamp>",
        "connect_url": "https://bippa-messaging.onrender.com/meta/embedded-signup",
        "callback_url": "https://bippa-messaging.onrender.com/meta/oauth/callback",
        "sdk": {
            "app_id": "...",
            "config_id": "...",
            "graph_api_version": "...",
            "extras": {}
        }
    }
}
```

### Configuracao obrigatoria no painel da Meta

Em **Facebook Login for Business > Settings**, habilitar login pelo JavaScript
SDK e cadastrar, com correspondencia exata (HTTPS, host, caminho e sem barra
final adicional), estas duas URIs em **Valid OAuth Redirect URIs**:

```text
https://bippa-messaging.onrender.com/meta/embedded-signup
https://bippa-messaging.onrender.com/meta/oauth/callback
```

Cadastrar tambem `bippa-messaging.onrender.com` em **Allowed Domains for the
JavaScript SDK**. O `FB.login()` e executado em `/meta/embedded-signup`; por isso
essa pagina precisa estar autorizada mesmo que a API exponha `callback_url`.
O endpoint `/meta/oauth/callback` e a URI de callback declarada pelo contrato,
mas nao e o canal pelo qual o Catalogo recebe o resultado: o resultado duravel
continua sendo consultado pelo `attempt_id`.

Persistir no Catalogo pelo menos `attempt_id`, `tenant_id`, `status=pending`,
`expires_at` e timestamps. O `state` e efemero: entregar ao frontend uma vez e
nao registrar em logs, analytics ou banco.

Ao registrar a abertura da tentativa, logar somente `attempt_id`, tenant e
`expires_at`. O `state` funciona como credencial de uso unico do popup e deve
ser explicitamente removido de mensagens como `Tentativa de onboarding aberta`.

### 3. Consultar/reconciliar a tentativa

O backend do Catalogo chama:

```http
GET /v1/admin/onboarding/attempts/<attempt_id>?source_reference=<tenant-id-canonico>
X-Bippa-Api-Key: <BIPPA_MESSAGING_API_KEY>
```

Resposta `200`:

```json
{
    "onboarding": {
        "id": "<uuid>",
        "destination_key": "whatsapp-settings",
        "status": "pending|processing|completed|failed|expired",
        "result": null,
        "error_code": null,
        "error_message": null,
        "expires_at": "<timestamp>",
        "consumed_at": null,
        "completed_at": null,
        "created_at": "<timestamp>"
    }
}
```

Em `completed`, `result` contem:

```json
{
    "destination_key": "whatsapp-settings",
    "connection": {
        "id": "<uuid>",
        "waba_id": "<meta-waba-id>",
        "status": "connected",
        "expires_at": null,
        "owner_business_id": "<meta-business-id>",
        "granted_scopes": []
    },
    "phones": [
        {
            "id": "<uuid>",
            "phone_number_id": "<meta-phone-number-id>",
            "display_phone_number": "+55...",
            "verified_name": "...",
            "quality_rating": "GREEN|YELLOW|RED|UNKNOWN",
            "name_status": "APPROVED|...",
            "platform_type": "CLOUD_API|ON_PREMISE",
            "code_verification_status": "VERIFIED|NOT_VERIFIED",
            "messaging_limit_tier": "TIER_50|TIER_1K|TIER_10K|TIER_100K|UNLIMITED",
            "active": true
        }
    ]
}
```

`quality_rating`, `name_status`, `platform_type`, `code_verification_status` e
`messaging_limit_tier` sao os campos que a Meta expoe por numero de telefone.
Pagamento nao e um dado da Meta por numero: o `capability_payments` retornado
pela rota de listagem (item 4 abaixo) e uma flag propria do Messaging, setada
via `PATCH /v1/admin/sender-profiles/:senderProfileId/payments-capability` —
uma acao administrativa deliberada e separada da associacao rotineira de
numero (`PATCH /v1/admin/phones/:id/sender-profile`, que nao aceita mais este
campo), porque so deve ser chamada depois de confirmar manualmente com a Meta
que a WABA foi aprovada para Orders/Payments. Ver "Orders / Pagamentos" no
`api-reference.md` para o fluxo completo de `order_details`.

### 4. Listar as conexoes do tenant

Depois que a tentativa estiver `completed`, o backend do Catalogo pode
reconciliar as conexoes e numeros diretamente no Messaging. Esta rota tambem
exige o `source_reference` canonico; autenticar apenas com a API key nao informa
qual tenant deve ser consultado:

```http
GET /v1/admin/whatsapp-connections?source_reference=<tenant-id-canonico>
X-Bippa-Api-Key: <BIPPA_MESSAGING_API_KEY>
```

Montar a query com `URLSearchParams` (ou equivalente), inclusive quando a
referencia contiver `:`:

```js
const query = new URLSearchParams({ source_reference: sourceReference });
const response = await fetch(
    `${BIPPA_MESSAGING_BASE_URL}/v1/admin/whatsapp-connections?${query}`,
    { headers: { "X-Bippa-Api-Key": BIPPA_MESSAGING_API_KEY } },
);
```

O endpoint do Catalogo exposto ao frontend, por exemplo
`GET /api/admin/whatsapp/connections`, deve resolver `sourceReference` a partir
do tenant e seller autenticados e repassa-lo ao Messaging. Nunca esperar que o
navegador envie esse identificador.

Por padrao esta rota so le o que ja esta persistido (comportamento inalterado
para quem ja integra). Passar `?sync=true` faz o Messaging buscar ao vivo na
Meta, antes de responder, `quality_rating`, `name_status`, `platform_type`,
`code_verification_status` e `messaging_limit_tier` de cada WABA conectada da
organizacao e atualizar o banco - use isso na tela que exibe esses dados ao
tenant (ex.: `integracoes/whatsapp`), nao em polling frequente, ja que adiciona
uma chamada a Graph API por WABA conectada a cada requisicao. Uma WABA com
token invalido/expirado nao derruba a listagem quando sincronizada: ela e
marcada `reauth_required` e devolvida com os ultimos valores conhecidos.

Um `400` do Messaging nesta consulta e erro de contrato/configuracao da chamada
(por exemplo, `source_reference` ausente), nao rejeicao da Meta. Nao converter
genericamente respostas `4xx` em `onboarding_rejected`. Preservar um codigo
tecnico seguro e registrar no backend o status e a mensagem devolvidos pelo
Messaging. O status real do onboarding deve vir exclusivamente de
`GET /v1/admin/onboarding/attempts/:attempt_id`.

Tratar `404 onboarding_attempt_not_found` como tentativa ausente ou pertencente
a outro tenant. Nao consultar novamente para sempre depois de um estado final.

## Fluxo do frontend

1. Solicitar a tentativa ao backend do Catalogo.
2. Registrar o listener de `message` antes de abrir o popup.
3. Abrir `connect_url` e manter a referencia retornada por `window.open`.
4. Aguardar `bippa.meta.onboarding.loaded`.
5. Somente entao enviar `bippa.meta.onboarding.start` com o `state`.
6. Em `completed` ou `failed`, consultar a rota de status do backend do
   Catalogo. O evento melhora a UX, mas a fonte de verdade e a reconciliacao.
7. Se o popup fechar ou o evento se perder, continuar consultando o backend ate
   um estado final ou ate `expires_at`.

Referencia segura:

```js
const messagingOrigin = new URL(onboarding.connect_url).origin;
let popup;

function onMessagingEvent(event) {
    if (event.origin !== messagingOrigin || event.source !== popup) return;

    if (event.data?.type === "bippa.meta.onboarding.loaded") {
        popup.postMessage(
            { type: "bippa.meta.onboarding.start", state: onboarding.state },
            messagingOrigin,
        );
    }

    if (
        [
            "bippa.meta.onboarding.completed",
            "bippa.meta.onboarding.failed",
        ].includes(event.data?.type)
    ) {
        void refreshAttempt(onboarding.attempt_id);
    }
}

window.addEventListener("message", onMessagingEvent);
popup = window.open(
    onboarding.connect_url,
    "bippa-meta-signup",
    "popup,width=620,height=760",
);
```

Remover o listener ao desmontar a tela ou finalizar a tentativa. Se
`window.open` retornar `null`, informar que o navegador bloqueou o popup.

## Rota de status do Catalogo

Expor ao frontend uma rota propria, por exemplo:

```http
GET /api/integrations/whatsapp/onboarding/<attempt_id>
```

Ela deve:

1. autenticar o usuario humano;
2. resolver o tenant da sessao, nunca do query string do navegador;
3. confirmar que o `attempt_id` foi criado para esse tenant;
4. consultar o Messaging com o `source_reference` canonico;
5. persistir o estado/resultados relevantes localmente;
6. devolver ao frontend apenas dados necessarios para a tela.

Na rota de listagem de conexoes, aplicar a mesma resolucao server-side do
tenant e sempre acrescentar `?source_reference=<referencia-canonica>` ao chamar
o Messaging.

Polling recomendado: a cada 2 segundos enquanto o popup estiver aberto e a
cada 5 segundos depois, com limite em `expires_at`. Aplicar uma pequena
variacao aleatoria para evitar rajadas simultaneas.

## Estados e UX

- `pending`: popup ainda nao iniciou a conclusao; permitir reabrir enquanto nao
  expirado.
- `processing`: Messaging esta validando token, WABA, numeros e subscription.
- `completed`: exibir conexao e numeros retornados; encerrar polling.
- `failed`: exibir mensagem segura e permitir iniciar uma nova tentativa; nao
  reutilizar `state` nem `attempt_id`.
- `expired`: criar uma nova tentativa.

Nao considerar o fechamento do popup como falha. Uma conclusao pode ter sido
persistida antes de o evento chegar ao opener.

## Idempotencia e observabilidade

- Uma tentativa e de uso unico. Nunca repetir o `POST .../complete` no Catalogo;
  essa chamada pertence exclusivamente ao popup hospedado pelo Messaging.
- Correlacionar logs por `attempt_id`, `source_reference` e request ID, sem
  registrar API key, `state`, authorization `code` ou tokens Meta.
- Repetir consultas `GET` e seguro.
- Em falha de rede/5xx na consulta, manter o estado anterior e tentar novamente
  com backoff; nao criar automaticamente outra tentativa enquanto a atual ainda
  puder ter sido concluida.

## Criterios de aceite

- O `state` so e enviado depois do evento `loaded` e para o origin exato.
- Eventos de outra janela ou origin sao ignorados.
- Uma conexao concluida aparece mesmo quando o evento `completed` e perdido ou
  o popup e fechado imediatamente.
- Refresh da pagina retoma a reconciliacao pelo `attempt_id` persistido.
- `failed` e `expired` permitem nova tentativa sem reutilizar credenciais.
- Um usuario de um tenant nao consulta tentativa de outro tenant.
- Nenhuma API key, `state`, code ou token Meta aparece em bundle, storage do
  navegador, logs ou analytics.
- Testes cobrem popup bloqueado, evento perdido, fechamento antecipado,
  `completed`, `failed`, `expired`, 401, 404 e 5xx temporario.

## Fora de escopo

- O Catalogo nao troca o authorization code da Meta.
- O Catalogo nao armazena token Meta.
- O Auth nao recebe callback nem resultado de onboarding.
- O Catalogo nao chama `/v1/admin/onboarding/complete`.
