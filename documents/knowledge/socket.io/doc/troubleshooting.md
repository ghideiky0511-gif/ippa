---
source: https://socket.io/docs/v4/troubleshooting-connection-issues/
fetched: 2026-09-18
status: resumo, mas com conteúdo específico útil
---

# Troubleshooting Connection Issues (resumo)

## Falhas de conexão

- Socket.IO client não é uma implementação WebSocket pura — não conecta a
  um servidor WebSocket "cru".
- Causas comuns: servidor inalcançável (testável via curl, deve responder
  com session id + config), incompatibilidade de versão entre
  client/server, CORS faltando, falta de sticky sessions em setup
  multi-servidor, path divergente entre cliente e servidor (default
  `/socket.io/`).

## Desconexões

Desconexões são "comuns e esperadas", mesmo em conexão estável. Causas
específicas:

- **Timeout de proxy**: `proxy_read_timeout` do nginx / `ProxyTimeout` do
  Apache precisam ser **maiores** que `pingInterval + pingTimeout` do
  Socket.IO. Senão o proxy mata a conexão antes do heartbeat do Socket.IO
  detectar o problema.
- **Throttling de browser**: abas minimizadas podem falhar heartbeat.
  Socket.IO v4.1.3+ inverteu o mecanismo (servidor manda PING, não o
  cliente) especificamente pra mitigar isso.
- **Payload grande**: passar de `maxHttpBufferSize` (1MB default) ou
  demorar mais que `pingTimeout` derruba a conexão.

## Problemas de HTTP long-polling

Quando o upgrade pra WebSocket falha, a conexão fica presa em
long-polling:

- Proxy reverso descartando o header `Connection: upgrade` → erro
  `TRANSPORT_MISMATCH`.
- Conflito com outras ferramentas de monitoramento rodando outra
  instância de Socket.IO.

## Boas práticas (avisos da doc)

- Não registrar listeners de evento dentro do handler de `'connect'`
  (duplica a cada reconexão).
- Não atrasar registro de handler com operação assíncrona.
- Não confiar em `socket.id` como identificador — é efêmero, regenerado a
  cada reconexão.
- Cuidado ao deployar em plataforma serverless com conexões de longa
  duração (não é o caso do Fly com Machine sempre ligada, mas vale saber).

## Relevante pro nosso caso (IPPA)

- **Achado direto e acionável**: nosso backend está atrás do proxy do
  Fly.io. Precisamos confirmar o idle timeout do proxy WebSocket do Fly
  (não documentado localmente) contra `pingInterval + pingTimeout`
  (default 25s + 20s = 45s, já que `server.ts` não sobrescreve). Se o
  timeout do proxy for menor que 45s, o proxy mata a conexão antes do
  Socket.IO detectar — apareceria como desconexão "silenciosa" que só o
  cliente percebe (via `transport close`), nunca teríamos o log de `ping
  timeout` do lado do servidor.
- `socket.id` efêmero confirma que o padrão já usado (ticket + sessão de
  usuário como identidade real, não `socket.id`) está correto.
- Já seguimos a boa prática de registrar listeners fora do `'connect'`
  nos dois hooks do frontend.
