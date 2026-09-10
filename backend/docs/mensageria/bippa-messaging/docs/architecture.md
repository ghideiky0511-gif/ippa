# bippa-messaging

`bippa-messaging` e a plataforma independente de WhatsApp da Bippa. Ela usa a
Meta Cloud API diretamente e atende Count, Catalogo e futuros produtos sem
permitir que um cliente escolha WABA, numero ou credenciais.

## Limites

- `bippa-auth` so emite e valida API keys de servico (ver
  `bippa-auth/docs/api-keys.md`). Nao ha mais token de usuario: todo chamador
  autentica com `X-Bippa-Api-Key`, o que resolve `client_id`, e precisa
  informar `source_reference` no corpo/query, resolvida em
  `application_installations`. A unica excecao e a conclusao do Embedded
  Signup na propria janela do navegador (`POST /v1/admin/onboarding/complete`),
  que nunca ve a API key e e autenticada pelo `state` de uso unico emitido por
  `POST /v1/admin/onboarding/attempts` (o "onboarding launch token").
- A API HTTP usa o schema `bippa_messaging` de um projeto Supabase dedicado.
  Em producao, o Cloudflare Cron Worker assina uma chamada para a API interna
  no Render, que processa a outbox. Banco, credenciais Meta e criptografia nao
  saem do servico Render.
- Todo corpo de conversa e comando de envio e cifrado em AES-256-GCM. Logs e
  webhooks registrados contem apenas metadados redigidos.
- O worker le a outbox com `FOR UPDATE SKIP LOCKED`, envia para a Meta e chama
  assinaturas HTTP com HMAC. Depois de 90 dias remove corpo e anexos. Pix fica
  somente no comando cifrado enquanto aguarda envio e e limpo apos sucesso.

## Rotas principais

- `GET|POST /webhooks/meta/whatsapp`: validacao e eventos assinados da Meta.
- `POST /v1/dispatches`: texto, template, media e comandos de pagamento;
  `idempotency_key` e obrigatoria. Texto fora da janela de 24 horas e recusado.
- `GET /v1/conversations`, `GET /v1/conversations/:id/messages`, e as rotas
  `reply`, `assign` e `close`: Inbox humano isolado por organizacao.
- `POST /v1/payment-orders` e `/v1/payment-orders/:referenceId/order-status`:
  as ferramentas de Orders da Meta. O Messaging monta e valida os objetos
  `interactive.order_details` e `interactive.order_status`; Catalogo/PSP
  continuam fonte de verdade financeira.
- `POST /v1/admin/onboarding/attempts`: inicio do Meta Embedded Signup. Exige
  API key de servico com escopo `messaging:control`.
- `POST /v1/admin/onboarding/complete`: conclusao, chamada pela propria janela
  do navegador. Nao aceita API key; e autenticada somente pelo `state` de uso
  unico devolvido por `/attempts`.
- `GET /v1/admin/whatsapp-connections` e
  `PATCH /v1/admin/phones/:id/sender-profile`: inventario de numeros e
  roteamento de cada numero para uma referencia externa definida pela aplicacao.
- `PATCH /v1/admin/sender-profiles/:senderProfileId/payments-capability`: liga/desliga
  `capability_payments` de um perfil de envio. Deliberadamente separada da rota
  acima para que uma reassociacao rotineira de numero nunca resete essa flag —
  so deve ser chamada apos confirmar manualmente com a Meta que a WABA foi
  aprovada para Orders/Payments.

## Onboarding centralizado da Meta

A origem autorizada na Meta e unica e configuravel por
`MESSAGING_CONNECT_URL`. Em Render ela deve ser o hostname final do servico,
por exemplo `https://<novo-nome>.onrender.com`; nao use wildcard, dominio de
tenant ou dominio de cada produto.

