---
source: https://socket.io/docs/v4/namespaces/
fetched: 2026-09-18
status: resumo (exemplos de código da página não capturados)
---

# Namespaces (resumo)

- Namespaces permitem "multiplexar" — dividir a lógica da aplicação num
  único socket físico compartilhado, com canais distintos.
- Cada namespace tem seus próprios: event handlers, rooms (isoladas por
  namespace) e middlewares.
- Casos de uso principais: controle de acesso (namespace restrito) e
  multi-tenancy (namespace por tenant, gerado dinamicamente).
- Namespace principal `"/"` é acessado direto via `io` — `io.on(...)` é
  equivalente a `io.of("/").on(...)`. Alias `io.sockets` também aponta
  pra ele.
- Namespace customizado: servidor `io.of("/my-namespace")`, cliente
  `io("/my-namespace")` (mesma origem) ou
  `io("https://example.com/my-namespace")` (cross-origin). Múltiplas
  conexões ao mesmo namespace desabilitam multiplexação.
- **Namespaces dinâmicos**: suportam regex (`/^\/dynamic-\d+$/`) ou
  função de validação. Função é recomendada pra casos sensíveis
  (identidade/permissão de usuário). Namespace existente tem prioridade
  sobre padrão dinâmico.
- `cleanupEmptyChildNamespaces` (v4.6.0+) remove namespaces filhos vazios
  automaticamente, evitando acúmulo de memória.

## Relevante pro nosso caso (IPPA)

- Já usamos dois namespaces fixos (`/pedidos`, `/atualizacoes`) — não
  dinâmicos por tenant. Isolamento de tenant é feito por **room**
  (`updates:tenant:{tenantId}`, `session:{sessionId}`), não por namespace.
  Isso está de acordo com o padrão recomendado (namespace pra
  controle de acesso amplo, room pra granularidade fina) — não é um erro
  de design.
- `cleanupEmptyChildNamespaces` não se aplica (não usamos namespaces
  dinâmicos).
