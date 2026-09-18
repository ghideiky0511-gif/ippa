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
- **Sem adapter Redis** (`@socket.io/redis-adapter` não está nas dependências). O Socket.IO roda em memória, instância única. É por isso que `backend/fly.toml` fixa `min_machines_running=1` e `auto_stop_machines=false` — uma máquina dormindo ou uma segunda instância quebraria as conexões WebSocket e o rate limiter em memória.
- Redis (`backend/src/lib/redis.ts`, ver [`backend/docs/fly-redis.md`](../../backend/docs/fly-redis.md)) é usado só como **cache best-effort** (token ERP, estoque) — não tem relação nenhuma com o Socket.IO.

## Entrada do servidor: `backend/server.ts`

- `PORT` (padrão 3011), `HOSTNAME` (padrão `0.0.0.0`).
- `REALTIME_ALLOWED_ORIGINS` — allow-list de origens (CSV) usada tanto no CORS do Socket.IO quanto no CORS HTTP manual do handler Next.js. Padrão dev: `http://localhost:3015`.
- `DEV_LAN_ACCESS=true` — em dev, libera qualquer origem de rede privada na porta 3015 (teste via LAN/celular).
- `new Server(httpServer, { cors: { origin: allowSocketOrigin, credentials: false } })` — `credentials: false` é proposital: a autenticação do socket **não** usa cookie no handshake, usa ticket (ver abaixo).
- Registra dois namespaces: `setupPedidosNamespace(io)` e `setupUpdatesNamespace(io)`.

## Autenticação: tickets de curta duração (não é JWT/cookie no handshake)

Fluxo (ver [`backend/src/services/realtime/ticketService.ts`](../../backend/src/services/realtime/ticketService.ts)):

1. Cliente já autenticado via sessão/cookie HTTP normal chama um endpoint REST para "trocar" a sessão por um ticket de socket:
    - `POST /api/[tenantSlug]/realtime-ticket` → autentica via `authentication.getAuthenticatedSession`, chama `mintUpdatesRealtimeTicket(tenant, user)`.
    - `POST /api/[tenantSlug]/sessions/[id]/realtime-ticket` → idem, mas também valida `canAccessOrderSession` antes de emitir (autorização por sessão de pedido).
2. Ticket = `randomBytes(24).toString('hex')`, guardado no servidor pelo **hash sha256** (não em texto puro), `TTL = 60s`, **uso único** (é consumido/apagado ao ser lido). Tickets de sessão (`/pedidos`) ficam em tabela no banco (`realtimeTicketsModel`); tickets de updates (`/atualizacoes`) ficam num `Map` em memória.
3. Cliente conecta com `io(url, { auth: { tenantSlug, ticket } })`. O middleware `ns.use(...)` de cada namespace lê `handshake.auth`/`handshake.query`, consome o ticket e anexa `{ tenant, user, ... }` a `socket.data`. Ticket inválido/expirado/reutilizado → `next(new Error(...))` rejeita a conexão.
4. Como o ticket é de uso único com TTL de 60s, o cliente **desliga a reconexão automática do Socket.IO** (`reconnection: false`) e implementa reconexão manual, sempre mintando um ticket novo a cada tentativa (senão a reconexão nativa reenviaria um ticket já consumido).

> Se for mexer em auth de socket: a lógica de emissão/consumo do ticket está toda em `ticketService.ts`; os dois endpoints REST de "realtime-ticket" são a única porta de entrada.

## Namespaces e rooms

### `/pedidos` — sessão de pedido/carrinho compartilhado

Arquivo: [`backend/src/realtime/pedidosNamespace.ts`](../../backend/src/realtime/pedidosNamespace.ts)

- Uma **room por sessão de pedido**: `session:{sessionId}`.
- Presença em memória: `Map<sessionId, Map<socketId, PresenceEntry>>` — quem está olhando/participando de uma sessão agora.
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

- Sem snapshot no join (diferente do `/pedidos`). Por isso o cliente dispara um callback `onResync` a cada *re*conexão para forçar refetch e cobrir o que foi perdido offline.
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

## Cliente: hooks React

- [`frontend/src/lib/realtime/usePedidoRealtime.ts`](../../frontend/src/lib/realtime/usePedidoRealtime.ts) — conecta em `/pedidos` para uma sessão específica. Minta ticket via `POST /sessions/:id/realtime-ticket` (ou `/realtime-ticket` para fluxo de cliente), conecta com `transports: ['websocket']` e `reconnection: false`, expõe `emitWithAck` (usa `socket.timeout(10_000)`, mensagens de erro em PT-BR).
- [`frontend/src/lib/realtime/useUpdatesRealtime.ts`](../../frontend/src/lib/realtime/useUpdatesRealtime.ts) — conecta em `/atualizacoes`. Mesmo padrão de ticket + reconexão manual.
- Ambos: reconexão manual com backoff exponencial (1s → dobra → teto de 10s), disparada em `connect_error`/`disconnect` (exceto quando a causa é `'io client disconnect'`, ou seja, desconexão intencional local). A cada tentativa, ticket novo é mintado (porque é uso único).
- [`frontend/src/lib/realtime/applySessionEvent.ts`](../../frontend/src/lib/realtime/applySessionEvent.ts) — aplica patches incrementais de `atualizacao_v2` no estado local.
- `realtimeUrl()` resolve a origem do socket a partir de `NEXT_PUBLIC_REALTIME_URL` (env **de build**, embutida no bundle do browser), com fallback para `${protocol}//${hostname}:3011` em dev.

