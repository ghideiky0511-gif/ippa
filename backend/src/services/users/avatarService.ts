import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser } from "@/lib/types";
import { forObject } from "@/lib/storage/r2CatalogMediaClient";
import { findUserRowById, updateUserRow } from "@/models/usersModel";
import { recordAuditEvent, USER_AUDIT_ACTIONS, type AuditRequestContext } from "@/services/audit";
import { NotFoundError } from "@/services/shared/errors";
import { newAvatarKey, validateAvatarUpload, type AvatarUpload } from "./avatarMediaService";
import { toAuthUser } from "./userMapper";

async function deleteAvatarObject(key: string | null): Promise<void> {
  if (!key) return;
  await forObject(key).deleteObject().catch(() => undefined);
}

export async function uploadOwnAvatar(
  tenant: Tenant,
  actor: AuthUser,
  upload: AvatarUpload,
  context: AuditRequestContext,
): Promise<AuthUser> {
  validateAvatarUpload(upload);
  const current = await withTenantTransaction(tenant, actor, (client) => findUserRowById(client, actor.id));
  if (!current) throw new NotFoundError("USER_NOT_FOUND");

  const avatarKey = newAvatarKey(tenant, actor.id, upload.contentType);
  await forObject(avatarKey).uploadObject(upload.bytes, upload.contentType, "private, max-age=604800");
  try {
    const updated = await withTenantTransaction(tenant, actor, async (client) => {
      const row = await updateUserRow(client, actor.id, { avatarKey });
      if (!row) throw new NotFoundError("USER_NOT_FOUND");
      await recordAuditEvent(client, {
        action: USER_AUDIT_ACTIONS.UPDATED,
        entityId: row.id,
        actor,
        context,
        metadata: { fields: ["avatar"] },
      });
      return row;
    });
    await deleteAvatarObject(current.avatar_key);
    return toAuthUser(updated);
  } catch (error) {
    await deleteAvatarObject(avatarKey);
    throw error;
  }
}

export async function removeOwnAvatar(
  tenant: Tenant,
  actor: AuthUser,
  context: AuditRequestContext,
): Promise<AuthUser> {
  const updated = await withTenantTransaction(tenant, actor, async (client) => {
    const current = await findUserRowById(client, actor.id);
    if (!current) throw new NotFoundError("USER_NOT_FOUND");
    const row = await updateUserRow(client, actor.id, { avatarKey: null });
    if (!row) throw new NotFoundError("USER_NOT_FOUND");
    await recordAuditEvent(client, {
      action: USER_AUDIT_ACTIONS.UPDATED,
      entityId: row.id,
      actor,
      context,
      metadata: { fields: ["avatar"] },
    });
    return { row, previousAvatarKey: current.avatar_key };
  });
  await deleteAvatarObject(updated.previousAvatarKey);
  return toAuthUser(updated.row);
}
