import { createHash, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { forObject, forProduct } from "@/lib/storage/r2CatalogMediaClient";
import type { ProductRow } from "@/models/catalogModel";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
// Mídia de catálogo é imutável (mesma chave nunca muda de conteúdo, ver
// Cache-Control abaixo), então o TTL usa o máximo permitido pelo cliente R2:
// uma URL assinada de curta duração troca a query string a cada renovação,
// e como o cache HTTP do navegador e o push-sw.js indexam por URL completa,
// isso faz a mesma imagem física virar várias entradas de cache ao longo do
// tempo. TTL longo minimiza essa renovação/churn.
const MEDIA_URL_TTL_SECONDS = 7 * 24 * 60 * 60;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

function isPrivateAddress(address: string): boolean {
    const normalized = address.toLowerCase();
    if (isIP(address) === 6) {
        return normalized === "::1" || normalized.startsWith("fc")
            || normalized.startsWith("fd") || normalized.startsWith("fe8")
            || normalized.startsWith("fe9") || normalized.startsWith("fea")
            || normalized.startsWith("feb");
    }
    const octets = address.split(".").map(Number);
    if (octets.length !== 4) return true;
    return octets[0] === 0 || octets[0] === 10 || octets[0] === 127
        || (octets[0] === 169 && octets[1] === 254)
        || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
        || (octets[0] === 192 && octets[1] === 168);
}

async function safeRemoteUrl(rawUrl: string): Promise<string> {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("REMOTE_URL_NOT_ALLOWED");
    const addresses = await lookup(url.hostname, { all: true });
    if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
        throw new Error("REMOTE_URL_NOT_ALLOWED");
    }
    return url.toString();
}

async function safeFetch(rawUrl: string, init: RequestInit): Promise<Response> {
    let currentUrl = rawUrl;
    for (let redirectCount = 0; redirectCount <= 3; redirectCount++) {
        const safeUrl = await safeRemoteUrl(currentUrl);
        const response = await fetch(safeUrl, { ...init, redirect: "manual" });
        if (response.status < 300 || response.status >= 400) return response;
        const location = response.headers.get("location");
        if (!location || redirectCount === 3) throw new Error("REMOTE_REDIRECT_NOT_ALLOWED");
        currentUrl = new URL(location, safeUrl).toString();
    }
    throw new Error("REMOTE_REDIRECT_NOT_ALLOWED");
}

function hasValidSignature(contentType: string, bytes: Uint8Array): boolean {
    if (contentType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (contentType === "image/png") return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    if (contentType === "image/webp") {
        return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
            && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
    }
    return false;
}

function extensionFor(contentType: string): string {
    if (contentType === "image/png") return "png";
    if (contentType === "image/webp") return "webp";
    return "jpg";
}

function safeReference(referenceId: string): string {
    const normalized = referenceId.trim().replace(/[^a-zA-Z0-9._-]/g, "-");
    return normalized.slice(0, 128) || "produto";
}

async function remoteBytes(url: string): Promise<{ bytes: Uint8Array; contentType: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
        const response = await safeFetch(url, {
            headers: { "User-Agent": "IPPA-Catalog-Onboarding/1.0", Accept: "image/*" },
            signal: controller.signal,
        });
        if (!response.ok) throw new Error(`IMAGE_DOWNLOAD_HTTP_${response.status}`);
        const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
        if (!ALLOWED_IMAGE_TYPES.has(contentType)) throw new Error("IMAGE_CONTENT_TYPE_INVALID");
        const contentLength = Number(response.headers.get("content-length"));
        if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) throw new Error("IMAGE_TOO_LARGE");
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) throw new Error("IMAGE_TOO_LARGE");
        if (!hasValidSignature(contentType, bytes)) throw new Error("IMAGE_SIGNATURE_INVALID");
        return { bytes, contentType };
    } finally {
        clearTimeout(timer);
    }
}

function hasValidVideoSignature(contentType: string, bytes: Uint8Array): boolean {
    if (contentType === "video/webm") {
        return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
    }
    // ISO Base Media (MP4/M4V) e QuickTime começam com o box `ftyp`.
    return String.fromCharCode(...bytes.slice(4, 8)) === "ftyp";
}

function videoExtensionFor(contentType: string): string {
    if (contentType === "video/webm") return "webm";
    if (contentType === "video/quicktime") return "mov";
    return "mp4";
}

