# Catálogo IPPA/Bippa

Aplicação de catálogo e pedidos com duas experiências no mesmo frontend:

- loja e fluxo do usuário em `http://localhost:3010/`;
- painel administrativo em `http://localhost:3010/admin`.

As regras, autenticação, dados e endpoints ficam em um backend separado, disponível em `http://localhost:3011/api`. O frontend encaminha chamadas `/api/*` para esse serviço, mantendo cookies e navegador na mesma origem.

## Estrutura

```text
frontend/
  src/app/              loja e rotas /admin
  src/admin/            componentes e clientes do painel
  src/components/       componentes da loja
  Dockerfile

backend/
  src/app/api/          Route Handlers da API
  src/lib/              regras de negócio e persistência
  src/data/             dados JSON do MVP
  Dockerfile

docker-compose.yml
```

O `frontend` é um único projeto Next.js. O painel que antes ficava em `admin/` foi incorporado sob `/admin`. O antigo `web/` foi dividido: a interface foi para `frontend/`, enquanto APIs e dados foram para `backend/`.

## Executar com Docker

Opcionalmente, copie `.env.example` para `.env` e preencha as integrações externas. Depois execute:

```bash
docker compose up --build
```

Endereços:

- loja: `http://localhost:3010`;
- admin: `http://localhost:3010/admin`;
- API: `http://localhost:3011/api/catalog`.

O volume `backend-data` mantém os JSONs alterados em runtime entre recriações dos containers. Para encerrar os serviços sem apagar os dados:

```bash
docker compose down
```

Para também apagar o volume persistente e recomeçar com os dados da imagem:

```bash
docker compose down --volumes
```

## Executar sem Docker

Use dois terminais:

```bash
cd backend
npm ci
npm run dev
```

```bash
cd frontend
npm ci
npm run dev
```

Os valores padrão usam frontend na porta `3010` e backend na `3011`. Para outros endereços, configure `BACKEND_INTERNAL_URL` no frontend e `ADMIN_ORIGIN` no backend.

## Variáveis opcionais

Consulte [.env.example](.env.example). As integrações com OpenAI e Resend só são necessárias para os recursos que as utilizam; catálogo, loja e painel funcionam sem essas chaves.

## Verificação

Em cada serviço estão disponíveis:

```bash
npm run build
npm run lint
```

O roadmap funcional continua em [PLANO-PROXIMOS-PASSOS.md](PLANO-PROXIMOS-PASSOS.md).
