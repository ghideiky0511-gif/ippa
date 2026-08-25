import type { PoolClient } from "pg";
import type { CartItem } from "@/lib/types";
import { closeOrderBookRow, type OrderBookRow } from "@/models/orderBooksModel";
import {
    listOrderSessionItemRowsByBook,
    listOrderSessionRowsByBook,
    type OrderSessionRow,
} from "@/models/ordersModel";

export interface OrderBookSessionState {
    sessions: OrderSessionRow[];
    itemsBySession: Map<string, CartItem[]>;
    allCancellableSessionsEmpty: boolean;
    allSessionsFinished: boolean;
}

// Mantém em um único lugar as duas consultas usadas pelas regras do talão.
// Cancelar olha somente os pedidos ainda abertos; os já fechados/cancelados
// são histórico e entram apenas na regra de fechamento do talão.
export async function getOrderBookSessionState(
    client: PoolClient,
    orderBookId: string,
): Promise<OrderBookSessionState> {
    const [sessions, itemRows] = await Promise.all([
        listOrderSessionRowsByBook(client, orderBookId),
        listOrderSessionItemRowsByBook(client, orderBookId),
    ]);
    const itemsBySession = new Map<string, CartItem[]>();
    for (const item of itemRows) {
        const items = itemsBySession.get(item.session_id) ?? [];
        items.push(item.snapshot);
        itemsBySession.set(item.session_id, items);
    }
    return {
        sessions,
        itemsBySession,
        allCancellableSessionsEmpty: sessions
            .filter((session) => session.status === "aberto" || session.status === "aguardando_pagamento")
            .every((session) =>
                (itemsBySession.get(session.id) ?? []).every((item) => item.qty <= 0),
            ),
        allSessionsFinished: sessions.length > 0 && sessions.every((session) =>
            session.status === "fechado" || session.status === "cancelado",
        ),
    };
}

// Deve ser chamado na mesma transação que alterou uma sessão. Assim, todos os
// caminhos de finalização (manual, link e checkout da cliente) seguem a mesma regra.
export async function closeOrderBookWhenFinished(
    client: PoolClient,
    orderBookId: string,
): Promise<OrderBookRow | null> {
    const state = await getOrderBookSessionState(client, orderBookId);
    if (!state.allSessionsFinished) return null;
    return closeOrderBookRow(client, orderBookId);
}
