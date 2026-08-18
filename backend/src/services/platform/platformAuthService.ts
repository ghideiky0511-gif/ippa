import { createHash, randomBytes } from "node:crypto";
import { verify } from "@node-rs/argon2";
import { withControlTransaction } from "@/lib/db/control";
import {
    findPlatformUserRowByEmail,
    findPlatformUserRowBySession,
    insertPlatformSessionRow,
    revokePlatformSessionRow,
    type PlatformUserRow,
} from "@/models/platformModel";
import type { PlatformUser } from "./types";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function tokenDigest(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}
function safeUser(user: PlatformUserRow): PlatformUser {
    return { id: user.id, email: user.email, name: user.name };
}

export async function authenticatePlatform(email: string, password: string): Promise<PlatformUser | null> {
    const normalizedEmail = email.trim().toLowerCase();
    return withControlTransaction(async (client) => {
        const user = await findPlatformUserRowByEmail(client, normalizedEmail);
        return user && await verify(user.password_hash, password) ? safeUser(user) : null;
    });
}

export async function issuePlatformSession(userId: string): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    await withControlTransaction((client) => insertPlatformSessionRow(
        client, userId, tokenDigest(token), new Date(Date.now() + SESSION_TTL_MS),
    ));
    return token;
}

export async function getPlatformUser(token?: string): Promise<PlatformUser | null> {
    if (!token) return null;
    return withControlTransaction(async (client) => {
        const user = await findPlatformUserRowBySession(client, tokenDigest(token));
        return user ? safeUser(user) : null;
    });
}

export async function logoutPlatform(token?: string): Promise<void> {
    if (!token) return;
    await withControlTransaction((client) => revokePlatformSessionRow(client, tokenDigest(token)));
}
