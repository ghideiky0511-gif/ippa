import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

/** Supabase assina o pooler com uma CA própria, fora do bundle padrão do Node. */
export function sslConfig() {
    if (process.env.DATABASE_SSL !== "true") return undefined;
    const ca = readFileSync(
        path.join(
            currentDirectory,
            "..",
            "db",
            "certs",
            "supabase-root-2021-ca.crt",
        ),
        "utf8",
    );
    return { ca, rejectUnauthorized: true };
}
