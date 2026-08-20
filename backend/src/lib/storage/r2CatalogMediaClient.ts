import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Bucket R2 (S3-compatível) com as fotos e vídeos do catálogo de produtos.
// Porte do cliente Python equivalente (r2_storage_client.py) usado para o
// bucket de comprovantes de outro serviço — mesma API (upload, presigned
// URL, download, delete), agora apontando para R2_BUCKET_CATALOG_MEDIA.

let clientSingleton: S3Client | undefined;

const PRESIGNED_CACHE_MAX_ENTRIES = 5000;
const PRESIGNED_URL_MAX_TTL_SECONDS = 7 * 24 * 60 * 60;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const presignedCache = new Map<string, { url: string; expiresAt: number }>();

export interface CatalogMediaClient {
  uploadObject(data: Buffer | Uint8Array, contentType: string, cacheControl?: string): Promise<void>;
  objectExists(): Promise<boolean>;
  deleteObject(): Promise<void>;
  getObjectBytes(): Promise<Buffer | null>;
  generatePresignedUrl(ttlSeconds: number): Promise<string>;
  key: string;
}

export interface ProductCatalogMediaPath {
  /** UUID único do arquivo de mídia. */
  mediaId: string;
  /** Referência exibida pelo ERP/terceiro. */
  referenceId: string;
  /** Extensão sem ponto, por exemplo: jpg, webp ou mp4. */
  extension: string;
  /** Sufixo da versão do arquivo; `og` (original otimizado) por padrão. */
  variant?: string;
}

