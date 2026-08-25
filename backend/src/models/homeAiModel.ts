import type { PoolClient } from "pg";
import type { HomeSection } from "@/lib/types";

export interface HomeAiHistoryRow {
  id: string;
  prompt: string;
  sections: HomeSection[];
  created_at: Date;
}

export async function listHomeAiHistoryRows(client: PoolClient): Promise<HomeAiHistoryRow[]> {
  const result = await client.query<HomeAiHistoryRow>(
    `SELECT id, prompt, sections, created_at FROM home_ai_history
     WHERE tenant_id = app_tenant_id() ORDER BY created_at DESC LIMIT 50`,
  );
  return result.rows;
}

export async function insertHomeAiHistoryRow(
  client: PoolClient,
  prompt: string,
  sections: HomeSection[],
): Promise<HomeAiHistoryRow> {
  const result = await client.query<HomeAiHistoryRow>(
    `INSERT INTO home_ai_history (tenant_id, prompt, sections)
     VALUES (app_tenant_id(), $1, $2) RETURNING id, prompt, sections, created_at`,
    [prompt, JSON.stringify(sections)],
  );
  return result.rows[0];
}
