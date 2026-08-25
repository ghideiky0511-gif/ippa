import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import type { ActorContext, Tenant } from "@/lib/db/tenant";
import { ServiceError, ValidationError } from "@/services/shared/errors";
import { createAiToolRunner } from "./aiToolEngine";
import type { AiExecutionIdentity, AiExecutionStore } from "./executionStore";
import { OpenAiStructuredProvider } from "./openAiStructuredProvider";
import { defineAiTool } from "./toolDefinition";
import type {
    AiProviderProfile,
    AiProviderRequest,
    AiProviderResult,
    AiStructuredProvider,
} from "./types";
import { AiProviderFailure } from "./types";

const TEST_NOW = new Date("2026-08-25T12:00:00Z");

interface StoredExecution extends AiExecutionIdentity {
    id: string;
    status: "processing" | "succeeded" | "failed" | "cached";
    output?: unknown;
    sourceExecutionId?: string;
    errorCode?: string;
    completedAt?: Date;
    attemptCount?: number;
}

class FakeExecutionStore implements AiExecutionStore {
    readonly records: StoredExecution[] = [];
    readonly cleanupCutoffs: Date[] = [];
    private nextId = 1;

    async findCached(identity: AiExecutionIdentity, completedAfter: Date) {
        const record = [...this.records].reverse().find((item) =>
            item.status === "succeeded"
            && item.completedAt !== undefined
            && item.completedAt >= completedAfter
            && item.toolKey === identity.toolKey
            && item.toolVersion === identity.toolVersion
            && item.promptRevision === identity.promptRevision
            && item.provider === identity.provider
            && item.model === identity.model
            && item.inputHash === identity.inputHash,
        );
        return record ? { id: record.id, output: record.output } : null;
    }

    async createProcessing(identity: AiExecutionIdentity): Promise<string> {
        const id = `execution-${this.nextId++}`;
        this.records.push({ ...identity, id, status: "processing" });
        return id;
    }

    async createCached(
        identity: AiExecutionIdentity,
        sourceExecutionId: string,
        durationMs: number,
    ): Promise<string> {
        assert.ok(durationMs >= 0);
        const id = `execution-${this.nextId++}`;
        this.records.push({ ...identity, id, status: "cached", sourceExecutionId, completedAt: TEST_NOW });
        return id;
    }

    async succeed(params: {
        id: string;
        output: unknown;
        attemptCount: number;
    }): Promise<void> {
        const record = this.records.find((item) => item.id === params.id);
        assert.ok(record);
        record.status = "succeeded";
        record.output = params.output;
        record.attemptCount = params.attemptCount;
        record.completedAt = TEST_NOW;
    }

    async fail(params: { id: string; errorCode: string; attemptCount: number }): Promise<void> {
        const record = this.records.find((item) => item.id === params.id);
        assert.ok(record);
        record.status = "failed";
        record.errorCode = params.errorCode;
        record.attemptCount = params.attemptCount;
        record.completedAt = TEST_NOW;
    }

    async cleanupExpired(createdBefore: Date): Promise<number> {
        this.cleanupCutoffs.push(createdBefore);
        return 0;
    }
}

class FakeProvider implements AiStructuredProvider {
    readonly requests: AiProviderRequest<unknown>[] = [];
    constructor(
        private readonly handler: (request: AiProviderRequest<unknown>, call: number) => Promise<AiProviderResult<unknown>>,
    ) {}

    async generateStructured<TOutput>(request: AiProviderRequest<TOutput>): Promise<AiProviderResult<TOutput>> {
        this.requests.push(request as AiProviderRequest<unknown>);
        return await this.handler(request as AiProviderRequest<unknown>, this.requests.length) as AiProviderResult<TOutput>;
    }
}

const actor: ActorContext = { userId: "11111111-1111-4111-8111-111111111111", role: "vendedora" };
const profile: AiProviderProfile = { provider: "openai", apiKey: "test-key", model: "test-model" };

function tenant(suffix: string): Tenant {
    return { id: `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`, slug: `tenant-${suffix}`, name: `Tenant ${suffix}` };
}

function tool(options: { version?: string; cacheTtlMs?: number } = {}) {
    return defineAiTool({
        key: "test.summary",
        version: options.version ?? "1",
        providerProfile: "catalogOrderResume",
        inputSchema: z.object({ amount: z.number().positive(), secret: z.string() }),
        outputSchema: z.object({ summary: z.string() }),
        instructions: "Resuma os dados.",
        buildPrompt: (input) => JSON.stringify(input),
        maxOutputTokens: 100,
        cacheTtlMs: options.cacheTtlMs,
    });
}

