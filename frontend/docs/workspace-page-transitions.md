# Transicoes de pagina do workspace

As paginas sob `/workspace` nao declaram IDs manualmente. O
`WorkspaceShell` deriva a identidade da rota relativa ao tenant e envolve o
conteudo com `WorkspacePageTransition`.

Esse contrato garante que:

- a mesma pagina tem o mesmo ID em tenants diferentes;
- rotas dinamicas, como `/workspace/pedidos/[id]`, recebem IDs distintos por
  registro;
- query strings nao disparam uma troca de pagina;
- rotas futuras sob o layout de `/workspace` participam automaticamente;
- a codificacao reversivel do pathname nao sofre colisoes de `slugify`.

O ID canonico fica exposto em `id` e `data-workspace-page-id`; o pathname
normalizado fica em `data-workspace-pathname`. A mesma identidade e usada como
`key` do Motion, portanto nao crie wrappers de transicao ou IDs paralelos nos
arquivos `page.tsx`.

A animacao respeita `prefers-reduced-motion` por meio de `useReducedMotion`.
