<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Banco de dados

- Não edite `db/stage/stage.sql`. Esse snapshot é mantido manualmente pelo usuário.
- Para alterações de schema, crie ou ajuste apenas migrations em `db/migrations/` e informe ao usuário o que precisa ser refletido em `db/stage/stage.sql`.
