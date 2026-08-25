import { NextRequest, NextResponse } from "next/server";
import { isControlRouteError, requirePlatformUser } from "@/lib/http/controlRoute";
import { errorMeta, logger } from "@/lib/logger";
import { activateManagedAiPromptVersion } from "@/services/ai";

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string; versionId: string }> },
) {
    const user = await requirePlatformUser(request);
    if (isControlRouteError(user)) return user;
    const { id, versionId } = await context.params;
    const body = await request.json().catch(() => null);
    if (body?.action !== "activate") {
        return NextResponse.json({ error: "Acao invalida." }, { status: 400 });
    }
    try {
        const version = await activateManagedAiPromptVersion(id, versionId, user.id);
        return NextResponse.json({ version });
    } catch (error) {
        if (error instanceof Error && (
            error.message === "INVALID_TENANT_ID"
            || error.message === "INVALID_AI_PROMPT_VERSION_ID"
        )) {
            return NextResponse.json({ error: "Identificador invalido." }, { status: 400 });
        }
        if (error instanceof Error && error.message === "TENANT_NOT_FOUND") {
            return NextResponse.json({ error: "Tenant nao encontrado." }, { status: 404 });
        }
        if (error instanceof Error && error.message === "AI_PROMPT_VERSION_NOT_FOUND") {
            return NextResponse.json({ error: "Versao de prompt nao encontrada." }, { status: 404 });
        }
        logger.error("control-ai-prompts", "Falha ao ativar versao de prompt de IA", errorMeta(error));
        return NextResponse.json({ error: "Nao foi possivel ativar a versao do prompt." }, { status: 500 });
    }
}