function runner(provider: AiStructuredProvider, stores: Map<string, FakeExecutionStore>, now = TEST_NOW) {
    return createAiToolRunner({
        provider,
        storeFactory: (currentTenant) => {
            const existing = stores.get(currentTenant.id);
            if (existing) return existing;
            const created = new FakeExecutionStore();
            stores.set(currentTenant.id, created);
            return created;
        },
        resolveProfile: () => profile,
        resolvePrompt: async (_tenant, _actor, currentTool) => ({
            instructions: currentTool.instructions,
            revision: "code:test",
            source: "definition",
        }),
        now: () => now,
        sleep: async () => undefined,
    });
}

test("valida input antes de chamar provider ou criar histórico", async () => {
    const provider = new FakeProvider(async () => ({ data: { summary: "ok" } }));
    const stores = new Map<string, FakeExecutionStore>();
    const run = runner(provider, stores);

    await assert.rejects(
        run(tenant("1"), actor, tool(), { amount: 0, secret: "não persistir" }),
        (error: unknown) => error instanceof ValidationError && error.code === "AI_TOOL_INVALID_INPUT",
    );
    assert.equal(provider.requests.length, 0);
    assert.equal(stores.size, 0);
});

test("executa, valida a saída e persiste somente hash, saída e metadados", async () => {
    const provider = new FakeProvider(async () => ({
        data: { summary: "Compra equilibrada." },
        providerResponseId: "resp_test",
        usage: { inputTokens: 20, outputTokens: 5, cachedInputTokens: 0 },
    }));
    const stores = new Map<string, FakeExecutionStore>();
    const run = runner(provider, stores);
    const currentTenant = tenant("2");
    const result = await run(currentTenant, actor, tool(), { amount: 150, secret: "customer-document-123" });

    assert.deepEqual(result, {
        executionId: "execution-1",
        data: { summary: "Compra equilibrada." },
        source: "provider",
    });
    assert.match(provider.requests[0].prompt, /customer-document-123/);
    const serializedHistory = JSON.stringify(stores.get(currentTenant.id)?.records);
    assert.doesNotMatch(serializedHistory, /customer-document-123/);
    assert.equal(stores.get(currentTenant.id)?.records[0].status, "succeeded");
    assert.equal(stores.get(currentTenant.id)?.records[0].attemptCount, 1);
});

test("rejeita saída fora do schema sem repetir a chamada", async () => {
    const provider = new FakeProvider(async () => ({ data: { invalid: true } }));
    const stores = new Map<string, FakeExecutionStore>();
    const run = runner(provider, stores);
    const currentTenant = tenant("3");

    await assert.rejects(
        run(currentTenant, actor, tool(), { amount: 10, secret: "x" }),
        (error: unknown) => error instanceof ServiceError && error.code === "AI_PROVIDER_INVALID_OUTPUT",
    );
    assert.equal(provider.requests.length, 1);
    assert.equal(stores.get(currentTenant.id)?.records[0].status, "failed");
});

test("normaliza perfil sem chave antes de qualquer acesso à rede", async () => {
    const stores = new Map<string, FakeExecutionStore>();
    const run = createAiToolRunner({
        provider: new OpenAiStructuredProvider(),
        storeFactory: (currentTenant) => {
            const created = new FakeExecutionStore();
            stores.set(currentTenant.id, created);
            return created;
        },
        resolveProfile: () => ({ provider: "openai", apiKey: "", model: "test-model" }),
        resolvePrompt: async (_tenant, _actor, currentTool) => ({
            instructions: currentTool.instructions,
            revision: "code:test",
            source: "definition",
        }),
        now: () => TEST_NOW,
        sleep: async () => undefined,
    });
    const currentTenant = tenant("31");

    await assert.rejects(
        run(currentTenant, actor, tool(), { amount: 10, secret: "x" }),
        (error: unknown) => error instanceof ServiceError && error.code === "AI_NOT_CONFIGURED",
    );
    assert.equal(stores.get(currentTenant.id)?.records[0].status, "failed");
});

test("repete uma falha transitória e registra o número de tentativas", async () => {
    const provider = new FakeProvider(async (_request, call) => {
        if (call === 1) throw new AiProviderFailure("unavailable");
        return { data: { summary: "recuperou" } };
    });
    const stores = new Map<string, FakeExecutionStore>();
    const run = runner(provider, stores);
    const currentTenant = tenant("4");

    await run(currentTenant, actor, tool(), { amount: 20, secret: "x" });
    assert.equal(provider.requests.length, 2);
    assert.equal(stores.get(currentTenant.id)?.records[0].attemptCount, 2);
});

