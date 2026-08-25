# Camada de serviços

O fluxo do backend é `route -> service -> model`.

- `routes` traduzem HTTP: request, response, cookies e status codes.
- `services/<domínio>` validam entrada, aplicam permissões, defaults, regras de negócio, composição e transações.
- `models` executam somente operações de persistência e devolvem registros do banco.
- O `index.ts` de cada domínio expõe a API pública usada pelas routes ou por outros services.

Domínios atuais: `ai`, `audit`, `auth`, `catalog`, `clients`, `commercialGroups`,
`companies`, `erp`, `home`, `notifications`, `orders`, `platform`,
`recommendations`, `settings` e `users`.

Integrações técnicas reutilizáveis, como o transporte de e-mail e o hub Socket.IO,
permanecem em `lib`; a decisão de quando acioná-las pertence aos services.

Ao crescer um domínio, crie serviços específicos dentro da pasta da entidade,
como `clients/clientCartService.ts`, em vez de concentrar operações em um
service global.
