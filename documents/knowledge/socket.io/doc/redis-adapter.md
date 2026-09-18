---
source: https://socket.io/docs/v4/redis-adapter/
fetched: 2026-09-18
status: resumo (exemplos de código de setup não capturados)
---

# Redis Adapter (resumo)

## Como funciona

Permite que servidores Socket.IO em cluster se comuniquem via Redis
Pub/Sub — todo pacote enviado a múltiplos clientes é entregue localmente
E publicado num canal Redis, pros outros servidores do cluster
receberem e repassarem aos seus próprios clientes conectados.

## Segurança

> "Redis adapter assumes that Redis is part of the trusted internal
> infrastructure."

- Mensagens não são assinadas, criptografadas nem autenticadas.
- Acesso não autorizado ao Redis permite injeção de pacote / spoofing de
  evento.
- Recomendado: ACLs do Redis, TLS, autenticação, rede privada. Não
  compartilhar a instância com aplicações não confiáveis.

## Suporte por versão

| Feature | Suportado | Desde |
| --- | --- | --- |
| Gerenciamento de sockets | Sim | 6.1.0+ |
| Comunicação entre servidores | Sim | 7.0.0+ |
| Broadcast com acks | Sim | 7.2.0+ |
| Connection state recovery | Não | — |

## Instalação

```bash
npm install @socket.io/redis-adapter
```

Compatível com `redis`, `ioredis`, Redis Cluster, Sharded Pub/Sub (Redis 7+).

## Opções de config

- Adapter padrão: `key` (prefixo do canal, default `"socket.io"`),
  `requestsTimeout` (default 5000ms), `publishOnSpecificResponseChannel`.
- Adapter com sharding: `channelPrefix`, `subscriptionMode`
  (`"static"`/`"dynamic"`/`"dynamic-private"`).

## Perguntas frequentes (da própria doc)

- **Persiste dado no Redis?** Não — só forwarding via Pub/Sub.
- **Ainda precisa de sticky session?** Sim — sem isso, erro HTTP 400.
- **Redis cai, o que acontece?** Pacotes só chegam aos clientes
  conectados localmente naquele servidor (degrada, não derruba tudo).

## Migração e ferramentas

- Pacote migrou de `socket.io-redis` pra `@socket.io/redis-adapter`.
- Existe um "Redis emitter" separado pra emitir eventos a partir de
  processos Node externos (fora do servidor Socket.IO) — disponível
  também em Java, Python, PHP, Go, Perl, Rust.

## Relevante pro nosso caso (IPPA)

- **Redis adapter, não Postgres adapter** — Supabase free tier usa pooler
  em modo transaction (Supavisor/PgBouncer), que não suporta
  `LISTEN`/`NOTIFY` (exigido pelo Postgres adapter) sem conexão de sessão
  dedicada, disputando o mesmo recurso escasso que já causou o incidente
  de pool exhaustion. Redis (`ioredis`, protocolo padrão) não tem essa
  restrição.
- **Implementado** quando o backend passou a rodar 2 Machines (o gatilho
  registrado antes aqui): `backend/src/realtime/redisAdapter.ts`, ligado
  por `REDIS_URL`. Detalhes de operação em
  `documents/knowledge/realtime-sockets.md`, seção "Mais de uma Machine".
- **Sticky session: não precisa aqui.** O "Sim" da FAQ acima vale pro
  handshake em HTTP long-polling, que são várias requisições. Os dois
  clientes do frontend conectam com `transports: ['websocket']`, então o
  handshake é uma requisição só, que já vira a conexão persistente. Se
  alguém tirar esse `transports`, volta a precisar.
- **"Redis cai → só entrega local"** só vale se as Promises do ioredis
  forem tratadas: o adapter chama `publish`/`subscribe` sem `await` nem
  `catch`, e uma rejeição sem tratamento derruba o processo Node. O
  wrapper `catchRejections` em `redisAdapter.ts` existe por isso.
- O adapter **não resolve** estado por processo fora do Socket.IO. Cada
  caso foi tratado à parte: tickets de `/atualizacoes` foram pra Postgres
  (migration 073), o rate limiter conta no Redis, e o cache de tenant é
  invalidado entre Machines por `serverSideEmit` (o recurso de
  "comunicação entre servidores" da tabela acima).
- Custo: Upstash pay-as-you-go (`$0.20/100k` comandos) — cada broadcast é
  um `PUBLISH`, cada `fetchSockets()` um `PUBSUB NUMSUB` + `PUBLISH` +
  respostas.
