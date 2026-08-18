import type { AuthUser } from "@/lib/types";
import { ForbiddenError } from "@/services/shared/errors";

export function requireSettingsAdministrator(user: AuthUser): void {
  if (user.role !== "administrador" || user.permissions?.adminAccess !== true) {
    throw new ForbiddenError();
  }
}
