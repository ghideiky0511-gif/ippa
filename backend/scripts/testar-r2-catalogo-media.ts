// Testa a integração com o bucket R2 de mídia do catálogo (credenciais,
// upload, presigned URL, download e delete).
// Uso: cd backend && npm run test:r2-catalog-media
// Pede o caminho de um arquivo local (imagem ou vídeo) via input() e faz
// upload/download/delete de teste no bucket real.

import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import { createInterface } from "node:readline/promises";

import * as r2CatalogMediaClient from "../src/lib/storage/r2CatalogMediaClient";

const TEST_OBJECT_PATH_PREFIX = "_teste-manual";

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
};

function contentTypeFor(fileName: string): string {
  return CONTENT_TYPES[extname(fileName).toLowerCase()] ?? "application/octet-stream";
}

function mask(value: string): string {
  return value ? `${value.slice(0, 4)}... (oculto)` : "";
}

async function main(): Promise<void> {
  console.log("Config lida:");
  console.log(`  R2_ACCOUNT_ID           = ${process.env.R2_ACCOUNT_ID ?? ""}`);
  console.log(`  R2_BUCKET_CATALOG_MEDIA = ${process.env.R2_BUCKET_CATALOG_MEDIA ?? ""}`);
  console.log(`  R2_ACCESS_KEY_ID        = ${mask(process.env.R2_ACCESS_KEY_ID ?? "")}`);
  console.log();

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const caminho = (await rl.question("Caminho completo do arquivo local para testar upload (imagem ou vídeo): "))
    .trim()
    .replace(/^"|"$/g, "");

  const info = await stat(caminho).catch(() => null);
  if (!info || !info.isFile()) {
    console.log(`ERRO: arquivo não encontrado: ${caminho}`);
    rl.close();
    process.exit(1);
  }

  const fileName = basename(caminho);
  const media = r2CatalogMediaClient.forObject(`${TEST_OBJECT_PATH_PREFIX}/${fileName}`);
  const contentType = contentTypeFor(fileName);

  const originalBytes = await readFile(caminho);
  const originalHash = createHash("sha256").update(originalBytes).digest("hex");
  console.log(`\nArquivo lido: ${originalBytes.length.toLocaleString("pt-BR")} bytes, sha256=${originalHash.slice(0, 16)}...`);

  console.log(`\n1) Upload -> key=${JSON.stringify(media.key)}`);
  await media.uploadObject(originalBytes, contentType);
  console.log("   OK");

  console.log("\n2) Gerar URL assinada (TTL 5 min)");
  const url = await media.generatePresignedUrl(300);
  console.log(`   ${url}`);
  console.log("   Abra essa URL no navegador para confirmar que a mídia carrega.");

  console.log("\n3) Download via getObjectBytes");
  const downloaded = await media.getObjectBytes();
  if (downloaded === null) {
    console.log("   ERRO: objeto não encontrado logo após upload");
    rl.close();
    process.exit(1);
  }
  const downloadedHash = createHash("sha256").update(downloaded).digest("hex");
  console.log(`   ${downloaded.length.toLocaleString("pt-BR")} bytes, sha256=${downloadedHash.slice(0, 16)}...`);
  console.log(downloadedHash === originalHash ? "   Hash confere!" : "   ERRO: hash diferente do original!");

  const resposta = (await rl.question("\n4) Apagar o objeto de teste do bucket agora? [S/n] ")).trim().toLowerCase();
  if (resposta === "" || ["s", "sim", "y", "yes"].includes(resposta)) {
    await media.deleteObject();
    const aindaExiste = await media.getObjectBytes();
    console.log(
      aindaExiste === null
        ? "   Apagado e confirmado (getObjectBytes retornou null)."
        : "   ERRO: objeto ainda existe após deleteObject",
    );
  } else {
    console.log(`   Mantido no bucket em: ${media.key}`);
  }

  console.log("\nTeste concluído.");
  rl.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
