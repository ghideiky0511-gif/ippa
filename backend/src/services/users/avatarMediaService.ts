import { randomUUID } from "node:crypto";
import type { Tenant } from "@/lib/db/tenant";
import { forObject, userAvatarMediaPath } from "@/lib/storage/r2CatalogMediaClient";
import { ValidationError } from "@/services/shared/errors";

export const AVATAR_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AvatarContentType = (typeof AVATAR_CONTENT_TYPES)[number];
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_URL_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface AvatarUpload {
  bytes: Buffer;
  contentType: string;
}

function isJpeg(bytes: Buffer): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function isPng(bytes: Buffer): boolean {
  return bytes.length >= 8
    && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
}

function isWebp(bytes: Buffer): boolean {
  return bytes.length >= 12
    && bytes.subarray(0, 4).toString("ascii") === "RIFF"
    && bytes.subarray(8, 12).toString("ascii") === "WEBP";
}

function hasExpectedSignature(contentType: AvatarContentType, bytes: Buffer): boolean {
  if (contentType === "image/jpeg") return isJpeg(bytes);
  if (contentType === "image/png") return isPng(bytes);
  return isWebp(bytes);
}

function avatarExtension(contentType: AvatarContentType): "jpeg" | "png" | "webp" {
  if (contentType === "image/jpeg") return "jpeg";
  if (contentType === "image/png") return "png";
  return "webp";
}

export function validateAvatarUpload(upload: AvatarUpload): asserts upload is AvatarUpload & { contentType: AvatarContentType } {
  const contentType = upload.contentType.toLowerCase() as AvatarContentType;
  if (!AVATAR_CONTENT_TYPES.includes(contentType) || !hasExpectedSignature(contentType, upload.bytes)) {
    throw new ValidationError("INVALID_AVATAR_FILE", "Envie uma imagem PNG, JPEG ou WebP válida.");
  }
  if (upload.bytes.length === 0 || upload.bytes.length > MAX_AVATAR_BYTES) {
    throw new ValidationError("AVATAR_FILE_TOO_LARGE", "A imagem do perfil deve ter no máximo 5 MB.");
  }
}

export function newAvatarKey(tenant: Tenant, userId: string, contentType: AvatarContentType): string {
  return userAvatarMediaPath({ tenantSlug: tenant.slug, userId, mediaId: randomUUID(), extension: avatarExtension(contentType) });
}

export async function avatarUrlForKey(key: string): Promise<string> {
  return forObject(key).generatePresignedUrl(AVATAR_URL_TTL_SECONDS);
}
