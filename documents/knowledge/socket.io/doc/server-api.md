---
source: https://socket.io/docs/v4/server-api/
fetched: 2026-09-18
status: incompleto (extração parcial via WebFetch — falta a referência completa de Server/Namespace/Socket)
---

# Socket.IO Server API (extração parcial)

**Faltando neste arquivo**: referência completa das classes `Server`,
`Namespace` e `Socket` (todos os métodos/eventos/propriedades). O WebFetch
recusou reprodução verbatim por copyright. Se a auditoria precisar de uma
assinatura específica não coberta abaixo, buscar direto em
https://socket.io/docs/v4/server-api/.

## Motivos de desconexão (`reason` no evento `disconnect`, lado servidor)

| Reason | Descrição |
| --- | --- |
| `server namespace disconnect` | Socket desconectado à força via `socket.disconnect()` no servidor |
| `client namespace disconnect` | Cliente desconectou manualmente via `socket.disconnect()` |
| `server shutting down` | Servidor está desligando |
| `ping timeout` | Cliente não mandou PONG dentro do `pingTimeout` |
| `transport close` | Conexão fechada (perda de conexão ou troca de rede) |
| `transport error` | Erro na conexão |
| `parse error` | Servidor recebeu pacote inválido do cliente |
| `forced close` | Servidor recebeu pacote inválido do cliente |
| `forced server close` | Cliente não entrou em nenhum namespace dentro do `connectTimeout` |

> **Achado relevante pra auditoria**: `server shutting down` é um motivo
> nativo — ou seja, a lib já tem suporte pra sinalizar desligamento
> gracioso aos clientes conectados. Hoje `backend/server.ts` nunca chama
> `io.close()` (não há handler de `SIGTERM`), então esse reason nunca é
> emitido — todo restart do processo (deploy, `fly secrets deploy`, OOM,
> crash de healthcheck) aparece pro cliente como `transport close`/`ping
> timeout`, indistinguível de uma queda de rede real.

## `server.close([callback])`

> "Closes the Socket.IO server and disconnect all clients. The `callback`
> argument is optional and will be called when all connections are closed."
>
> "This also closes the underlying HTTP server."

**Aviso importante da própria doc**:

> "Only closing the underlying HTTP server is not sufficient, as it will
> only prevent the server from accepting new connections but clients
> connected with WebSocket will not be disconnected right away."

Ou seja: um `httpServer.close()` sozinho (sem `io.close()`) não derruba
sockets WebSocket já conectados — eles ficam pendurados até o processo
morrer de fato (SIGKILL do Fly após o grace period).

## Camada de transporte

A doc não menciona `ws` diretamente — referencia o **Engine.IO** como a
camada que gerencia as conexões WebSocket/long-polling
(https://github.com/socketio/engine.io). `ws` é usado por baixo do
Engine.IO (ver `wsEngine` em `server-options.md`), mas não faz parte da
API pública do Socket.IO.
