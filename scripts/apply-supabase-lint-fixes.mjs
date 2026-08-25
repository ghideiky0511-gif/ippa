#!/usr/bin/env node
// Roda todas as migrations pendentes em backend/db/migrations, em ordem,
// incluindo a 032_supabase_lint_fixes.sql (fixes dos warnings do Supabase
// database linter: search_path mutável nas funções app_tenant_id/app_user_id/
// app_role e EXECUTE público em rls_auto_enable). Mesma lógica de
// backend/scripts/migrate.mjs, mas aceitando os parâmetros de banco por CLI.
//
// Uso:
//   node scripts/apply-supabase-lint-fixes.mjs --host <host> --port <port> \
//     --database <db> --user <user> --password <senha> [--ssl] [--yes]
//
// ou via connection string:
//   node scripts/apply-supabase-lint-fixes.mjs --connection-string "postgresql://user:pass@host:5432/db" [--ssl] [--yes]
//
// Também aceita DATABASE_URL / MIGRATIONS_DATABASE_URL no ambiente como
// fallback caso nenhum parâmetro seja passado.

import { createRequire } from "node:module";
import { readdir, readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const backendDir = join(rootDir, "backend");
const migrationsDir = join(backendDir, "db", "migrations");

// 'pg' está instalado em backend/node_modules; resolvemos a partir de lá.
const require = createRequire(pathToFileURL(join(backendDir, "package.json")));
const { Client } = require("pg");
const { sslConfig } = await import(
    pathToFileURL(join(backendDir, "scripts", "pgSsl.mjs"))
);

function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i++) {
        const token = argv[i];
        if (!token.startsWith("--")) continue;
        const key = token.slice(2);
        if (key === "ssl" || key === "yes") {
            args[key] = true;
            continue;
        }
        args[key] = argv[i + 1];
        i++;
    }
    return args;
}

function buildConnectionString(args) {
    if (args["connection-string"]) return args["connection-string"];

    const envUrl = process.env.MIGRATIONS_DATABASE_URL || process.env.DATABASE_URL;
    const hasDbParams = args.host || args.database || args.user;
    if (!hasDbParams && envUrl) return envUrl;

    const { host, port = "5432", database, user, password } = args;
    if (!host || !database || !user) {
        console.error(
            "Parâmetros de banco insuficientes.\n\n" +
                "Use --host --port --database --user --password, ou --connection-string,\n" +
                "ou defina MIGRATIONS_DATABASE_URL / DATABASE_URL no ambiente.\n",
        );
        process.exit(1);
    }
    const auth = password ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}` : encodeURIComponent(user);
    return `postgresql://${auth}@${host}:${port}/${database}`;
}

function describeConnection(connectionString) {
    try {
        const url = new URL(connectionString);
        return `${url.username}@${url.hostname}:${url.port || "5432"}${url.pathname}`;
    } catch {
        return "(connection string informada)";
    }
}

const args = parseArgs(process.argv.slice(2));
const connectionString = buildConnectionString(args);
const ssl = args.ssl || process.env.DATABASE_SSL === "true" ? sslConfig() ?? { rejectUnauthorized: true } : undefined;

const client = new Client({ connectionString, application_name: "ippa-migrations", ssl });
await client.connect();

try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [649901]);
    await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
    const applied = new Set(
        (await client.query("SELECT name FROM schema_migrations")).rows.map((row) => row.name),
    );
    const files = (await readdir(migrationsDir))
        .filter((file) => file.endsWith(".sql"))
        .sort();
    const pending = files.filter((file) => !applied.has(file));

    console.log(`Alvo: ${describeConnection(connectionString)}`);
    if (pending.length === 0) {
        console.log("Nenhuma migration pendente.");
        await client.query("ROLLBACK");
    } else {
        console.log(`Migrations pendentes (${pending.length}):`);
        for (const file of pending) console.log(`  - ${file}`);

        if (!args.yes) {
            const rl = createInterface({ input: process.stdin, output: process.stdout });
            const answer = await rl.question("Confirma a aplicação destas migrations neste banco? (yes/no) ");
            rl.close();
            if (answer.trim().toLowerCase() !== "yes") {
                console.log("Cancelado.");
                await client.query("ROLLBACK");
                process.exit(0);
            }
        }

        for (const file of pending) {
            const sql = await readFile(join(migrationsDir, file), "utf8");
            await client.query(sql);
            await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
            console.log(`Applied ${file}`);
        }
        await client.query("COMMIT");
        console.log("Todas as migrations pendentes foram aplicadas.");
    }
} catch (error) {
    await client.query("ROLLBACK");
    console.error("Falha ao aplicar migrations:", error.message);
    process.exitCode = 1;
} finally {
    await client.end();
}
