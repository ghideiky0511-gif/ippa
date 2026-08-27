import assert from "node:assert/strict";
import test from "node:test";
import { updatesRoomsForUser } from "./updateBroadcast";

const tenantId = "tenant-1";

test("vendedora entra só na própria sellerRoom", () => {
    const rooms = updatesRoomsForUser(tenantId, { id: "seller-1", role: "vendedora" });
    assert.deepEqual(rooms, ["updates:seller:tenant-1:seller-1"]);
});

test("cliente com clientId entra só na própria clientRoom", () => {
    const rooms = updatesRoomsForUser(tenantId, { id: "user-1", role: "cliente", clientId: "client-1" });
    assert.deepEqual(rooms, ["updates:client:tenant-1:client-1"]);
});

// Bloqueador B1 do plano de realtime incremental: sem clientId não há como
// escopar a room a uma única cliente. Cair no tenantRoom (comportamento
// antigo) vazaria toda a fila da loja pra ela assim que o canal passasse a
// carregar payload — hoje é inofensivo só porque o canal é sinal sem dados.
test("cliente sem clientId não entra em nenhuma room (não vaza pro tenant inteiro)", () => {
    const rooms = updatesRoomsForUser(tenantId, { id: "user-1", role: "cliente" });
    assert.deepEqual(rooms, []);
});

// Bloqueador B2: administrador/expedição/entregador veem a fila do tenant
// inteiro (orderSessions/userOrders devolvem tudo pra esses papéis), mas
// talões são sempre escopados ao próprio vendedor (orderBookService.ts) —
// mesmo pra quem tem adminAccess. Por isso também precisam da própria
// sellerRoom, senão nunca recebem os `book_upsert` dos talões que eles
// mesmos possuem quando usam o talão como vendedora.
test("administrador entra no tenantRoom E na própria sellerRoom", () => {
    const rooms = updatesRoomsForUser(tenantId, { id: "admin-1", role: "administrador" });
    assert.deepEqual(rooms, ["updates:tenant:tenant-1", "updates:seller:tenant-1:admin-1"]);
});

test("expedição e entregador seguem o mesmo caminho do administrador", () => {
    assert.deepEqual(
        updatesRoomsForUser(tenantId, { id: "exp-1", role: "expedicao" }),
        ["updates:tenant:tenant-1", "updates:seller:tenant-1:exp-1"],
    );
    assert.deepEqual(
        updatesRoomsForUser(tenantId, { id: "ent-1", role: "entregador" }),
        ["updates:tenant:tenant-1", "updates:seller:tenant-1:ent-1"],
    );
});
