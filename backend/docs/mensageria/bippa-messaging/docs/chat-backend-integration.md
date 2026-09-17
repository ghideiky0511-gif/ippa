# Integração de chat para produtos Bippa

Este guia define o padrão para qualquer produto Bippa que queira mostrar uma
inbox e permitir atendimento por WhatsApp. O `bippa-messaging` é o sistema de
registro das conversas e o único componente que fala com a Meta; o backend do
produto consumidor administra sua própria UI, permissões e regras de negócio.

O contrato completo continua em [api-reference.md](./api-reference.md). Este
documento é o recorte operacional para chat e inclui um cliente de referência
pronto para ser reutilizado.

## Arquitetura obrigatória

```text
Operador / navegador
        |
        v
Backend do produto Bippa  ---- API key de serviço ---->  bippa-messaging
        |                                                       |
        +-- autorização, auditoria e regras do produto           +-- Meta / WhatsApp
```

O navegador **nunca** chama o Messaging diretamente e nunca recebe
`X-Bippa-Api-Key`. O backend consumidor é responsável por autenticar o seu
usuário, conferir se ele pode acessar o tenant e então chamar o Messaging com
sua API key de serviço.

Cada chamada informa `source_reference`: o ID do tenant no produto consumidor.
O Messaging o resolve internamente a partir de `(application_code da API key,
source_reference)`, portanto o consumidor não envia nem conhece
`organization_id`.

## Pré-requisitos

1. A aplicação deve possuir API key emitida pelo `bippa-auth`, com os escopos
   `messaging:write` e `messaging:control`.
2. O tenant precisa ter uma instalação provisionada e um perfil de envio
   vinculado. Nas operações de envio, esse perfil é identificado por
   `seller_reference`.
3. A chave fica exclusivamente em variável de ambiente do backend, por
   exemplo `BIPPA_MESSAGING_API_KEY`.

## Operações do chat

| Necessidade da UI | Operação do backend consumidor | Contrato do Messaging |
| --- | --- | --- |
| Carregar a inbox | Listar conversas do tenant | `GET /v1/conversations?source_reference=<tenant>` |
| Abrir um chat | Buscar mensagens cronologicamente | `GET /v1/conversations/:id/messages?source_reference=<tenant>` |
| Conferir se texto livre pode ser enviado | Consultar janela de 24h | `GET /v1/service-window?...` |
| Responder texto em um chat | Criar resposta vinculada à conversa | `POST /v1/conversations/:id/reply` |
| Enviar texto citando outra mensagem | Criar dispatch com `context.message_id` | `POST /v1/dispatches` com `kind: "text"` |
| Reagir a uma mensagem | Criar dispatch de reação | `POST /v1/dispatches` com `kind: "reaction"` |
| Atribuir/fechar atendimento | Alterar a conversa | `POST /v1/conversations/:id/assign` ou `/close` |

As listas são isoladas por tenant e usam cursor, com página padrão de 50 itens
(máximo 100). A inbox vem por `updated_at DESC`; cada página de mensagens vem
em `occurred_at ASC`, permitindo renderização direta em formato de chat. Passe
o `page.next_cursor` da resposta na próxima chamada para carregar a página
seguinte (mais antiga no caso das mensagens).

Use `fields` para pedir somente o que a tela precisa. A lista de conversas
aceita `status`, `phoneNumber` e `updatedSince`; a de mensagens aceita
`direction`, `types`, `occurredSince` e `occurredUntil`. Em particular, omitir
`body` e `metadata` de consultas usadas só para contagem/busca evita tráfego e
decifragem desnecessários.

Uma mensagem traz, entre outros, `direction` (`inbound` ou `outbound`), `type`,
`body`, `provider_message_id`, `metadata` e `occurred_at`. Use o
`provider_message_id` (o `wamid`) para citação ou reação; use `id` apenas como
identificador interno da mensagem armazenada.

O conteúdo (`body`) vem decifrado para o backend autorizado. Após 90 dias ele
é purgado e retorna vazio, com `metadata.retained: true`; a UI deve representar
isso como conteúdo indisponível, e não como uma mensagem vazia enviada pelo
cliente.

## Envio, reação e idempotência

Texto livre, reações e mensagens interativas dependem da janela de atendimento
de 24 horas da Meta. Antes de habilitar o botão de enviar, o backend pode
consultar `GET /v1/service-window`. Ainda assim, ele deve tratar `422`, pois a
janela pode fechar entre a consulta e o envio. Fora dela, use um template
aprovado, quando isso fizer sentido para o fluxo.

Todo envio exige uma `idempotency_key` única por organização. O backend deve
gerá-la a partir de uma ação persistida por ele, nunca de hora atual ou de um
clique temporário. Um formato recomendado é:

```text
<produto>:<tenant>:chat:<conversation-or-message-id>:<acao>:<uuid-da-acao>
```

Exemplos:

```text
sales:tenant-123:chat:conv-9:reply:9be3...
sales:tenant-123:chat:wamid.HBg...:reaction:0d21...
```

Para reagir, envie `payload: { "message_id": "<wamid>", "emoji": "👍" }`.
`emoji: ""` remove a reação anteriormente enviada. Reações não usam
`context.message_id` e, como qualquer texto livre, estão sujeitas à janela de
24 horas.

Uma resposta é aceita de forma assíncrona (`202`): isso significa que o
dispatch foi reservado, não que a Meta já a entregou. A UI deve apresentar um
estado `enviando`/`pendente` e reconciliar o resultado por polling da conversa
ou pelos webhooks de saída.

