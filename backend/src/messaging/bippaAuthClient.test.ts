import assert from "node:assert/strict";
import test from "node:test";
import { getApiKey } from "./bippaAuthClient";

const ORIGINAL_ENV = { ...process.env };

function restoreEnv(): void {
    process.env = { ...ORIGINAL_ENV };
}

test("getApiKey devolve BIPPA_CATALOGO_API_KEY do ambiente", () => {
    process.env.BIPPA_CATALOGO_API_KEY = "bippa_1fa532e55c315cc6612aa37c_segredo";
    try {
        assert.equal(getApiKey(), "bippa_1fa532e55c315cc6612aa37c_segredo");
    } finally {
        restoreEnv();
    }
});

test("getApiKey lança erro claro quando BIPPA_CATALOGO_API_KEY não está configurada", () => {
    delete process.env.BIPPA_CATALOGO_API_KEY;
    try {
        assert.throws(() => getApiKey(), /BIPPA_CATALOGO_API_KEY/);
    } finally {
        restoreEnv();
    }
});
