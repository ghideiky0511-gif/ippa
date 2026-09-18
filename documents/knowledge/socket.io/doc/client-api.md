---
source: https://socket.io/docs/v4/client-api/
fetched: 2026-09-18
status: razoavelmente completo
---

# Socket.IO Client API

## `io([url][, options])`

- `url` `<string>` (default: `window.location.host`)
- `options` `<Object>` — inclui `forceNew` `<boolean>`
- Retorna `<Socket>`

Cria um `Manager` + `Socket`. Por padrão reaproveita instâncias de
`Manager` existentes, a menos que `forceNew: true`.

```javascript
const socket = io("ws://example.com/my-namespace", {
  reconnectionDelayMax: 10000,
  auth: { token: "123" },
  query: { "my-key": "my-value" },
});
```

- `io.protocol` — número da revisão do formato de pacote (atualmente `5`).
  Cliente e servidor precisam usar a mesma revisão.

## Classe `Manager`

Controla a conexão Engine.IO de baixo nível e a lógica de reconexão. Um
`Manager` pode ser compartilhado por múltiplos `Socket` (namespaces
diferentes).

```javascript
const manager = new Manager("https://example.com");
const socket = manager.socket("/");
const adminSocket = manager.socket("/admin");
```

### Eventos do Manager

- `'error'` — `(error: Error)`
- `'ping'` — ping recebido do servidor
- `'reconnect'` — `(attempt: number)` — reconexão bem-sucedida
- `'reconnect_attempt'` — `(attempt: number)`
- `'reconnect_error'` — `(error: Error)`
- `'reconnect_failed'` — excedeu `reconnectionAttempts`

### Métodos do Manager

- `manager.connect([callback])` — alias de `open()`
- `manager.open([callback])` — inicia a conexão (útil com `autoConnect: false`)
- `manager.reconnection([value])`, `.reconnectionAttempts([value])`,
  `.reconnectionDelay([value])`, `.reconnectionDelayMax([value])`,
  `.timeout([value])` — getter/setter das respectivas opções
- `manager.socket(nsp, options)` — cria um Socket pro namespace `nsp`
  (só `auth` de `options` é usado)

## Classe `Socket`

Interface principal — EventEmitter vinculado a um namespace específico.

### Eventos

- **`'connect'`** — disparado na conexão E na reconexão. *Não registre
  handlers dentro dele* — registre globalmente.
- **`'connect_error'`** — `(error: Error)`. Ver `socket.active` pra saber
  se vai reconectar automaticamente:

  | Motivo | Reconecta automaticamente? |
  | --- | --- |
  | Conexão de baixo nível não pôde ser estabelecida | SIM |
  | Conexão negada por middleware do servidor | NÃO |

- **`'disconnect'`** — `(reason: string, details: DisconnectDetails)`:

  | Reason | Descrição | Reconecta automaticamente? |
  | --- | --- | --- |
  | `io server disconnect` | Servidor desconectou à força | NÃO |
  | `io client disconnect` | Desconexão manual do cliente | NÃO |
  | `ping timeout` | Servidor não mandou PING a tempo | SIM |
  | `transport close` | Conexão fechada | SIM |
  | `transport error` | Erro de conexão | SIM |

### Atributos

- `socket.active` `<boolean>` — se vai reconectar automaticamente
- `socket.connected` `<boolean>`
- `socket.disconnected` `<boolean>` — inverso de `connected`
- `socket.id` `<string>` — id de sessão, muda a cada reconexão. **Não usar
  como identificador de aplicação** — usar id de sessão próprio.
- `socket.io` `<Manager>` — referência ao Manager/conexão Engine.IO
- `socket.recovered` `<boolean>` (desde v4.6.0) — se o estado da conexão
  foi recuperado com sucesso na última reconexão

### Métodos

- `socket.close()` — alias de `disconnect()`
- `socket.compress(value)` → `<Socket>` — define compressão pra próxima emissão
- `socket.connect()` → `<Socket>` — conecta/reconecta manualmente (útil com `autoConnect: false`)
- `socket.disconnect()` → `<Socket>` — desconecta manualmente, sem reconexão automática
- `socket.emit(eventName[, ...args][, ack])` → `true`

  ```javascript
  socket.emit("hello", "world");
  socket.emit("hello", "world", (response) => console.log(response));
  ```

- `socket.emitWithAck(eventName[, ...args])` → `Promise<any>`

  ```javascript
  const response = await socket.emitWithAck("hello", "world");
  try {
    const response = await socket.timeout(10000).emitWithAck("hello", "world");
  } catch (err) { /* timeout */ }
  ```

- `socket.listeners(eventName)`, `.listenersAny()`, `.listenersAnyOutgoing()`
- `socket.off([eventName][, listener])` — remove listener(s)
- `socket.offAny([listener])`, `.offAnyOutgoing([listener])`
- `socket.on(eventName, callback)` → `<Socket>`
- `socket.onAny(callback)` / `socket.onAnyOutgoing(callback)` — catch-all
  (exceto acks)
- `socket.once(eventName, callback)` → `<Socket>`
- `socket.open()` — alias de `connect()`
- `socket.prependAny(callback)` / `.prependAnyOutgoing(callback)`
- `socket.send([...args][, ack])` → `<Socket>` — equivalente a
  `emit("message", ...)`
- `socket.timeout(value)` → `<Socket>` — timeout de ack pra próxima emissão

  ```javascript
  socket.timeout(5000).emit("my-event", (err) => {
    if (err) { /* sem ack em 5000ms */ }
  });
  ```

### Flags

- `socket.volatile.emit(...)` — pacote descartável se o socket estiver
  desconectado ou o transporte não gravável

## Relevante pro nosso caso (IPPA)

- Já usamos `reconnection: false` + reconexão manual — os eventos/atributos
  acima (`socket.active`, tabela de `disconnect` reasons) confirmam que
  isso é intencional e suportado, não um workaround improvisado.
- `emitWithAck` (nativo, promise-based) existe desde que documentado aqui
  — os hooks (`usePedidoRealtime.ts`) implementam o próprio `emitWithAck`
  em cima de `socket.timeout(10_000).emit(...)` com callback, que é
  equivalente ao que a lib já oferece nativamente. Vale avaliar trocar
  pela versão nativa (`socket.timeout(10_000).emitWithAck(...)`) — menos
  código próprio pra manter.