async function remoteVideoBytes(url: string): Promise<{ bytes: Uint8Array; contentType: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
        const response = await safeFetch(url, {
            headers: { "User-Agent": "IPPA-Catalog-Onboarding/1.0", Accept: "video/*" },
            signal: controller.signal,
        });
        if (!response.ok) throw new Error(`VIDEO_DOWNLOAD_HTTP_${response.status}`);
        const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
        if (!ALLOWED_VIDEO_TYPES.has(contentType)) throw new Error("VIDEO_CONTENT_TYPE_INVALID");
        const contentLength = Number(response.headers.get("content-length"));
        if (Number.isFinite(contentLength) && contentLength > MAX_VIDEO_BYTES) throw new Error("VIDEO_TOO_LARGE");
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length === 0 || bytes.length > MAX_VIDEO_BYTES) throw new Error("VIDEO_TOO_LARGE");
        if (!hasValidVideoSignature(contentType, bytes)) throw new Error("VIDEO_SIGNATURE_INVALID");
        return { bytes, contentType };
    } finally {
        clearTimeout(timer);
    }
}

export async function scrapePrimaryImageUrl(pageUrl: string): Promise<string | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
        const response = await safeFetch(pageUrl, {
            headers: { "User-Agent": "IPPA-Catalog-Onboarding/1.0", Accept: "text/html" },
            signal: controller.signal,
        });
        if (!response.ok) return null;
        const html = (await response.text()).slice(0, 2_000_000);
        const candidate = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1]
            ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1]
            ?? html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1];
        return candidate ? await safeRemoteUrl(new URL(candidate, response.url || pageUrl).toString()) : null;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

export interface CatalogMediaCopySession {
    copy(url: string, referenceId: string, variant?: string): Promise<string>;
    copyVideo(url: string, referenceId: string, variant?: string): Promise<string>;
}

export function createCatalogMediaCopySession(): CatalogMediaCopySession {
    const byUrl = new Map<string, Promise<string>>();
    const byHash = new Map<string, string>();
    return {
        copy(url, referenceId, variant = "og") {
            const normalizedUrl = url.trim();
            const cached = byUrl.get(normalizedUrl);
            if (cached) return cached;
            const operation = (async () => {
                const { bytes, contentType } = await remoteBytes(normalizedUrl);
                const hash = createHash("sha256").update(bytes).digest("hex");
                const existingKey = byHash.get(hash);
                if (existingKey) return existingKey;
                const media = forProduct({
                    mediaId: randomUUID(),
                    referenceId: safeReference(referenceId),
                    variant: variant.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 24) || "og",
                    extension: extensionFor(contentType),
                });
                await media.uploadObject(bytes, contentType, "private, max-age=31536000, immutable");
                byHash.set(hash, media.key.replace(/^p\//, ""));
                return media.key.replace(/^p\//, "");
            })();
            byUrl.set(normalizedUrl, operation);
            return operation;
        },
        copyVideo(url, referenceId, variant = "video") {
            const normalizedUrl = url.trim();
            const cached = byUrl.get(normalizedUrl);
            if (cached) return cached;
            const operation = (async () => {
                const { bytes, contentType } = await remoteVideoBytes(normalizedUrl);
                const hash = createHash("sha256").update(bytes).digest("hex");
                const existingKey = byHash.get(hash);
                if (existingKey) return existingKey;
                const media = forProduct({
                    mediaId: randomUUID(),
                    referenceId: safeReference(referenceId),
                    variant: variant.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 24) || "video",
                    extension: videoExtensionFor(contentType),
                });
                await media.uploadObject(bytes, contentType, "private, max-age=31536000, immutable");
                byHash.set(hash, media.key.replace(/^p\//, ""));
                return media.key.replace(/^p\//, "");
            })();
            byUrl.set(normalizedUrl, operation);
            return operation;
        },
    };
}

async function urlForKey(key?: string): Promise<string | undefined> {
    if (!key) return undefined;
    return forObject(key).generatePresignedUrl(MEDIA_URL_TTL_SECONDS).catch(() => undefined);
}

export async function resolveCatalogMedia(
    media: ProductRow["media"],
): Promise<Pick<ProductRow["media"], "image" | "images" | "imagesByColor" | "videoUrl">> {
    const image = await urlForKey(media.imageKey) ?? media.image;
    const images = media.imageKeys
        ? (await Promise.all(media.imageKeys.map(urlForKey))).filter((url): url is string => Boolean(url))
        : media.images;
    let imagesByColor = media.imagesByColor;
    if (media.imageKeysByColor) {
        imagesByColor = { ...(media.imagesByColor ?? {}) };
        for (const [color, key] of Object.entries(media.imageKeysByColor)) {
            const url = await urlForKey(key);
            if (url) imagesByColor[color] = url;
        }
    }
    const videoUrl = media.videoKeys
        ? (await Promise.all(media.videoKeys.map(urlForKey))).find((url): url is string => Boolean(url))
        : media.videoUrl;
    return { image, images, imagesByColor, videoUrl };
}
