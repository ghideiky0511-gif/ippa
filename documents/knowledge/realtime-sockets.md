---
tags: [realtime, socket.io, websocket, backend, frontend, arquitetura]
created: 2026-09-18
status: atual
---

# Realtime / Socket.IO

Mapa da implementação de tempo real (Socket.IO) da IPPA: onde vive, como autentica, quais eventos existem e qual lógica de negócio depende disso. Serve como referência para humanos e para agentes de código (Claude Code, Codex etc.) trabalhando neste repo.

## Visão geral

- Monorepo com dois apps Next.js independentes, cada um com seu próprio `package.json`, deployados separadamente (Fly.io / Render):
    - **`backend/`** — API Next.js (App Router), mas rodada por um **servidor HTTP customizado** ([`backend/server.ts`](../../backend/server.ts)) via `tsx`, especificamente para poder anexar o Socket.IO ao mesmo `http.Server`. `next start` sozinho não permite interceptar `server.on("upgrade", ...)`.
    - **`frontend/`** — UI Next.js, fala com o backend via HTTP (proxy) e via WebSocket direto para realtime.
- Biblioteca: **`socket.io` v4.8.3** no servidor, **`socket.io-client`** no browser. Sem Pusher/Ably/`ws` puro.
- **Mais de uma Machine**: o backend roda com N Machines no Fly (hoje 2; `fly scale count N -a ippa-backend`), e o Socket.IO usa o **adapter Redis** (`@socket.io/redis-adapter`) pra um broadcast emitido numa Machine chegar aos sockets das outras. Todo estado que era por processo foi tratado — ver [Mais de uma Machine](#mais-de-uma-machine-adapter-redis). `backend/fly.toml` continua com `min_machines_running=1` e `auto_stop_machines=false`: uma Machine dormindo derrubaria as conexões WebSocket ativas. Capacidade, memória e limites em [Operação no Fly](#operação-no-fly).
- Redis (ver [`backend/docs/fly-redis.md`](../../backend/docs/fly-redis.md)) aparece em três papéis, todos degradáveis: cache de estoque e contagem do rate limiter (via `backend/src/lib/redis.ts`, best-effort) e o adapter do Socket.IO (conexões próprias em [`backend/src/realtime/redisAdapter.ts`](../../backend/src/realtime/redisAdapter.ts)).

## Entrada do servidor: `backend/server.ts` + `backend/src/realtime/setupRealtime.ts`

`server.ts` cuida do HTTP (CORS, Next) e dos sinais; a montagem do Socket.IO inteira (adapter, generics, memória, namespaces, aviso entre Machines, `close()`) mora em [`setupRealtime.ts`](../../backend/src/realtime/setupRealtime.ts) — separada pra o teste de cluster subir cada instância exatamente como a produção sobe.

- `PORT` (padrão 3011), `HOSTNAME` (padrão `0.0.0.0`).
- `REALTIME_ALLOWED_ORIGINS` — allow-list de origens (CSV) usada tanto no CORS do Socket.IO quanto no CORS HTTP manual do handler Next.js. Padrão dev: `http://localhost:3015`.
- `DEV_LAN_ACCESS=true` — em dev, libera qualquer origem de rede privada na porta 3015 (teste via LAN/celular).
- `new Server(httpServer, { cors: { origin: allowSocketOrigin, credentials: false } })` — `credentials: false` é proposital: a autenticação do socket **não** usa cookie no handshake, usa ticket (ver abaixo).
- **Generics de TypeScript**: o `Server` é instanciado com os quatro generics (`ListenEvents`, `EmitEvents`, `ServerSideEvents`, `SocketData`), e cada namespace tem o seu próprio conjunto — padrão "Custom types for each namespace" da doc oficial. Ver a seção [Tipagem](#tipagem-compile-time-vs-runtime) abaixo.
- **`pingInterval`/`pingTimeout` ficam no padrão** (25s + 20s = 45s). A checagem que `troubleshooting.md` manda fazer (proxy reverso com idle timeout menor que a soma) deu negativo: o fly-proxy **não fecha mais conexão TCP por ociosidade** desde 2023-09-01 ([anúncio](https://community.fly.io/t/tcp-idle-timeouts-restrictions-have-been-removed/15160)). Não mexer nesses valores sem evidência nova — um ajuste na direção errada aumenta o tráfego de heartbeat sem resolver nada.
- **Memória por conexão**: `io.engine.on("connection", (rawSocket) => { rawSocket.request = null })` descarta a requisição HTTP do handshake, que o Socket.IO guardaria pela vida inteira de cada socket (`memory-usage.md`). Efeito colateral **assumido**: `handshake.query` e `handshake.headers` ficam vazios daí em diante — por isso os middlewares dos dois namespaces leem só `handshake.auth`.
- **Shutdown gracioso**: handlers de `SIGTERM` (Fly: deploy/restart/escala) e `SIGINT` (Ctrl+C em dev) chamam `realtime.close()` → `io.close()`, que desconecta cada socket com o motivo nativo `server shutting down`, desinscreve o adapter dos canais Redis **e** fecha o `httpServer` (fechar só o HTTP não derruba quem já está em WebSocket — aviso explícito de `server-api.md`); só depois fecha as conexões Redis do adapter. Teto de 8s (`SHUTDOWN_TIMEOUT_MS`), abaixo do `kill_timeout = "12s"` do `fly.toml`, pra o processo conseguir registrar a falha antes do SIGKILL.
- Registra dois namespaces: `setupPedidosNamespace(io)` e `setupUpdatesNamespace(io)`.
- No boot, o log diz qual adapter está ativo: `> Socket.IO com adapter Redis (broadcast entre Machines).` ou `> Socket.IO com adapter em memória (sem REDIS_URL: um processo só).`

## Autenticação: tickets de curta duração (não é JWT/cookie no handshake)

Fluxo (ver [`backend/src/services/realtime/ticketService.ts`](../../backend/src/services/realtime/ticketService.ts)):

1. Cliente já autenticado via sessão/cookie HTTP normal chama um endpoint REST para "trocar" a sessão por um ticket de socket:
    - `POST /api/[tenantSlug]/realtime-ticket` → autentica via `authentication.getAuthenticatedSession`, chama `mintUpdatesRealtimeTicket(tenant, user)`.
    - `POST /api/[tenantSlug]/sessions/[id]/realtime-ticket` → idem, mas também valida `canAccessOrderSession` antes de emitir (autorização por sessão de pedido).
2. Ticket = `randomBytes(24).toString('hex')`, guardado no servidor pelo **hash sha256** (não em texto puro), `TTL = 60s`, **uso único** (`used_at` marcado na mesma query que valida). **Os dois tipos ficam na tabela `realtime_tickets`** (`realtimeTicketsModel`): `order_session_id` preenchido = ticket de sessão; `NULL` = ticket de atualizações (migration `073_realtime_tickets_updates_channel.sql`). O de atualizações já morou num `Map` em memória, o que quebrava com 2 Machines: o mint (requisição HTTP) e o consumo (handshake do WebSocket) são conexões separadas e o proxy do Fly as roteia de forma independente. `/atualizacoes` só aceita o ticket sem sessão; `/pedidos` aceita os dois, numa transação só. O mint apaga os tickets vencidos do próprio usuário na mesma transação (antes nada limpava a tabela).
3. Cliente conecta com `io(url, { auth: { tenantSlug, ticket } })`. O middleware `ns.use(...)` de cada namespace lê **`handshake.auth`** (só ele — `handshake.query` fica vazio por causa do descarte da requisição HTTP, ver acima), consome o ticket e anexa `{ tenant, user, ... }` a `socket.data` (tipado por namespace em [`backend/src/realtime/types.ts`](../../backend/src/realtime/types.ts)). Ticket inválido/expirado/reutilizado → `next(new Error(...))` rejeita a conexão.
4. Como o ticket é de uso único com TTL de 60s, o cliente **desliga a reconexão automática do Socket.IO** (`reconnection: false`) e implementa reconexão manual, sempre mintando um ticket novo a cada tentativa (senão a reconexão nativa reenviaria um ticket já consumido).

> Se for mexer em auth de socket: a lógica de emissão/consumo do ticket está toda em `ticketService.ts`; os dois endpoints REST de "realtime-ticket" são a única porta de entrada.

## Namespaces e rooms

### `/pedidos` — sessão de pedido/carrinho compartilhado

Arquivo: [`backend/src/realtime/pedidosNamespace.ts`](../../backend/src/realtime/pedidosNamespace.ts)

- Uma **room por sessão de pedido**: `session:{sessionId}`.
- Presença derivada dos sockets na room do pedido — `ns.in(room).fetchSockets()`, que com o adapter Redis inclui os sockets de **todas** as Machines (antes era um `Map` do processo). Se o adapter não responder, cai pros sockets locais e anuncia esse roster parcial **só localmente** (`ns.local`), pra não sobrescrever o roster completo que as outras Machines anunciam. No `disconnect` por `server shutting down` usa direto a lista local (o adapter já está se desinscrevendo). `socket.data.initialSnapshot` é descartado depois do join: `fetchSockets()` serializa o `data` de cada socket entre Machines.
- Eventos:

| Evento                      | Direção                          | O que faz                                                                                                                                                                                         |
| --------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entrar_sessao`             | cliente→servidor (com ack)       | Entra na room da sessão (`enterSession`)                                                                                                                                                          |
| `criar_sessao_cliente`      | cliente→servidor (com ack)       | Cliente final cria/pega sua sessão ativa direto pelo socket, chama `orders.ensureCustomerOrderSession`                                                                                            |
| `atualizar_sessao`          | cliente→servidor (com ack)       | Edita itens/campos da sessão via `orders.updateSession` (mesmo serviço do `PUT /sessions/:id`)                                                                                                    |
| `sair_sessao`               | cliente→servidor                 | Sai explicitamente da room                                                                                                                                                                        |
| `disconnect`                | nativo do socket.io              | Mesma limpeza do `sair_sessao`                                                                                                                                                                    |
| `sessao_snapshot`           | servidor→socket (só quem entrou) | Snapshot completo enviado no join                                                                                                                                                                 |
| `sessao_atualizada`         | servidor→room                    | Sessão completa, **debounced 200ms** ([`sessionBroadcast.ts`](../../backend/src/services/realtime/sessionBroadcast.ts)), disparado sempre que a sessão muda em qualquer lugar (não só via socket) |
| `presenca_atualizada`       | servidor→room                    | Lista de presença atualizada                                                                                                                                                                      |
| `participantes_atualizados` | servidor→room                    | Lista de participantes (do banco) atualizada                                                                                                                                                      |

O hook cliente ([`frontend/src/lib/realtime/usePedidoRealtime.ts`](../../frontend/src/lib/realtime/usePedidoRealtime.ts)) deriva eventos sintéticos de UI (`peca_adicionada`, `peca_retirada`, `frete_alterado`, `seller_entrou`, `seller_saiu`) **no cliente**, comparando snapshots — não são eventos reais do socket.

### `/atualizacoes` — notificações e fila (talão) em tempo real

Arquivos: [`backend/src/realtime/updatesNamespace.ts`](../../backend/src/realtime/updatesNamespace.ts), [`backend/src/services/realtime/updateBroadcast.ts`](../../backend/src/services/realtime/updateBroadcast.ts)

- Sem snapshot no join (diferente do `/pedidos`). Por isso o cliente dispara `onResync` em **toda** conexão, inclusive a primeira — ver [Erros, reconexão e disconnect](#erros-reconexão-e-disconnect).
- Um socket entra em **várias rooms ao mesmo tempo**, dependendo do papel (`updatesRoomsForUser`):
    - `updates:user:{tenantId}:{userId}` — todo usuário (usado por `notifications_updated`)
    - `updates:seller:{tenantId}:{sellerId}` — vendedoras e admins agindo como vendedora
    - `updates:client:{tenantId}:{clientId}` — clientes finais, escopados ao próprio registro de cliente
    - `updates:tenant:{tenantId}` — admin/expedição/entregador (veem a fila inteira do tenant)
- Eventos:

| Evento           | Direção       | Descrição                                                                                                                                                                                                                                                             |
| ---------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `atualizacao`    | servidor→room | Sinal legado sem payload, `{ type }` com `type ∈ {sessions_updated, orders_updated, order_books_updated, notifications_updated}` — telas antigas só refetcham ao receber                                                                                              |
| `atualizacao_v2` | servidor→room | Payload tipado (union `RealtimeEvent`, contrato Zod em [`backend/src/contracts/realtime.ts`](../../backend/src/contracts/realtime.ts)): `session_items` (diff de item), `session_patch` (patch parcial de campos), `session_created`, `book_upsert` (upsert no talão) |

Funções que disparam broadcasts (`updateBroadcast.ts`): `notifySessionCreated`, `notifySession` (com `itemsDelta` opcional para o caminho "quente" de add/remove item), `notifyOrderBook`, `notifyOrder`, `notifyUserNotification`.

**União de rooms**: quando o mesmo payload vai pra mais de uma room, o emit é único — `io.to([roomA, roomB]).emit(...)`. O Socket.IO entrega **uma vez só** a cada socket, mesmo que ele esteja em várias rooms da lista (`rooms.md`). Isso não é só economia de pacote: administrador/expedição/entregador estão ao mesmo tempo no `tenantRoom` **e** na própria `sellerRoom`, então o emit separado por room entregava o mesmo evento duas vezes pra eles. A `clientRoom` continua num emit próprio nos casos em que o payload dela é diferente (`session_created` e `session_patch` vão pra cliente sem o campo `notes`) — e nenhum socket está nas duas listas, porque role `cliente` nunca entra em `tenantRoom`/`sellerRoom`.

**Toda escrita em sessão ou talão precisa notificar.** `TalaoProvider` e `ClientSessionProvider` não fazem polling: o estado deles só muda por `atualizacao_v2` e pelo resync na conexão. Uma escrita em `order_sessions`, `order_session_items` ou `order_books` sem o `notify*` correspondente deixa a tela errada até o próximo F5 — nada mais corrige. Caminho novo de escrita chama `notifySession`/`notifySessionCreated`/`notifyOrderBook` **depois** da transação. A ordem importa quando um talão nasce junto com a sessão (`ensureCustomerOrderSession`/`createOrderSession` sem talão ativo): o `book_upsert` sai antes do `session_created`, pra a sessão já encontrar o talão na lista da vendedora.

## Cliente: hooks React

- [`frontend/src/lib/realtime/usePedidoRealtime.ts`](../../frontend/src/lib/realtime/usePedidoRealtime.ts) — conecta em `/pedidos` para uma sessão específica. Minta ticket via `POST /sessions/:id/realtime-ticket` (ou `/realtime-ticket` para fluxo de cliente), conecta com `transports: ['websocket']` e `reconnection: false`, expõe `emitWithAck` (usa `socket.timeout(10_000)`, mensagens de erro em PT-BR).
- [`frontend/src/lib/realtime/useUpdatesRealtime.ts`](../../frontend/src/lib/realtime/useUpdatesRealtime.ts) — conecta em `/atualizacoes`. Mesmo padrão de ticket + reconexão manual.
- Ambos: reconexão manual com backoff exponencial com jitter (teto de 60s), disparada em `connect_error`/`disconnect` (exceto quando a causa é `'io client disconnect'`, ou seja, desconexão intencional local). A cada tentativa, ticket novo é mintado (porque é uso único).
- **Um WebSocket por chamada de hook**: o `socket.io-client` cria um `Manager` novo quando o namespace já está em uso no mesmo host, então cada `useUpdatesRealtime` montado abre a própria conexão e minta o próprio ticket. Uma vendedora tem pelo menos duas conexões em `/atualizacoes` por aba (`TalaoProvider` + `NotificationCenter`), mais as das telas abertas e a de `/pedidos` se houver pedido ativo. Isso entra na conta de capacidade (ver [Operação no Fly](#operação-no-fly)).
- [`backend/src/realtime/types.ts`](../../backend/src/realtime/types.ts) — generics por namespace (`Server`/`Namespace`/`Socket`/`socket.data`).
- [`backend/scripts/testar-realtime-shutdown.ts`](../../backend/scripts/testar-realtime-shutdown.ts) — `npm run test:realtime`: confere contra a lib de verdade o shutdown com `io.close()`, a união de rooms e o efeito do descarte da requisição HTTP no handshake.
- [`backend/scripts/testar-realtime-cluster.ts`](../../backend/scripts/testar-realtime-cluster.ts) — `npm run test:realtime-cluster`: sobe duas instâncias (processos separados, via `setupRealtime`) contra Redis e Postgres **locais** e confere tickets entre processos, broadcast e presença entre instâncias, invalidação de tenant, rate limit compartilhado, shutdown de uma instância e uma terceira instância com o Redis fora do ar. Instruções no cabeçalho do arquivo.
- [`frontend/src/lib/realtime/applySessionEvent.ts`](../../frontend/src/lib/realtime/applySessionEvent.ts) — aplica patches incrementais de `atualizacao_v2` no estado local.
- `realtimeUrl()` resolve a origem do socket a partir de `NEXT_PUBLIC_REALTIME_URL` (env **de build**, embutida no bundle do browser), com fallback para `${protocol}//${hostname}:3011` em dev.

### Principais consumidores

- [`frontend/src/components/ClientSessionProvider.tsx`](../../frontend/src/components/ClientSessionProvider.tsx) — carrinho/sessão do cliente final. Usa os dois hooks juntos com um "guard monotônico" (compara `updatedAt`) para eventos fora de ordem não se atropelarem. Sem polling: a sessão só muda por evento e pelo resync na conexão.
- [`frontend/src/components/TalaoProvider.tsx`](../../frontend/src/components/TalaoProvider.tsx) — talão (painel de pedidos) do lado da vendedora. Sem polling: sessões e talões só mudam por `atualizacao_v2` e pelo resync na conexão.
- [`frontend/src/components/notification-center.tsx`](../../frontend/src/components/notification-center.tsx) — sino de notificações. Usa `onResync` pra recarregar o contador de não lidas.
- Outros: `workspace/customers/ClientDetailApp.tsx`, `workspace/orders/OrdersApp.tsx`, `workspace/orders/OrderTalaoModal.tsx`, `workspace/talao/TalaoHubApp.tsx`, `app/pedidos/page.tsx` — só o sinal legado `atualizacao`, **sem `onResync`**: um sinal emitido enquanto o socket estava caído não é recuperado, e a tela fica desatualizada até o próximo sinal ou navegação. `components/OrderSessionPeople(Widget).tsx` é a UI de presença.

## Lógica de negócio ligada a sockets

- **Carrinho/pedido colaborativo em tempo real** — o caso de uso central: vendedora e cliente podem estar vendo/editando o mesmo pedido em andamento simultaneamente; add/remove de item, troca de frete e mudança de status sincronizam ao vivo via `/pedidos`.
- **Presença** — quem está participando de uma sessão agora, exibido para vendedora e cliente (toasts "Fulana entrou no pedido" / "saiu do pedido").
- **Auto-atribuição de vendedora ao cliente** — quando um cliente logado adiciona ao carrinho, o sistema tenta achar uma vendedora disponível (ou, na falta, um administrador — fallback adicionado no commit `5b11b84`) inteiramente via socket (`criar_sessao_cliente`). Se ninguém disponível, cai para carrinho local + checkout direto (`pendingAssignment`).
- **Talão (fila de pedidos) ao vivo** — atualiza incrementalmente via `session_*`/`book_upsert`, sem polling.
- **Central de notificações** — `notifications_updated` dispara refetch da contagem de não lidas em vez de polling a cada 60s.
- **"Online" para fins de atribuição** — `listOnlineAdministratorIds` / `listOnlineSellerIds` ([`backend/src/models/usersModel.ts:120-143`](../../backend/src/models/usersModel.ts)) **não** olham o registro de sockets conectados; é uma query no Postgres por `user_sessions` com `revoked_at IS NULL AND expires_at > now()` — ou seja, "online" = tem sessão de login válida, não = tem socket aberto agora.
- Não há rastreamento de entregador em tempo real (GPS). Status de pedido propaga via `orders_updated`/`notifyOrder`, que é só um sinal de "refetch", não dado ao vivo.
- **Ainda por polling, fora do socket**:
    - CRM de conversas do WhatsApp (`workspace/crm/ConversationsPanel.tsx`): lista a cada 15s, conversa aberta a cada 8s. Não existe evento de mensagem nova no backend; migrar exigiria emitir no webhook do WhatsApp.
    - Pareamento do WhatsApp (`WhatsAppIntegrationApp.tsx`): 2–5s, só enquanto o QR está aberto.
    - Página pública de pagamento PIX (`app/pagar/[token]`): 4s, só com o QR na tela. Sem login, então sem socket.

## Tipagem: compile-time vs. runtime

Os dois mecanismos coexistem de propósito, e a doc oficial (`typescript.md`) é explícita: _"These type hints do not replace proper validation/sanitization of the input"_.

- **Runtime**: `RealtimeEventSchema` (Zod) valida o que chega pelo fio no `atualizacao_v2`; `UpdateOrderSessionInputSchema`/`EnsureCustomerOrderSessionSchema` validam os payloads de `atualizar_sessao`/`criar_sessao_cliente` dentro dos serviços. Nada disso mudou.
- **Compile-time**: os mapas de evento vivem em [`backend/src/contracts/realtime.ts`](../../backend/src/contracts/realtime.ts) — fonte única, copiada pro frontend por `scripts/sync-contracts.mjs`. Servidor e cliente derivam os generics do **mesmo** tipo, com os papéis invertidos (`ServerToClient` vira `ListenEvents` no cliente), então renomear um evento ou mudar um payload quebra a compilação dos dois lados de uma vez.

| Generic           | `/pedidos`                                                                                                                 | `/atualizacoes`                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Cliente→servidor  | `PedidosClientToServerEvents` (`entrar_sessao`, `criar_sessao_cliente`, `atualizar_sessao`, `sair_sessao`)                 | `AtualizacoesClientToServerEvents` = vazio (canal unidirecional)     |
| Servidor→cliente  | `PedidosServerToClientEvents` (`sessao_snapshot`, `sessao_atualizada`, `presenca_atualizada`, `participantes_atualizados`) | `AtualizacoesServerToClientEvents` (`atualizacao`, `atualizacao_v2`) |
| Servidor↔servidor | `RealtimeInterServerEvents`: `tenant_invalidated` (aviso de cache entre Machines, via adapter)                             | idem                                                                 |
| `socket.data`     | `PedidosSocketData`                                                                                                        | `UpdatesSocketData`                                                  |

O namespace raiz (`/`) não é usado e por isso tem mapas vazios: um `io.emit(...)` acidental nele vira erro de compilação em vez de um evento que ninguém recebe. `PedidoPresence`, `PedidoParticipant` e `RealtimeUpdate` continuam exportados pelos hooks do frontend (reexport), então nenhuma tela precisou mudar de import.

## Mais de uma Machine (adapter Redis)

Tudo que era estado por processo e precisava valer entre Machines:

| Estado                          | Antes                                                   | Agora                                                                                        | Por quê                                                                                     |
| ------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Broadcast (`to(room).emit`)     | adapter em memória                                      | `@socket.io/redis-adapter` ([`redisAdapter.ts`](../../backend/src/realtime/redisAdapter.ts)) | sem adapter, só os sockets do processo que emitiu recebem                                   |
| Ticket de `/atualizacoes`       | `Map` em memória                                        | `realtime_tickets` com `order_session_id` NULL                                               | mint (HTTP) e consumo (handshake) caem em Machines diferentes                               |
| Presença de `/pedidos`          | `Map` por processo                                      | `fetchSockets()` da room                                                                     | com adapter, enxerga todas as Machines                                                      |
| Rate limiter                    | `Map` por processo                                      | contador no Redis (Lua: `INCR` + `PEXPIRE`), `Map` local de fallback                         | o limite efetivo virava limite × número de Machines                                         |
| Cache slug → tenant             | `Map` por módulo (duplicado entre tsx e bundle do Next) | `globalThis` + `tenant_invalidated` via `serverSideEmit`                                     | a invalidação chega às outras Machines; o TTL de 60s continua de rede de segurança          |
| Debounce de `sessao_atualizada` | timers por processo                                     | **igual, de propósito**                                                                      | duplicata eventual é inofensiva: snapshot completo + guarda de `updatedAt` nos consumidores |

Pontos de operação:

- **Ligado por `REDIS_URL`** (o mesmo secret do cache). Sem ele o adapter é o em memória e **não se deve rodar mais de uma Machine**.
- **Sticky session não é necessário**, apesar do aviso de `redis-adapter.md`: o aviso vale pro handshake em HTTP long-polling (várias requisições). Os dois hooks conectam com `transports: ['websocket']`, então o handshake é uma requisição só. Tirar esse `transports` muda isso.
- **Redis fora do ar degrada, não derruba.** O adapter chama `publish`/`subscribe` sem `await` nem `catch`; no ioredis isso vira unhandled rejection e derrubaria o processo — `catchRejections` em `redisAdapter.ts` anexa o catch. Com o Redis fora: broadcast só local, presença local anunciada localmente, rate limiter no `Map` local; tickets não dependem do Redis. Logs `Redis do adapter indisponível` são limitados a um a cada 30s.
- Conexões do adapter são **próprias** (par pub/sub), nunca o client de cache de `lib/redis.ts` (timeout de 300ms, desiste de reconectar, trata erro como cache miss — o oposto do que o adapter precisa). O pub não tem fila offline (não acumula broadcasts atrasados); o sub tem (as inscrições são pedidas uma vez só, no boot).
- Canais prefixados `socket.io:${FLY_APP_NAME}`: outro app no mesmo Redis não recebe broadcasts deste.
- Custo: cada broadcast vira um `PUBLISH` cobrado no Upstash; cada consulta de presença, um `PUBSUB NUMSUB` + `PUBLISH` + respostas.
- No boot: `[realtime-cluster] Adapter Redis conectado (pub).` e `(sub).`

## Backpressure (avaliado, sem mudança)

Ponto cego real — o Socket.IO não expõe `bufferedAmount` (é API do `ws`, uma camada abaixo). Avaliação:

- O fan-out é pequeno por natureza: `session:{id}` costuma ter 2–3 sockets; as rooms de `/atualizacoes` são o staff de um tenant.
- O payload maior é `sessao_atualizada` (sessão inteira), já **debounced em 200ms por sessão** — teto de 5 mensagens/s por sessão. Os eventos de `atualizacao_v2` são diffs pequenos; `atualizacao` é `{type}`, ~30 bytes.
- Chegar a acumular buffer exigiria um cliente parado por dezenas de segundos **e** uma sessão muito grande ao mesmo tempo.

Conclusão: **nenhum tratamento hoje.** Ir abaixo da abstração (`socket.conn.transport.socket.bufferedAmount`, API privada) não se paga nesse volume, e `volatile.emit()` não serve porque o sinal `atualizacao` dispara refetch — descartar um deixa a tela desatualizada até o próximo evento. Se o volume mudar, é aqui que se começa a olhar.

## Erros, reconexão e disconnect

- **Servidor**: `/pedidos` limpa presença no `disconnect` e, se o usuário não tem outra conexão ativa naquela sessão, remove como participante e rebroadcasta presença/participantes. `/atualizacoes` não tem handler de disconnect — membership de room é stateless, sem nada pra limpar além do que o próprio Socket.IO já faz.
- **Cliente**: reconexão nativa desligada (`reconnection: false`); reconexão manual com backoff exponencial **com jitter** (teto de 60s, `RECONNECT_MAX_DELAY_MS`); novo ticket a cada tentativa; emits com ack usam `socket.timeout(10s)` e mensagens de erro amigáveis.
- **Deploy**: com o shutdown gracioso, o servidor encerra cada socket com o motivo `server shutting down`; o cliente recebe isso como `transport close` (verificado em `scripts/testar-realtime-shutdown.ts`), que não é `io client disconnect` e portanto dispara a reconexão manual com backoff — é o jitter que evita a rajada de todo mundo voltando junto.
- `/atualizacoes` não manda snapshot no join — por isso existe `onResync`, chamado em **toda** conexão, inclusive a primeira (agrupado numa janela de ~2s, `RESYNC_COALESCE_MS`):
    - reconexão: os eventos emitidos enquanto o socket estava fora se perderam;
    - primeira conexão: a busca inicial da tela leu o banco antes de o socket entrar nas rooms, e um evento nesse intervalo se perderia de vez (sem polling, nada o recuperaria).

    O servidor entra nas rooms no handler de `connection`, antes de o cliente ver `connect`, então um fetch disparado dali em diante não tem buraco. Custa uma busca a mais por carregamento de página ou reconexão.

## Variáveis de ambiente / deploy

| Variável                   | Onde                  | Descrição                                                                                                                                                                                                                                      |
| -------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                     | backend               | Porta do servidor HTTP custom (padrão 3011)                                                                                                                                                                                                    |
| `HOSTNAME`                 | backend               | Bind address (padrão `0.0.0.0`)                                                                                                                                                                                                                |
| `REALTIME_ALLOWED_ORIGINS` | backend               | Allow-list CSV de origens para CORS (Socket.IO + HTTP)                                                                                                                                                                                         |
| `DEV_LAN_ACCESS`           | backend               | `true`/`false` — libera origens de LAN em dev                                                                                                                                                                                                  |
| `NEXT_PUBLIC_REALTIME_URL` | frontend (build-time) | Origem do servidor de socket, embutida no bundle do browser — **precisa ser passada como build arg**, não runtime                                                                                                                              |
| `BACKEND_INTERNAL_URL`     | frontend (`[env]`)    | Endereço do backend usado pelo proxy/SSR do frontend — inclusive no `POST /realtime-ticket`. Em produção `http://ippa-backend.flycast` (ver [Operação no Fly](#operação-no-fly)). Não criar secret com esse nome: secret sobrescreve o `[env]` |
| `REDIS_URL`                | backend               | Cache de estoque e contagem do rate limiter (best-effort) **e adapter Redis do Socket.IO** (broadcast entre Machines). Sem ele: um processo só                                                                                                 |

Nenhuma variável de ambiente nova foi introduzida pela auditoria de realtime. O único ajuste de deploy é `kill_timeout = "12s"` em `backend/fly.toml` (padrão do Fly é 5s, curto demais pro drain) — é mudança de arquivo versionado, aplicada no próximo `fly deploy`.

A escala pra mais de uma Machine também não introduziu variável nova: o adapter usa o `REDIS_URL` que já existia. O que ela exige é a migration `073_realtime_tickets_updates_channel.sql` aplicada **antes** do deploy do backend (o código novo grava ticket com `order_session_id` NULL; a migration é compatível com o código antigo). `backend/fly.toml` documenta por que a Machine não pode dormir (conexões WebSocket ativas) e que mais de uma Machine exige `REDIS_URL`.

## Operação no Fly

- **Caminho de uma conexão**: o browser minta o ticket com `POST /api/{tenant}/realtime-ticket` no **frontend**, que repassa ao backend por Flycast (`http://ippa-backend.flycast`: passa pelo proxy do Fly, balanceia entre as Machines e pula as que estão com health check falhando). O WebSocket vai **direto** à URL pública do backend (`NEXT_PUBLIC_REALTIME_URL`). As duas pernas podem cair em Machines diferentes — por isso o ticket mora no Postgres.
- **Pré-requisitos do Flycast**: IP privado alocado (`fly ips allocate-v6 --private -a ippa-backend`) e `force_https = false` no `backend/fly.toml`. O Flycast só fala HTTP; com `true` o proxy responderia com redirect para `https://ippa-backend.flycast`, que não existe. O tráfego público continua em HTTPS/WSS.
- **Concorrência**: `[http_service.concurrency]` com `type = "requests"`, `soft_limit = 200`, `hard_limit = 1000`. Nesse modo cada WebSocket aberto ocupa uma vaga enquanto dura, somado às requisições HTTP em andamento. Como cada aba abre várias conexões (ver [Cliente: hooks React](#cliente-hooks-react)), o `hard_limit` é na prática o teto de pessoas conectadas por Machine. Ajustar olhando as métricas.
- **Escala**: `fly scale count N -a ippa-backend`, manual (o Fly não cria Machines sozinho). Cada Machine abre até 13 conexões no Postgres (`DATABASE_POOL_MAX` 10 + `CONTROL_DATABASE_POOL_MAX` 3), e N × 13 precisa caber no plano do Supabase.
- **Memória**: 512 MB por Machine. Em 256 MB o kernel matou o node por falta de memória em produção (2026-09-18): ~140 MB de RSS parado numa Machine que enxerga ~207 MB. Uma Machine morta derruba todos os sockets dela (os clientes reconectam com backoff) e as requisições em andamento — no frontend isso aparece como `socket hang up`/`ECONNRESET` no proxy do ticket.
- **Logs a observar**: `Presença sem as outras Machines: o adapter não respondeu.` (adapter/Redis com problema, presença parcial) e `Redis do adapter indisponível` (broadcast só local).
- **Secrets x `[env]`**: um secret com o mesmo nome sobrescreve o `[env]` do `fly.toml`. Em 2026-09-18, um secret `BACKEND_INTERNAL_URL` com aspas literais no valor quebrou o SSR e o mint de ticket do frontend.

## Histórico relevante

- `5b11b84` — substituiu SSE por Socket.IO (removeu `sseHub.ts`, adicionou `updatesNamespace.ts`/`updateBroadcast.ts`), adicionou fallback de atribuição por administrador online.
- `7f21604` — introduziu o sistema de patch incremental tipado (`atualizacao_v2`: `session_items`, `session_patch`, `session_created`, `book_upsert`).
- `05b1f33` — adapter Redis do Socket.IO e fim do estado por processo: tickets de `/atualizacoes` no Postgres, presença via `fetchSockets`, rate limiter no Redis, invalidação de tenant entre Machines.
- 2026-09-18 — talão e sessão da cliente passam a ser só por eventos: saiu o heartbeat de 30s, `onResync` roda também na primeira conexão, e o talão criado junto com uma sessão passa a sair como `book_upsert`.

## Arquivos-chave

- [`backend/server.ts`](../../backend/server.ts) — bootstrap do servidor HTTP, CORS, sinais de shutdown.
- [`backend/src/realtime/setupRealtime.ts`](../../backend/src/realtime/setupRealtime.ts) — montagem do Socket.IO (adapter, namespaces, aviso entre Machines, `close()`).
- [`backend/src/realtime/redisAdapter.ts`](../../backend/src/realtime/redisAdapter.ts) — adapter Redis e as conexões dele.
- [`backend/src/realtime/pedidosNamespace.ts`](../../backend/src/realtime/pedidosNamespace.ts)
- [`backend/src/realtime/updatesNamespace.ts`](../../backend/src/realtime/updatesNamespace.ts)
- [`backend/src/services/realtime/sessionBroadcast.ts`](../../backend/src/services/realtime/sessionBroadcast.ts)
- [`backend/src/services/realtime/updateBroadcast.ts`](../../backend/src/services/realtime/updateBroadcast.ts)
- [`backend/src/services/realtime/ticketService.ts`](../../backend/src/services/realtime/ticketService.ts)
- [`backend/src/contracts/realtime.ts`](../../backend/src/contracts/realtime.ts)
- [`frontend/src/lib/realtime/usePedidoRealtime.ts`](../../frontend/src/lib/realtime/usePedidoRealtime.ts)
- [`frontend/src/lib/realtime/useUpdatesRealtime.ts`](../../frontend/src/lib/realtime/useUpdatesRealtime.ts)
- [`frontend/src/lib/realtime/applySessionEvent.ts`](../../frontend/src/lib/realtime/applySessionEvent.ts)

## Ver também

- [[fly-redis]] (cache Redis, não relacionado ao Socket.IO)
