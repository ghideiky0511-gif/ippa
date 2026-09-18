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

- **Decisão já tomada** (ver `documents/knowledge/realtime-sockets.md` e
  discussão no chat): Redis adapter, não Postgres adapter — Supabase free
  tier usa pooler em modo transaction (Supavisor/PgBouncer), que não
  suporta `LISTEN`/`NOTIFY` (exigido pelo Postgres adapter) sem conexão
  de sessão dedicada, disputando o mesmo recurso escasso que já causou o
  incidente de pool exhaustion. Redis (`ioredis`, protocolo padrão) não
  tem essa restrição.
- **Não implementar agora**: hoje 1 Machine só
  (`min_machines_running=1`), adapter em memória padrão já resolve.
  Ligar o Redis adapter agora só adicionaria custo por comando
  (Upstash pay-as-you-go, `$0.20/100k`) sem benefício. Gatilho: decisão
  de rodar 2+ Machines.
- **Aviso de sticky session** é irrelevante pro Fly enquanto for 1
  Machine só — mas se escalar horizontal, precisa garantir sticky
  session no proxy do Fly além de ligar o adapter (o adapter sincroniza
  broadcast entre servidores, não substitui sticky session pro handshake
  inicial).
- Redis adapter **não resolve** o rate limiter em memória nem o Map de
  tickets do `/atualizacoes` (ambos por-processo, fora do escopo do
  adapter) — ponto já registrado como limitação conhecida separada.
