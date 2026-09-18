---
tags: [socket.io, websocket, backend, frontend, referencia]
created: 2026-09-18
status: parcial
---

# Documentação Socket.IO v4 — status de cada arquivo

Buscado via WebFetch (modelo pequeno, processa a página e responde a um
prompt — não é um download verbatim como `documents/knowledge/ws/doc/ws.md`).
Pra várias páginas o WebFetch recusou reproduzir o conteúdo inteiro por
direitos autorais e devolveu resumo/extração em vez do texto completo.

**Antes de confiar em qualquer arquivo aqui pra decidir uma opção de
config ou assinatura de API, confira o status abaixo.** Onde está
"incompleto", a fonte primária (URL) é mais confiável que este arquivo.

| Arquivo | Status | O que falta |
| --- | --- | --- |
| `server-options.md` | **Incompleto** (lista extraída, não o texto da página) | Prosa/exemplos de cada opção; recusa de reprodução verbatim por copyright |
| `server-api.md` | **Incompleto** (só enum de `disconnect reason` + semântica de `close()`) | Referência completa das classes `Server`/`Namespace`/`Socket` (métodos, eventos, propriedades) |
| `client-api.md` | Razoavelmente completo | Pode faltar algum detalhe fino — conferir se precisar de algo muito específico |
| `client-options.md` | Razoavelmente completo | — |
| `memory-usage.md` | **Resumo raso** | A página tem benchmarks/gráficos comparando `ws`/`eiows`/`µWebSockets.js` — não capturados aqui |
| `namespaces.md` | Resumo | Exemplos de código de namespace dinâmico não capturados |
| `rooms.md` | Resumo | Exemplos de código (`socket.join`, `io.to(...).emit(...)`) não capturados |
| `troubleshooting.md` | Resumo, mas com conteúdo específico útil (nginx `proxy_read_timeout`, etc.) | Comandos/config completos de exemplo |
| `logging-and-debugging.md` | Razoavelmente completo | — |
| `redis-adapter.md` | Resumo, mas cobre o essencial pra decisão já tomada (Redis adapter, não Postgres, não agora) | Exemplos de código de setup (`createAdapter`, etc.) |
| `typescript.md` | **Completo** (generics do server/client/namespace + todos os exemplos de código) | — |
| `protocol-v4.md` | **Completo** (verbatim, via GitHub API — não passou pelo WebFetch, sem recusa de copyright; doc MIT) | — |

## Prioridade se for buscar manualmente

1. `server-api.md` — falta a referência de métodos/eventos que a auditoria vai precisar pra citar API certa.
2. `server-options.md` — a lista de opções já está boa (nomes + default), mas os exemplos de código ajudam a aplicar certo.

## Ver também

- `documents/knowledge/realtime-sockets.md` — arquitetura atual do realtime na IPPA.
- `documents/knowledge/ws/doc/ws.md` — API da lib `ws` (camada abaixo do engine.io; só relevante pro ponto de backpressure/`bufferedAmount`, que o Socket.IO não expõe).
- `protocol-v4.md` — spec de baixo nível do protocolo Socket.IO/Engine.IO (formato de pacote, encoding, handshake) — apoio pra depuração de frame/pacote, não referência primária pra nenhum fix pendente.
