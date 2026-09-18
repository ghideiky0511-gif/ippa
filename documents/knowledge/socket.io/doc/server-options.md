---
source: https://socket.io/docs/v4/server-options/
fetched: 2026-09-18
status: incompleto (lista extraída via WebFetch, não o texto verbatim da página — reprodução completa recusada por copyright)
---

# Socket.IO Server Options (extraído)

## Opções principais

- **adapter** (default: `require("socket.io-adapter")`) — implementação do
  adapter que gerencia conexões entre múltiplos servidores.
- **cleanupEmptyChildNamespaces** (default: `false`) — remove
  automaticamente namespaces filhos (dinâmicos) sem sockets conectados.
- **connectionStateRecovery** (default: `undefined`) — habilita
  recuperação de sessão após desconexões temporárias.
- **connectTimeout** (default: `45000`) — ms antes de desconectar um
  cliente que não entrou em nenhum namespace com sucesso.
- **parser** (default: `socket.io-parser`) — parser de mensagens.
- **path** (default: `/socket.io/`) — URL onde o Socket.IO atende conexões.
- **serveClient** (default: `true`) — se serve o bundle do cliente nesse path.

## Opções de baixo nível (engine.io)

- **addTrailingSlash** (default: `true`)
- **allowEIO3** (default: `false`) — compatibilidade com clientes v2 (EIO3).
- **allowRequest** — função custom pra validar handshake/upgrade antes de aceitar.
- **allowUpgrades** (default: `true`) — permite upgrade de transporte (polling → websocket).
- **cookie** — config de cookie (httpOnly, sameSite, maxAge, domain).
- **cors** — configuração de CORS (origin, methods, headers, credentials).
- **httpCompression** (default: `true`) — compressão pra respostas de long-polling.
- **maxHttpBufferSize** (default: `1e6`, 1 MB) — **"quantos bytes uma única
  mensagem pode ter, antes de fechar o socket."**
- **perMessageDeflate** (default: `false`) — extensão de compressão WebSocket.
- **pingInterval** (default: `25000`) — ms entre pings do servidor pra
  detectar saúde da conexão.
- **pingTimeout** (default: `20000`) — ms que o servidor espera pelo pong
  antes de considerar a conexão perdida.
- **transports** (default: `["polling", "websocket"]`)
- **upgradeTimeout** (default: `10000`) — ms antes de cancelar um upgrade incompleto.
- **wsEngine** (default: `require("ws").Server`) — implementação de
  WebSocket server usada por baixo (confirma: é `ws` mesmo).

## Nota sobre shutdown gracioso

A documentação **não lista** uma opção dedicada de shutdown/drain nesta
página — não existe um `gracefulShutdownTimeout` ou equivalente nas
server options. O shutdown gracioso é responsabilidade da aplicação,
chamando `io.close()` (ver `server-api.md`).

## Relevante pro nosso caso (IPPA)

- `pingInterval`/`pingTimeout` não estão configurados hoje em
  `backend/server.ts` (usa os defaults 25000/20000). Precisa cruzar com o
  timeout de idle do proxy WebSocket do Fly.io — ver `troubleshooting.md`.
- `maxHttpBufferSize` também não está configurado — default 1MB. Avaliar
  se payload de `atualizar_sessao` (itens de carrinho) pode se aproximar disso.
- `cors` já está configurado em `server.ts` via `allowSocketOrigin`
  (allow-list, `credentials: false`).