test("normaliza timeout, rate limit, recusa e resposta incompleta", async (context) => {
    const cases = [
        { kind: "timeout", code: "AI_PROVIDER_TIMEOUT", calls: 2 },
        { kind: "rate_limit", code: "AI_PROVIDER_RATE_LIMITED", calls: 2 },
        { kind: "refusal", code: "AI_PROVIDER_REFUSED", calls: 1 },
        { kind: "incomplete", code: "AI_PROVIDER_INCOMPLETE", calls: 1 },
    ] as const;

    for (const [index, item] of cases.entries()) {
        await context.test(item.kind, async () => {
            const provider = new FakeProvider(async () => { throw new AiProviderFailure(item.kind); });
            const stores = new Map<string, FakeExecutionStore>();
            const run = runner(provider, stores);
            await assert.rejects(
                run(tenant(`5${index}`), actor, tool(), { amount: 30, secret: "x" }),
                (error: unknown) => error instanceof ServiceError && error.code === item.code,
            );
            assert.equal(provider.requests.length, item.calls);
        });
    }
});

test("cache é opt-in e separado por input, versão, modelo e tenant", async () => {
    const provider = new FakeProvider(async (_request, call) => ({ data: { summary: `call-${call}` } }));
    const stores = new Map<string, FakeExecutionStore>();
    let activeProfile = profile;
    let promptRevision = "database:prompt-1";
    const run = createAiToolRunner({
        provider,
        storeFactory: (currentTenant) => {
            const existing = stores.get(currentTenant.id);
            if (existing) return existing;
            const created = new FakeExecutionStore();
            stores.set(currentTenant.id, created);
            return created;
        },
        resolveProfile: () => activeProfile,
        resolvePrompt: async () => ({
            instructions: `Prompt ${promptRevision}`,
            revision: promptRevision,
            source: "database",
        }),
        now: () => TEST_NOW,
        sleep: async () => undefined,
    });
    const cachedTool = tool({ cacheTtlMs: 60_000 });
    const firstTenant = tenant("6");
    const input = { amount: 40, secret: "x" };

    const first = await run(firstTenant, actor, cachedTool, input);
    const cached = await run(firstTenant, actor, cachedTool, { secret: "x", amount: 40 });
    assert.equal(first.source, "provider");
    assert.equal(cached.source, "cache");
    assert.equal(provider.requests.length, 1);
    assert.equal(stores.get(firstTenant.id)?.records[1].sourceExecutionId, first.executionId);

    const firstSuccess = stores.get(firstTenant.id)?.records[0];
    assert.ok(firstSuccess);
    firstSuccess.completedAt = new Date(TEST_NOW.getTime() - 61_000);
    const expired = await run(firstTenant, actor, cachedTool, input);
    assert.equal(expired.source, "provider");

    await run(firstTenant, actor, cachedTool, { amount: 41, secret: "x" });
    await run(firstTenant, actor, tool({ version: "2", cacheTtlMs: 60_000 }), input);
    activeProfile = { ...profile, model: "other-model" };
    await run(firstTenant, actor, cachedTool, input);
    activeProfile = profile;
    await run(tenant("7"), actor, cachedTool, input);
    promptRevision = "database:prompt-2";
    await run(firstTenant, actor, cachedTool, input);
    assert.equal(provider.requests.at(-1)?.instructions, "Prompt database:prompt-2");
    assert.equal(provider.requests.length, 7);
});

test("agenda limpeza de 90 dias no máximo uma vez ao dia por tenant", async () => {
    const provider = new FakeProvider(async () => ({ data: { summary: "ok" } }));
    const stores = new Map<string, FakeExecutionStore>();
    const now = TEST_NOW;
    const run = runner(provider, stores, now);
    const currentTenant = tenant("8");

    await run(currentTenant, actor, tool(), { amount: 50, secret: "x" });
    await run(currentTenant, actor, tool(), { amount: 51, secret: "x" });
    await Promise.resolve();

    const cutoffs = stores.get(currentTenant.id)?.cleanupCutoffs ?? [];
    assert.equal(cutoffs.length, 1);
    assert.equal(cutoffs[0].toISOString(), "2026-05-27T12:00:00.000Z");
});
