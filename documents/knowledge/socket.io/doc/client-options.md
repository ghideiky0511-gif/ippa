---
source: https://socket.io/docs/v4/client-options/
fetched: 2026-09-18
status: razoavelmente completo
---

# Socket.IO Client Options

## Opções da fábrica `io()`

- **forceNew** (default: `false`) — cria um novo `Manager` em vez de
  reaproveitar um existente.
- **multiplex** (default: `true`) — inverso de `forceNew`.

## Opções de baixo nível (Engine.IO) — compartilhadas por todos os Sockets do mesmo Manager

- **addTrailingSlash** (v4.6.0+, default `true`) — controla a barra final na URL.
- **autoUnref** (default `false`) — permite o processo Node encerrar mesmo com o cliente conectado.
- **closeOnBeforeunload** (default `false`, mudou na v4.7.1) — fecha a conexão no `beforeunload` do browser.
- **extraHeaders** — headers HTTP customizados (não funciona no WebSocket
  nativo do browser — só Node.js/React Native).
- **forceBase64** (default `false`) — força base64 pra conteúdo binário via WebSocket.
- **path** (default `/socket.io/`) — precisa bater com o do servidor.
- **protocols** — subprotocolo(s) WebSocket.
- **query** — parâmetros extras (`socket.handshake.query` no servidor).
  Reservados: `EIO`, `transport`, `sid`, `j`, `t`.
- **rememberUpgrade** (default `false`) — após WebSocket bem-sucedido,
  tenta WebSocket primeiro nas próximas.
- **timestampParam** / **timestampRequests** (default `"t"` / `true`) — cache-busting.
- **transportOptions** — config por transporte.
- **transports** (default `["polling", "websocket", "webtransport"]`).
- **tryAllTransports** (v4.8.0+, default `false`) — tenta outros
  transportes se o primeiro falhar.
- **upgrade** (default `true`).
- **withCredentials** (default `false`) — inclui cookies/auth em requests
  cross-origin. Não pode combinar com `cors.origin: "*"` no servidor.
- Node.js: `agent`, `pfx`, `key`, `passphrase`, `cert`, `ca`, `ciphers`,
  `rejectUnauthorized` (TLS).

## Opções do Manager — compartilhadas por todos os Sockets

- **autoConnect** (default `true`).
- **parser** (v2.2.0+).
- **randomizationFactor** (default `0.5`) — jitter no delay de reconexão.
  Timings default: 1ª tentativa 500–1500ms, 2ª 1000–3000ms, 3ª
  2000–5000ms, depois sempre ~5000ms.
- **reconnection** (default `true`).
- **reconnectionAttempts** (default `Infinity`).
- **reconnectionDelay** (default `1000`) — delay inicial, afetado por `randomizationFactor`.
- **reconnectionDelayMax** (default `5000`) — cada tentativa dobra o delay até esse teto.
- **timeout** (default `20000`) — timeout de tentativa de conexão.

## Opções do Socket — específicas por instância

- **ackTimeout** (v4.6.0+) — timeout default de ack, precisa vir com `retries`.
- **auth** — credenciais no acesso ao namespace (estático ou callback
  dinâmico, pode ser atualizado em `connect_error` e reconectado).
- **retries** (v4.6.0+) — tentativas de reenvio de pacote antes de
  descartar. Exige que o servidor faça ack dos eventos.

## Relevante pro nosso caso (IPPA)

- **Já desligamos a reconexão nativa** (`reconnection: false`) e
  reimplementamos manualmente com jitter + backoff — a doc mostra que a
  reconexão nativa **já tem** `randomizationFactor` (jitter) e
  `reconnectionDelayMax` (teto) nativamente, o que é essencialmente o que
  reimplementamos à mão. A razão documentada em
  `documents/knowledge/realtime-sockets.md` pra não usar a nativa é o
  ticket de uso único (reconexão nativa reenviaria um ticket já
  consumido) — continua válida, `auth` como callback dinâmico
  (`auth: (cb) => cb({...})`) poderia resolver isso mintando um ticket
  novo a cada tentativa, mas é uma mudança de abordagem maior, não um fix
  pontual.
- `retries` + `ackTimeout` nativos podem substituir parte do
  `emitWithAck` customizado — mesmo ponto do `client-api.md`.
