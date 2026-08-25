import { createHash } from "node:crypto";
import type { ActorContext, Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import { withControlTransaction } from "@/lib/db/control";
import {
    activateControlAiToolPromptVersionRow,
    findActiveAiToolPromptVersionRow,
    findControlAiToolPromptVersionRow,
    insertControlAiToolPromptVersionRow,
    listControlAiToolPromptVersionRows,
    type AiToolPromptVersionRow,
    type AiToolPromptVersionStatus,
} from "@/models/aiToolPromptsModel";
import { tenantExists } from "@/models/platformModel";
import { findManagedAiTool, listManagedAiTools } from "./managedTools";
import type { AiToolDefinition } from "./types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIN_INSTRUCTIONS_LENGTH = 20;
const MAX_INSTRUCTIONS_LENGTH = 20_000;

export interface ResolvedAiToolPrompt {
    instructions: string;
    revision: string;
    source: "database" | "definition";
    promptVersionId?: string;
    configuredVersion?: number;
}

export interface ManagedAiPromptVersion {
    id: string;
    version: number;
    instructions: string;
    status: AiToolPromptVersionStatus;
    createdAt: string;
    activatedAt: string | null;
}

export interface ManagedAiPromptTool {
    key: string;
    label: string;
    description: string;
    defaultInstructions: string;
    activeVersion: number | null;
    versions: ManagedAiPromptVersion[];
}

function codePromptRevision(instructions: string): string {
    return `code:${createHash("sha256").update(instructions).digest("hex")}`;
}

function mapVersion(row: AiToolPromptVersionRow): ManagedAiPromptVersion {
    return {
        id: row.id,
        version: row.version,
        instructions: row.instructions,
        status: row.status,
        createdAt: row.created_at.toISOString(),
        activatedAt: row.activated_at?.toISOString() ?? null,
    };
}

function validateTenantId(tenantId: string): void {
    if (!UUID_PATTERN.test(tenantId)) throw new Error("INVALID_TENANT_ID");
}

function validateInstructions(value: string): string {
    const instructions = value.trim();
    if (instructions.length < MIN_INSTRUCTIONS_LENGTH || instructions.length > MAX_INSTRUCTIONS_LENGTH) {
        throw new Error("INVALID_AI_PROMPT_INSTRUCTIONS");
    }
    return instructions;
}

export async function resolveAiToolPrompt<TInput, TOutput>(
    tenant: Tenant,
    actor: ActorContext,
    tool: AiToolDefinition<TInput, TOutput>,
): Promise<ResolvedAiToolPrompt> {
    const configured = await withTenantTransaction(
        tenant,
        actor,
        (client) => findActiveAiToolPromptVersionRow(client, tool.key),
    );
    if (configured) {
        return {
            instructions: configured.instructions,
            revision: `database:${configured.id}`,
            source: "database",
            promptVersionId: configured.id,
            configuredVersion: configured.version,
        };
    }
    return {
        instructions: tool.instructions,
        revision: codePromptRevision(tool.instructions),
        source: "definition",
    };
}

export async function listManagedAiPromptTools(tenantId: string): Promise<ManagedAiPromptTool[]> {
    validateTenantId(tenantId);
    return withControlTransaction(async (client) => {
        if (!await tenantExists(client, tenantId)) throw new Error("TENANT_NOT_FOUND");
        const rows = await listControlAiToolPromptVersionRows(client, tenantId);
        return listManagedAiTools().map((tool) => {
            const versions = rows.filter((row) => row.tool_key === tool.key).map(mapVersion);
            return {
                ...tool,
                activeVersion: versions.find((version) => version.status === "active")?.version ?? null,
                versions,
            };
        });
    });
}

export async function createManagedAiPromptVersion(
    tenantId: string,
    platformUserId: string,
    input: { toolKey: string; instructions: string; activate?: boolean },
): Promise<ManagedAiPromptVersion> {
    validateTenantId(tenantId);
    if (!UUID_PATTERN.test(platformUserId)) throw new Error("INVALID_PLATFORM_USER_ID");
    const tool = findManagedAiTool(input.toolKey);
    if (!tool) throw new Error("AI_TOOL_NOT_MANAGED");
    const instructions = validateInstructions(input.instructions);

    return withControlTransaction(async (client) => {
        if (!await tenantExists(client, tenantId)) throw new Error("TENANT_NOT_FOUND");
        const created = await insertControlAiToolPromptVersionRow(client, {
            tenantId,
            toolKey: tool.key,
            instructions,
            platformUserId,
        });
        if (!input.activate) return mapVersion(created);
        return mapVersion(await activateControlAiToolPromptVersionRow(client, {
            tenantId,
            toolKey: tool.key,
            versionId: created.id,
            platformUserId,
        }));
    });
}

export async function activateManagedAiPromptVersion(
    tenantId: string,
    versionId: string,
    platformUserId: string,
): Promise<ManagedAiPromptVersion> {
    validateTenantId(tenantId);
    if (!UUID_PATTERN.test(versionId)) throw new Error("INVALID_AI_PROMPT_VERSION_ID");
    if (!UUID_PATTERN.test(platformUserId)) throw new Error("INVALID_PLATFORM_USER_ID");

    return withControlTransaction(async (client) => {
        if (!await tenantExists(client, tenantId)) throw new Error("TENANT_NOT_FOUND");
        const version = await findControlAiToolPromptVersionRow(client, tenantId, versionId);
        if (!version) throw new Error("AI_PROMPT_VERSION_NOT_FOUND");
        if (!findManagedAiTool(version.tool_key)) throw new Error("AI_TOOL_NOT_MANAGED");
        return mapVersion(await activateControlAiToolPromptVersionRow(client, {
            tenantId,
            toolKey: version.tool_key,
            versionId: version.id,
            platformUserId,
        }));
    });
}
