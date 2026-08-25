import { NextRequest, NextResponse } from "next/server";
import { isControlRouteError, requirePlatformUser } from "@/lib/http/controlRoute";
import { errorMeta, logger } from "@/lib/logger";
import { createManagedAiPromptVersion, listManagedAiPromptTools } from "@/services/ai";

function knownError(error: unknown): NextResponse | null {
    if (!(error instanceof Error)) return null;
    if (error.message === "INVALID_TENANT_ID") {
        return NextResponse.json({ error: "Tenant invalido." }, { status: 400 });
    }
    if (error.message === "TENANT_NOT_FOUND") {
        return NextResponse.json({ error: "Tenant nao encontrado." }, { status: 404 });
    }
    if (error.message === "AI_TOOL_NOT_MANAGED") {
        return NextResponse.json({ error: "Ferramenta de IA nao reconhecida." }, { status: 400 });
    }
    if (error.message === "INVALID_AI_PROMPT_INSTRUCTIONS") {
        return NextResponse.json(
            { error: "As instrucoes devem ter entre 20 e 20.000 caracteres." },
            { status: 400 },
        );
    }
    return null;
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const user = await requirePlatformUser(request);
    if (isControlRouteError(user)) return user;
    const { id } = await context.params;
    try {
        return NextResponse.json({ tools: await listManagedAiPromptTools(id) });
    } catch (error) {
        const response = knownError(error);
        if (response) return response;
        logger.error("control-ai-prompts", "Falha ao listar prompts de IA", errorMeta(error));
        return NextResponse.json({ error: "Nao foi possivel carregar os prompts de IA." }, { status: 500 });
    }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const user = await requirePlatformUser(request);
    if (isControlRouteError(user)) return user;
    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    try {
        const version = await createManagedAiPromptVersion(id, user.id, {
            toolKey: typeof body?.toolKey === "string" ? body.toolKey : "",
            instructions: typeof body?.instructions === "string" ? body.instructions : "",
            activate: body?.activate === true,
        });
        return NextResponse.json({ version }, { status: 201 });
    } catch (error) {
        const response = knownError(error);
        if (response) return response;
        logger.error("control-ai-prompts", "Falha ao criar versao de prompt de IA", errorMeta(error));
        return NextResponse.json({ error: "Nao foi possivel salvar a versao do prompt." }, { status: 500 });
    }
}