### Principais consumidores

- [`frontend/src/components/ClientSessionProvider.tsx`](../../frontend/src/components/ClientSessionProvider.tsx) — carrinho/sessão do cliente final. Usa os dois hooks juntos com um "guard monotônico" (compara `updatedAt`) para eventos fora de ordem não se atropelarem, além de um heartbeat de refetch a cada 30s (gated por visibilidade da aba) como rede de segurança.
- [`frontend/src/components/TalaoProvider.tsx`](../../frontend/src/components/TalaoProvider.tsx) — talão (painel de pedidos) do lado da vendedora.
- [`frontend/src/components/notification-center.tsx`](../../frontend/src/components/notification-center.tsx) — sino de notificações.
- Outros: `workspace/customers/ClientDetailApp.tsx`, `workspace/orders/OrdersApp.tsx`, `workspace/orders/OrderTalaoModal.tsx`, `workspace/talao/TalaoHubApp.tsx`, `app/pedidos/page.tsx`, `components/OrderSessionPeople(Widget).tsx` (UI de presença).

## Lógica de negócio ligada a sockets

- **Carrinho/pedido colaborativo em tempo real** — o caso de uso central: vendedora e cliente podem estar vendo/editando o mesmo pedido em andamento simultaneamente; add/remove de item, troca de frete e mudança de status sincronizam ao vivo via `/pedidos`.
- **Presença** — quem está participando de uma sessão agora, exibido para vendedora e cliente (toasts "Fulana entrou no pedido" / "saiu do pedido").
- **Auto-atribuição de vendedora ao cliente** — quando um cliente logado adiciona ao carrinho, o sistema tenta achar uma vendedora disponível (ou, na falta, um administrador — fallback adicionado no commit `5b11b84`) inteiramente via socket (`criar_sessao_cliente`). Se ninguém disponível, cai para carrinho local + checkout direto (`pendingAssignment`).
- **Talão (fila de pedidos) ao vivo** — atualiza incrementalmente via `book_upsert` em vez de polling.
- **Central de notificações** — `notifications_updated` dispara refetch da contagem de não lidas em vez de polling a cada 60s.
- **"Online" para fins de atribuição** — `listOnlineAdministratorIds` / `listOnlineSellerIds` ([`backend/src/models/usersModel.ts:120-143`](../../backend/src/models/usersModel.ts)) **não** olham o registro de sockets conectados; é uma query no Postgres por `user_sessions` com `revoked_at IS NULL AND expires_at > now()` — ou seja, "online" = tem sessão de login válida, não = tem socket aberto agora.
- Não há chat nem rastreamento de entregador em tempo real (GPS). Status de pedido propaga via `orders_updated`/`notifyOrder`, que é só um sinal de "refetch", não dado ao vivo.

## Erros, reconexão e disconnect

- **Servidor**: `/pedidos` limpa presença no `disconnect` e, se o usuário não tem outra conexão ativa naquela sessão, remove como participante e rebroadcasta presença/participantes. `/atualizacoes` não tem handler de disconnect — membership de room é stateless, sem nada pra limpar além do que o próprio Socket.IO já faz.
- **Cliente**: reconexão nativa desligada (`reconnection: false`); reconexão manual com backoff exponencial 1s→10s; novo ticket a cada tentativa; `emitWithAck` com timeout de 10s e mensagens de erro amigáveis.
- `/atualizacoes` não manda snapshot no join — por isso existe `onResync`, chamado em toda reconexão (não na primeira conexão) para o consumidor fazer um refetch completo e não perder eventos ocorridos offline.

## Variáveis de ambiente / deploy

| Variável                   | Onde                  | Descrição                                                                                                         |
| -------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `PORT`                     | backend               | Porta do servidor HTTP custom (padrão 3011)                                                                       |
| `HOSTNAME`                 | backend               | Bind address (padrão `0.0.0.0`)                                                                                   |
| `REALTIME_ALLOWED_ORIGINS` | backend               | Allow-list CSV de origens para CORS (Socket.IO + HTTP)                                                            |
| `DEV_LAN_ACCESS`           | backend               | `true`/`false` — libera origens de LAN em dev                                                                     |
| `NEXT_PUBLIC_REALTIME_URL` | frontend (build-time) | Origem do servidor de socket, embutida no bundle do browser — **precisa ser passada como build arg**, não runtime |
| `REDIS_URL`                | backend               | Cache best-effort (ERP token, estoque) — **não** relacionado ao Socket.IO                                         |

`backend/fly.toml` documenta explicitamente por que a máquina não pode dormir/escalar horizontalmente: conexões WebSocket ativas e o rate limiter em memória não sobrevivem a isso. Não existe hoje adapter Redis para Socket.IO — se o backend precisar rodar em múltiplas instâncias no futuro, isso é um pré-requisito.

## Histórico relevante

- `5b11b84` — substituiu SSE por Socket.IO (removeu `sseHub.ts`, adicionou `updatesNamespace.ts`/`updateBroadcast.ts`), adicionou fallback de atribuição por administrador online.
- `7f21604` — introduziu o sistema de patch incremental tipado (`atualizacao_v2`: `session_items`, `session_patch`, `session_created`, `book_upsert`).

## Arquivos-chave

- [`backend/server.ts`](../../backend/server.ts) — bootstrap do servidor HTTP + Socket.IO, CORS.
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
