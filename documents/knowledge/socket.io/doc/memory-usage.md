---
source: https://socket.io/docs/v4/memory-usage/
fetched: 2026-09-18
status: resumo raso (benchmarks e gráficos da página não capturados)
---

# Memory Usage (resumo)

- Uso de recursos depende do número de clientes conectados e do número de
  mensagens recebidas/enviadas por segundo. Uso de memória deve escalar
  linearmente com o número de clientes conectados.
- **Otimização**: por padrão o Socket.IO guarda referência à requisição
  HTTP inicial de cada sessão. Dá pra descartar pra economizar memória:

  ```javascript
  io.engine.on("connection", (rawSocket) => {
    rawSocket.request = null;
  });
  ```

  Útil quando a requisição HTTP não é necessária depois (ex.: não usamos
  `express-session` integrado ao socket).
- A doc compara uso de memória entre implementações de WebSocket server
  (`ws` — o default, `eiows`, `µWebSockets.js`) de 0 a 10.000 clientes —
  **gráficos não capturados aqui**, buscar na página se for decidir trocar
  o `wsEngine`.
- GC é automático, sem necessidade de forçar coleta manual.

## Relevante pro nosso caso (IPPA)

- Backend roda em `shared-cpu-1x/512mb` no Fly — vale aplicar o
  `rawSocket.request = null` se o volume de sockets crescer, já que hoje
  não usamos a requisição HTTP inicial pra nada depois do handshake (auth
  é via ticket, não via sessão HTTP anexada ao socket).
- Não há indicação de que valha trocar `ws` por `eiows`/`µWebSockets.js`
  no nosso volume atual (poucos sockets por tenant) — mudança de
  dependência nativa (C++) não compensa a complexidade pro MVP.
