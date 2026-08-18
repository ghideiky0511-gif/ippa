# Camada de serviços

O fluxo do backend é `route -> service -> model`.

- `routes` traduzem HTTP (request, response, cookies e status codes).
- `services/<domínio>` validam entrada, aplicam permissões, defaults, regras de negócio, composição e transações.
- `models` executam operações de persistência e devolvem registros do banco; não aplicam regras de negócio.
- `index.ts` de cada domínio expõe somente a API pública usada pelas routes ou por outros services.

Ao crescer um domínio, crie serviços específicos dentro da pasta da entidade, como `clients/clientCartService.ts`, em vez de concentrar operações em um service global.
