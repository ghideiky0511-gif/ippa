#!/usr/bin/env node
// Copia backend/src/contracts/*.ts (fonte única) pra frontend/src/contracts/*.ts.
// Docker builda backend/ e frontend/ como contextos separados (ver
// docker-compose.yml), então não dá pra importar um pacote compartilhado
// direto de fora de cada pasta — este script mantém as duas cópias em
// sincronia. Rode `node scripts/sync-contracts.mjs` depois de editar
// qualquer arquivo em backend/src/contracts/. Use `--check` (sem gravar)
// pra confirmar que as cópias não ficaram desatualizadas.
import {
    readdirSync,
    readFileSync,
    writeFileSync,
    mkdirSync,
    existsSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceDir = join(rootDir, "backend", "src", "contracts");
const targetDir = join(rootDir, "frontend", "src", "contracts");
const checkOnly = process.argv.includes("--check");

const HEADER = `// GERADO a partir de backend/src/contracts — não editar à mão.
// Rode \`node scripts/sync-contracts.mjs\` (ou \`npm run sync-contracts\` no
// backend) depois de mudar o arquivo de origem.
`;

const files = readdirSync(sourceDir).filter((name) => name.endsWith(".ts"));
if (files.length === 0) {
    console.error(`Nenhum arquivo .ts encontrado em ${sourceDir}`);
    process.exit(1);
}

let stale = false;

if (!checkOnly && !existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
}

for (const name of files) {
    const source = readFileSync(join(sourceDir, name), "utf8");
    const generated = HEADER + source;
    const targetPath = join(targetDir, name);
    const current = existsSync(targetPath)
        ? readFileSync(targetPath, "utf8")
        : null;

    if (current === generated) continue;

    if (checkOnly) {
        console.error(`Desatualizado: frontend/src/contracts/${name}`);
        stale = true;
        continue;
    }

    writeFileSync(targetPath, generated, "utf8");
    console.log(`Gerado: frontend/src/contracts/${name}`);
}

if (checkOnly && stale) {
    console.error("\nRode `node scripts/sync-contracts.mjs` pra atualizar.");
    process.exit(1);
}