function requiredEnv(name: string): string {
  const value = (process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} não está configurada.`);
  return value;
}

function client(): S3Client {
  if (!clientSingleton) {
    const accountId = requiredEnv("R2_ACCOUNT_ID");
    clientSingleton = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
        secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
      },
      // O endpoint de R2 recebe o bucket no caminho. Sem isto o SDK pode
      // tentar o formato virtual-hosted (bucket.<account>.r2...), que não é
      // o endpoint assinado esperado pelo R2.
      forcePathStyle: true,
    });
  }
  return clientSingleton;
}

function bucket(): string {
  return requiredEnv("R2_BUCKET_CATALOG_MEDIA");
}

/**
 * Chave canônica da mídia de catálogo. O bucket é compartilhado, mas cada
 * tenant fica isolado pelo seu slug:
 *
 *   p/{objectPath}
 *
 * Em uma URL assinada R2 isso resulta em /{bucket}/p/…
 */
export function catalogMediaKey(objectPath: string): string {
  const normalizedPath = objectPath.trim();
  const segments = normalizedPath.split("/");
  if (
    !normalizedPath ||
    normalizedPath.startsWith("/") ||
    normalizedPath.includes("\\") ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("Caminho da mídia deve ser relativo e não pode conter segmentos vazios, . ou ...");
  }
  return `p/${normalizedPath}`;
}

/**
 * Gera o caminho relativo simples e estável de uma mídia de produto:
 *
 * {mediaId}/{referenceId}-{variant}.{ext}
 *
 * Cor, ordem e vínculo com o produto devem ficar no banco, associados ao
 * mediaId. O banco deve persistir a chave retornada, para não depender de
 * uma referência que possa ser alterada no ERP.
 */
export function productCatalogMediaPath(input: ProductCatalogMediaPath): string {
  const mediaId = input.mediaId.trim().toLowerCase();
  const referenceId = input.referenceId.trim();
  const variant = (input.variant ?? "og").trim().toLowerCase();
  const extension = input.extension.trim().toLowerCase().replace(/^\./, "");
  if (!UUID_PATTERN.test(mediaId)) {
    throw new Error("mediaId deve ser um UUID válido.");
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(referenceId)) {
    throw new Error("referenceId contém caracteres inválidos para o caminho da mídia.");
  }
  if (!/^[a-z0-9]{1,24}$/.test(variant)) {
    throw new Error("Variante da mídia inválida.");
  }
  if (!/^[a-z0-9]{1,10}$/.test(extension)) {
    throw new Error("Extensão da mídia inválida.");
  }

  return `${mediaId}/${referenceId}-${variant}.${extension}`;
}

// "NoSuchKey" (GetObject) e "NotFound" (HeadObject, sem corpo de erro) são os
// nomes que o SDK atribui especificamente para objeto ausente — de propósito
// não cai num fallback genérico por $metadata.httpStatusCode === 404, porque
// isso também cobriria "NoSuchBucket" (ex.: bucket errado/typo no env) e
// mascararia esse erro de configuração como "objeto não encontrado".
function isNotFoundError(error: unknown): boolean {
  const err = error as { name?: string } | null;
  return err?.name === "NoSuchKey" || err?.name === "NotFound";
}

async function uploadObject(
  key: string,
  data: Buffer | Uint8Array,
  contentType: string,
  cacheControl?: string,
): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: data,
      ContentType: contentType,
      CacheControl: cacheControl,
    }),
  );
}

async function objectExists(key: string): Promise<boolean> {
  if (!key.trim()) return false;
  try {
    await client().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
  } catch (error) {
    if (isNotFoundError(error)) return false;
    throw error;
  }
  return true;
}

async function deleteObject(key: string): Promise<void> {
  if (!key.trim()) return;
  await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
  for (const cacheKey of presignedCache.keys()) {
    const [cachedKeyPart] = JSON.parse(cacheKey) as [string, number];
    if (cachedKeyPart === key) presignedCache.delete(cacheKey);
  }
}

async function getObjectBytes(key: string): Promise<Buffer | null> {
  if (!key.trim()) return null;
  try {
    const response = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    if (!response.Body) return null;
    return Buffer.from(await response.Body.transformToByteArray());
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

/** Gera URL assinada, reaproveitando a mesma URL enquanto ela ainda tem boa
 * parte do TTL restante. Isso permite que o navegador reutilize o cache HTTP
 * da mídia (ver Cache-Control em uploadObject) em vez de baixar de novo a
 * cada listagem, já que o objeto é imutável. */
async function generatePresignedUrl(key: string, ttlSeconds: number): Promise<string> {
  const ttl = Math.trunc(ttlSeconds);
  if (!key.trim()) throw new Error("A chave do objeto não pode estar vazia.");
  if (!Number.isFinite(ttlSeconds) || ttl < 1 || ttl > PRESIGNED_URL_MAX_TTL_SECONDS) {
    throw new Error(`TTL da URL assinada deve estar entre 1 e ${PRESIGNED_URL_MAX_TTL_SECONDS} segundos.`);
  }
  const cacheKey = JSON.stringify([key, ttl]);
  const now = Date.now();
  const refreshMarginMs = Math.max(ttl * 0.1, 3600) * 1000;

  const cached = presignedCache.get(cacheKey);
  if (cached && cached.expiresAt - now > refreshMarginMs) return cached.url;

  const url = await getSignedUrl(client(), new GetObjectCommand({ Bucket: bucket(), Key: key }), {
    expiresIn: ttl,
  });

  if (presignedCache.size >= PRESIGNED_CACHE_MAX_ENTRIES) {
    for (const [k, v] of presignedCache) {
      if (v.expiresAt <= now) presignedCache.delete(k);
    }
    // Se todas as entradas ainda forem válidas, remova a mais antiga. Map
    // preserva a ordem de inserção, mantendo o limite estrito de memória.
    if (presignedCache.size >= PRESIGNED_CACHE_MAX_ENTRIES) {
      const oldestKey = presignedCache.keys().next().value;
      if (oldestKey) presignedCache.delete(oldestKey);
    }
  }
  presignedCache.set(cacheKey, { url, expiresAt: now + ttl * 1000 });
  return url;
}

/** Cria uma visão limitada a um tenant. Prefira esta API ao chamar o cliente
 * a partir de serviços: ela impede que uma chave de outro tenant seja usada
 * acidentalmente. */
export function forObject(objectPath: string): CatalogMediaClient {
  const key = catalogMediaKey(objectPath);
  return {
    key,
    uploadObject: (data, contentType, cacheControl) => uploadObject(key, data, contentType, cacheControl),
    objectExists: () => objectExists(key),
    deleteObject: () => deleteObject(key),
    getObjectBytes: () => getObjectBytes(key),
    generatePresignedUrl: (ttlSeconds) => generatePresignedUrl(key, ttlSeconds),
  };
}

/** Atalho tipado para a convenção de mídia de produtos. */
export function forProduct(input: ProductCatalogMediaPath): CatalogMediaClient {
  return forObject(productCatalogMediaPath(input));
}
