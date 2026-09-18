# Redis no Fly.io

O backend usa Redis em três papéis, todos degradáveis — nenhum derruba uma
request ou o processo quando o Redis some:

- **Cache de estoque** e **contagem do rate limiter** (`src/lib/redis.ts` —
  qualquer falha de conexão/timeout vira "sem cache"; o rate limiter volta a
  contar por Machine).
- **Adapter do Socket.IO** (`src/realtime/redisAdapter.ts`, conexões
  próprias): é o que faz um broadcast emitido numa Machine chegar aos sockets
  conectados nas outras. Com o Redis fora, cada Machine só entrega aos
  próprios sockets.

Com mais de uma Machine do backend, `REDIS_URL` deixa de ser opcional na
prática: sem ele o realtime fica partido entre as Machines.

O Fly.io não tem mais um "Redis self-hosted" oficial: o caminho atual é
`fly redis create`, que provisiona uma instância gerenciada (Upstash) dentro
da sua organização Fly, com rede privada (`.internal`) e cobrança por
requisição agregada na fatura do Fly.

## Pré-requisitos

- `flyctl` instalado (`winget install -e --id Fly-io.flyctl` no Windows, ou
  `curl -L https://fly.io/install.sh | sh` no Linux/macOS/WSL)
- Login feito: `fly auth login` (abre o navegador)
- App(s) do backend/frontend já criados na organização Fly (rodar isso depois
  que o `fly launch`/`fly apps create` do backend existir, pra usar a mesma
  organização e região)

## Criar o Redis

```bash
fly redis create
```

O comando pergunta:

1. **Organização** — escolha a mesma organização do app do backend (é o que
   garante que a rede privada `.internal` enxergue os dois).
2. **Nome** — sugestão: `ippa-redis` (vira parte do hostname:
   `fly-ippa-redis.upstash.io`).
3. **Região primária** — use a mesma região do app `ippa-backend` (menor
   latência; ex.: `gru` para São Paulo).
4. **Réplicas de leitura** — não precisa pro nosso caso; pode pular.
5. **Plano de eviction** — "allkeys-lru" evita a instância encher e recusar
   escrita se um dia passar do limite do plano. Tudo que fica em chave aqui
   pode ser descartado (cache, e contadores do rate limiter — perder um só
   zera aquela janela); o pub/sub do adapter não guarda chave nenhuma.

Ao final, o comando imprime a `REDIS_URL` (formato
`redis://default:<senha>@fly-ippa-redis.upstash.io`). **Copie esse valor.**

## Conectar o backend

Definir o secret no app do backend (não commitar a URL em lugar nenhum):

```bash
fly secrets set REDIS_URL="redis://default:<senha>@fly-ippa-redis.upstash.io" -a ippa-backend
```

Isso reinicia o app do backend automaticamente com a variável nova.

## Conferir depois do deploy

```bash
fly redis status ippa-redis
fly logs -a ippa-backend | grep redis
```

Devem aparecer, sem erros repetidos:

- `> Socket.IO com adapter Redis (broadcast entre Machines).` no boot (de
  `server.ts`) — se aparecer "adapter em memória", o `REDIS_URL` não chegou
  no processo;
- `[realtime-cluster] Adapter Redis conectado (pub).` e `(sub).` (de
  `src/realtime/redisAdapter.ts`);
- `Conexão Redis estabelecida.` (de `src/lib/redis.ts`) na primeira
  requisição que usa cache ou rate limit.

## Custo

Cobrança por requisição (pay-as-you-go), agregada na fatura mensal do Fly.
Além do cache, agora entram na conta: um comando por requisição de rota com
rate limit (login, tickets de realtime, `sessions/mine`...), um `PUBLISH` por
broadcast do Socket.IO e alguns comandos por consulta de presença. Vale
checar `fly redis status` após alguns dias de uso real para confirmar antes
de considerar um plano fixo.
