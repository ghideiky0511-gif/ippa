---
source: https://socket.io/docs/v4/logging-and-debugging/
fetched: 2026-09-18
status: razoavelmente completo
---

# Logging and Debugging

- Socket.IO é instrumentado pela lib `debug`. Silencioso por padrão.
- Habilitar no Node.js via variável de ambiente `DEBUG`:

  ```
  DEBUG=* node yourfile.js
  ```

- No browser, via `localStorage.debug`:

  ```javascript
  localStorage.debug = '*';
  ```

- Filtrar escopos específicos (separado por vírgula):

  ```
  DEBUG=socket.io:client* node yourfile.js
  DEBUG=engine,socket.io* node yourfile.js
  ```

- O pacote `debug` adiciona ~4KB ao bundle minificado/gzipado do browser.
  Pra remover em build de produção com webpack: loader
  `webpack-remove-debug`.
- Alguns erros no console do browser vêm do próprio browser (erros de
  conexão, CORS), não do Socket.IO — fora do controle da lib.

## Relevante pro nosso caso (IPPA)

- Hoje não há nenhum uso de `DEBUG=socket.io*`/`DEBUG=engine*` documentado
  no repo — útil pra diagnosticar o item de "motivo de desconexão não
  logado" (ver `server-api.md`) sem precisar instrumentar código: pode
  ligar `DEBUG=socket.io:*` temporariamente em ambiente de investigação
  em vez de (ou além de) adicionar log próprio no `disconnect` handler.
- Next.js custom server (`server.ts`) roda via `tsx` — confirmar que
  `DEBUG` como env var do processo chega até o `debug` require'd pelo
  `socket.io` normalmente (deveria, é uma env var de processo Node comum).
