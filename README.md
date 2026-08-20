# Catálogo IPPA/Bippa

Aplicação de catálogo e pedidos com duas experiências no mesmo frontend, dentro do
tenant (`http://localhost:3010/{tenant}/`):

- loja e fluxo do cliente em `http://localhost:3010/{tenant}/`;
- workspace interno da equipe do tenant em `http://localhost:3010/{tenant}/workspace`.

As regras, autenticação, dados e endpoints ficam em um backend separado, disponível em `http://localhost:3011/api`. O frontend encaminha chamadas `/api/*` para esse serviço, mantendo cookies e navegador na mesma origem.

## Estrutura

```text
frontend/
  src/app/              loja e rotas /workspace
  src/workspace/        componentes e clientes do workspace interno
  src/components/       componentes da loja
  Dockerfile

backend/
  src/app/api/          Route Handlers da API
  src/lib/              regras de negócio e persistência
  src/data/             dados JSON do MVP
  Dockerfile

docker-compose.yml
```

O `frontend` é um único projeto Next.js. O painel que antes ficava em `admin/` foi incorporado sob `/admin` e depois reorganizado como o workspace interno do tenant, em `/{tenant}/workspace` (rotas antigas em `/{tenant}/admin` continuam funcionando via redirect). O antigo `web/` foi dividido: a interface foi para `frontend/`, enquanto APIs e dados foram para `backend/`.

## Executar com Docker

Opcionalmente, copie `.env.example` para `.env` e preencha as integrações externas. Depois execute:

```bash
docker compose up --build
```

Endereços:

- loja: `http://localhost:3010/{tenant}`;
- workspace interno: `http://localhost:3010/{tenant}/workspace`;
- control plane: `http://localhost:3010/control`;
- API: `http://localhost:3011/api/{tenant}/catalog`.

## Control plane

O acesso de plataforma fica em `/control`, fora de qualquer tenant. Em um ambiente novo,
o bootstrap não cria dados fictícios. Para criar o primeiro acesso, configure
`PLATFORM_ADMIN_EMAIL`, `PLATFORM_ADMIN_NAME` e `PLATFORM_ADMIN_PASSWORD`; para
criar também um tenant inicial, configure todos os quatro valores `INITIAL_*`.

O control plane cria tenants com administrador inicial e depósito padrão, além de permitir
ativar, inativar e arquivar tenants. Altere as senhas de exemplo antes de usar qualquer
ambiente compartilhado ou de produção.

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

Consulte [.env.example](.env.example). As integrações com OpenAI e Resend só são necessárias para os recursos que as utilizam; catálogo, loja e workspace funcionam sem essas chaves.

## Verificação

Em cada serviço estão disponíveis:

```bash
npm run build
npm run lint
```

O roadmap funcional continua em [PLANO-PROXIMOS-PASSOS.md](PLANO-PROXIMOS-PASSOS.md).
