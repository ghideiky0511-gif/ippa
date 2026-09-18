# Redis no Fly.io

O backend usa Redis só como cache best-effort (ver `src/lib/redis.ts` — qualquer
falha de conexão/timeout vira "sem cache", nunca derruba a request). Isso
significa que a instância pode ficar na mesma organização/região do app do
backend sem risco de acoplamento forte.

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
4. **Réplicas de leitura** — não precisa pro nosso caso (é só cache); pode
   pular.
5. **Plano de eviction** — "noeviction" é o padrão; como é cache, tanto faz,
   mas "allkeys-lru" evita a instância encher e recusar escrita se um dia
   passar do limite do plano gratuito/plano contratado.

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

Deve aparecer o log `Conexão Redis estabelecida.` (de `src/lib/redis.ts`) sem
erros de timeout repetidos.

## Custo

Cobrança por requisição (pay-as-you-go), agregada na fatura mensal do Fly.
Para o volume de cache deste backend (só `stockCacheService`), o custo
esperado é baixo — vale checar `fly redis status` após alguns dias de uso
real para confirmar antes de considerar um plano fixo.