## Cliente de referência para backend Node.js

O módulo sem dependências em
[examples/bippa-chat-client.mjs](../examples/bippa-chat-client.mjs) é o padrão
inicial de SDK interno. Cada produto pode copiá-lo temporariamente ou importá-lo
por caminho relativo enquanto não houver um pacote compartilhado publicado.

```js
// Copie o módulo de referência para o código do produto, por exemplo ./lib.
import { BippaChatClient, BippaMessagingError } from "./lib/bippa-chat-client.mjs";

const chat = new BippaChatClient({
  baseUrl: process.env.BIPPA_MESSAGING_BASE_URL,
  apiKey: process.env.BIPPA_MESSAGING_API_KEY,
});

// Em uma rota autenticada do backend do produto:
const { data: conversations } = await chat.listConversations({
  sourceReference: tenantId,
  status: "open",
  limit: 25,
  fields: ["id", "phone_number", "contact_name", "preview", "updated_at"],
});

const firstPage = await chat.listMessages({
  sourceReference: tenantId,
  conversationId,
  limit: 50,
  fields: ["id", "direction", "type", "provider_message_id", "body", "occurred_at"],
});
const messages = firstPage.data;

// Ao rolar para cima, carregue a página anterior do histórico.
const olderPage = firstPage.page.has_more
  ? await chat.listMessages({
      sourceReference: tenantId,
      conversationId,
      cursor: firstPage.page.next_cursor,
      limit: 50,
      fields: ["id", "direction", "type", "provider_message_id", "body", "occurred_at"],
    })
  : null;

try {
  const result = await chat.reply({
    sourceReference: tenantId,
    conversationId,
    sellerReference: sellerId,
    recipient: customerPhone,
    text: "Olá! Já vou verificar.",
    idempotencyKey: actionIdempotencyKey,
  });
  // result.dispatch.status normalmente começa como queued.
} catch (error) {
  if (error instanceof BippaMessagingError && error.status === 422) {
    // Direcionar o operador para um template aprovado.
  }
  throw error;
}
```

Para responder citando uma mensagem, use `chat.sendText` com
`replyToMessageId` igual ao `provider_message_id` da mensagem citada. Para uma
reação, use `chat.react` com o mesmo identificador e o telefone do contato.

O cliente padroniza cabeçalhos, codificação de URL e erros HTTP. Ele não decide
quem pode ver uma conversa, não gera idempotência e não persiste estado local:
essas três responsabilidades pertencem ao backend consumidor.

## Atualização de chat e webhooks

No estado atual, o SSE `GET /v1/events` emite apenas `heartbeat`; não deve ser
usado para atualizar a UI. Para atualização imediata, o produto deve cadastrar
uma subscription de eventos e receber webhooks HMAC, ou então fazer polling
curto e controlado das conversas/mensagens abertas.

Eventos relevantes:

| Evento | Uso no produto consumidor |
| --- | --- |
| `conversation.inbound` | Invalidar/recarregar a conversa e a inbox. |
| `message.sent` | Trocar a mensagem otimista para enviada e salvar o `wamid`. |
| `message.delivered` / `message.read` | Atualizar o indicador de entrega/leitura. |
| `message.failed` | Marcar a tentativa como falha e apresentar opção de nova tentativa. |

O endpoint de webhook deve validar `x-bippa-signature-256` sobre o corpo bruto,
deduplicar pelo `id` do evento e responder `2xx` rapidamente. No momento, o
cadastro da subscription é operacional/manual; consulte a seção “Eventos de
saída” da referência da API antes de depender desse mecanismo.

## Evolução para SDK oficial

O cliente de referência delimita uma superfície pequena e estável:
`listConversations`, `listMessages`, `serviceWindow`, `reply`, `sendText` e
`react`. A próxima evolução recomendada é extrair esse arquivo para um pacote
privado versionado, por exemplo `@bippa/messaging-client`, e acrescentar:

- tipos TypeScript exportados para conversa, mensagem, dispatch e erro;
- adaptadores HTTP para Node e outros runtimes;
- verificador HMAC de webhook;
- testes de contrato contra o `bippa-messaging`;
- versionamento semântico e changelog.

Até essa publicação, os produtos devem depender apenas desses métodos e dos
contratos documentados, sem acessar o banco do Messaging nem a API da Meta.

## Operação em escala

1. Aplique uma vez a migration
   `db/migrations/20260916000000_add_inbox_cursor_indexes.sql` nos ambientes
   já existentes. Ela cria os índices com `CONCURRENTLY`, portanto deve ser
   executada fora de uma transação explícita.
2. Meça p50/p95/p99 e volume de linhas retornadas por rota, filtro e tenant.
   Alerta recomendado: p95 acima de 300 ms na listagem, ou página próxima do
   limite de 100 de forma persistente.
3. Cacheie apenas a página inicial da inbox por tenant por poucos segundos e
   invalide-a em `conversation.inbound`, `message.sent` e ao fechar/atribuir
   conversa. Não cacheie `body` de mensagens sem política de retenção e acesso
   compatível.
4. Prefira webhook assinado para invalidar o estado do produto. Se polling for
   inevitável, faça-o somente para conversas abertas/visíveis, com backoff e
   jitter; não faça polling da inbox inteira por operador.
5. Quando a busca textual por cliente/conteúdo for necessária, implemente-a
   como capacidade separada e indexada. Não use `ILIKE` sobre os textos
   cifrados nem tente decifrar linhas em massa na API de listagem.