```text
Servico Bippa -> cria tentativa autenticada -> portal connect (origem unica)
  -> Meta Embedded Signup -> POST /v1/admin/onboarding/complete
  -> Messaging valida e cifra token, sincroniza WABA/numeros, registra cada
     numero na Cloud API (evita erro Meta #133010 "Account not registered")
     e assina webhooks
```

Uma WABA pode ter varios numeros; cada um e registrado e persistido
individualmente assim que a chamada `/register` retorna, em vez de esperar
todos os numeros da lista para so entao gravar - uma falha no meio da lista
nao descarta o progresso dos numeros ja registrados. Uma nova tentativa para
um numero ja registrado reusa o PIN de verificacao em duas etapas gravado
anteriormente (nunca gera um PIN novo para um numero que a Meta ja tem
registrado, o que arriscaria uma rejeicao por PIN divergente).

Uma tentativa contem uma `state` aleatoria, com validade de dez minutos,
associada a organizacao, usuario e instalacao do produto. `destination_key` e
somente um identificador de rota interna do produto; a plataforma nao aceita
`return_to` como URL do navegador. Assim a Meta nunca precisa conhecer
dominios wildcard de Catalogo, Count ou tenants.

No app Meta, cadastre apenas enderecos exatos derivados das variaveis:

```text
SDK JavaScript / Embedded Signup: <MESSAGING_CONNECT_URL>
OAuth callback:                 <MESSAGING_CONNECT_URL>/meta/oauth/callback
Webhook WhatsApp:               <MESSAGING_PUBLIC_URL>/webhooks/meta/whatsapp
Desautorizacao:                 <MESSAGING_PUBLIC_URL>/webhooks/meta/deauthorize
Exclusao de dados:              <MESSAGING_PUBLIC_URL>/webhooks/meta/data-deletion
```

Produtos integrados (ex.: `bippa-catalogo`) usam uma unica API key de servico,
emitida pelo `bippa-auth`, para toda chamada administrativa e de envio -
inclusive para iniciar o Embedded Signup. Essa key nunca chega ao navegador. O
Messaging valida cada `X-Bippa-Api-Key` chamando
`POST {BIPPA_AUTH_BASE_URL}/internal/api-keys/validate` (com um cache curto,
ver `BIPPA_AUTH_VALIDATE_CACHE_MS`). A unica credencial que chega a janela do
navegador e o `state` de uso unico gerado em `/v1/admin/onboarding/attempts`,
que so serve para concluir aquela conexao Meta especifica.

Depois de criar a tentativa, o frontend do produto abre o `connect_url` em
popup, aguarda `bippa.meta.onboarding.loaded` e transfere somente a `state`
(o "onboarding launch token") por
`postMessage` com `targetOrigin` exato. Nenhum token humano ou de sessao e
enviado ao popup - o script da propria janela ja resolve o login com a Meta
via SDK e conclui o onboarding usando somente essa `state`. O portal devolve
apenas sucesso/erro ao mesmo `origin`; ele nao aceita `return_to` e nao envia
token Meta ao opener.

```js
const messagingOrigin = new URL(onboarding.connect_url).origin;
const popup = window.open(onboarding.connect_url, "bippa-meta-signup", "popup,width=620,height=760");
window.addEventListener("message", (event) => {
  if (event.origin !== messagingOrigin || event.source !== popup) return;
  if (event.data?.type === "bippa.meta.onboarding.loaded") {
    popup.postMessage({ type: "bippa.meta.onboarding.start", state: onboarding.state }, messagingOrigin);
  }
  if (event.data?.type === "bippa.meta.onboarding.completed") {
    // Atualize a interface com event.data.onboarding.
  }
});
```

Como `postMessage` nao e uma entrega duravel, o backend do produto deve
reconciliar a tentativa com
`GET /v1/admin/onboarding/attempts/:attempt_id?source_reference=<tenant>`,
usando a mesma `X-Bippa-Api-Key`. O estado progride por `pending`, `processing`
e `completed` ou `failed` (`expired` se nem chegou a iniciar); em `completed`, `result` contem o mesmo resultado
publico enviado ao popup. O `bippa-auth` somente valida a API key e nao recebe
nem retransmite o resultado da Meta.

