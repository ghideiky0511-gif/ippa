---
source: https://socket.io/docs/v4/rooms/
fetched: 2026-09-18
status: resumo (exemplos de código da página não capturados)
---

# Rooms (resumo)

- Room = canal arbitrário que sockets entram/saem, usado pra broadcast a
  um subconjunto de clientes. É um conceito só de servidor — o cliente
  não tem acesso à própria lista de rooms.
- `socket.join("some room")` / `socket.leave("some room")`.
- Broadcast: `io.to("some room").emit(...)` (ou `.except(...)` pra
  excluir uma room). Encadear `.to("room1").to("room2")` faz união — cada
  socket recebe o evento uma vez só, mesmo em ambas as rooms.
- `socket.to("room").emit(...)` — envia pra todo mundo na room **exceto**
  o remetente.
- Implementação interna: um **Adapter** mantém dois `Map`s — `sids`
  (socket id → rooms) e `rooms` (nome da room → socket ids). A doc avisa
  pra não mexer nesses Maps diretamente, sempre usar os métodos do
  socket/servidor.
- Desconexão sai de todas as rooms automaticamente.
- Desde socket.io@3.1.0 o adapter emite eventos: `create-room`,
  `delete-room`, `join-room`, `leave-room`.
- Pra multi-servidor, o Redis Adapter estende rooms através de instâncias
  distribuídas (ver `redis-adapter.md`).

## Relevante pro nosso caso (IPPA)

- `pedidosNamespace.ts` usa `session:{sessionId}` como room — padrão
  exatamente como documentado.
- `updatesNamespace.ts` usa múltiplas rooms por socket
  (`updates:user:...`, `updates:seller:...`, `updates:client:...`,
  `updates:tenant:...`) — union de rooms é suportado nativamente
  (`io.to(room1).to(room2).emit(...)`), então broadcast pra múltiplos
  papéis ao mesmo tempo (ex.: evento que interessa a vendedora E admin)
  pode usar isso em vez de emitir separado pra cada room, se for o caso —
  vale conferir `updateBroadcast.ts` se já faz assim.
- Os eventos `create-room`/`join-room`/etc. do adapter poderiam ser usados
  pra logging/observabilidade de rooms sem instrumentar cada handler
  manualmente — não implementado hoje.