Na conclusao, o backend troca o `code`, chama `debug_token`, exige os escopos
`business_management`, `whatsapp_business_management` e
`whatsapp_business_messaging`, confere o `app_id`, consulta a WABA/numeros e
so entao cifra a credencial. Uma WABA ou telefone ja conectado a outra
organizacao e recusado.

## Orders / Payments API

As rotas de Orders sao o unico caminho para `payment_order` e
`payment_status`. `POST /v1/dispatches` nao aceita mais esses tipos e nunca
aceita um `meta_payload` arbitrario. Isso evita que uma aplicacao integrada
escolha WABA, token, destinatario de uma atualizacao ou campos Graph fora do
contrato Bippa.

`POST /v1/payment-orders` recebe `source_reference`, `seller_reference`,
`recipient`, `idempotency_key`, `reference_id`, `body` e uma das duas formas
abaixo. `payment` e opcional na API Meta; quando usado, segue o formato abaixo.
Valores monetarios sao inteiros em centavos.

```json
{
  "reference_id": "catalog.9081-1",
  "recipient": "5511999999999",
  "seller_reference": "sales-team-br",
  "idempotency_key": "catalog:T-42:order:9081:payment-request",
  "body": "Revise e pague seu pedido.",
  "footer": "Pagamento seguro",
  "goods_type": "physical-goods",
  "payment": {
    "methods": [{
      "type": "pix_dynamic_code",
      "pix_dynamic_code": {
        "code": "copia-e-cola-gerado-pelo-PSP",
        "merchant_name": "Bippa",
        "key": "chave-do-recebedor",
        "key_type": "EVP"
      }
    }]
  },
  "items": [{ "retailer_id": "SKU-1", "name": "Produto", "unit_amount": 5000, "quantity": 1 }],
  "tax_amount": 0,
  "total_amount": 5000
}
```

Com `items`, o Messaging calcula `subtotal` e exige que `total_amount` seja
igual a `subtotal + tax_amount + shipping_amount - discount_amount`. Sem
`items`, o pedido e simplificado e exige somente `total_amount`; nesse caso um
header de imagem e rejeitado. Os metodos permitidos sao `pix_dynamic_code`,
`payment_link` (`payment_link.uri` HTTPS) e `boleto`
(`boleto.digitable_line`). Nenhum dado de cartao e aceito ou armazenado.

Para atualizar, chame
`POST /v1/payment-orders/:referenceId/order-status` com `idempotency_key`,
`body` e pelo menos um de `order_status` (`pending`, `processing`,
`partially_shipped`, `shipped`, `completed`, `canceled`) ou `payment_status`
(`pending`, `captured`, `failed`). `recipient` e `seller_reference`, quando
informados, precisam ser os mesmos do pedido original. O worker envia o
payload como `interactive` com a acao `review_order`.

## Provisionamento e corte

1. Crie o projeto Supabase exclusivo e aplique `db/schema.sql`.
2. Publique API em `messaging-api.bippa.com.br` e Console em
   `messaging.bippa.com.br`; configure na Meta o callback
   `https://messaging-api.bippa.com.br/webhooks/meta/whatsapp`.
3. Cadastre organizacoes, instalacoes (`count` + `tenant_id` ou `catalogo` +
   conta), WABAs, numeros, templates e bindings. Crie manualmente usuarios no
   `bippa-auth`.
4. Configure Count com `BIPPA_MESSAGING_URL` e um token client-credentials.
   Troque cada provider antigo por `bippa`, valide o smoke real e somente entao
   remova o callback anterior na Meta.

Nao ha importacao de historico, IA, nem fallback para o provedor anterior.

Para o contrato completo de consumo - toda rota, corpo de requisicao e
resposta esperada, incluindo o mapeamento multitenant de um WhatsApp por
perfil de envio - consulte [api-reference.md](api-reference.md).
