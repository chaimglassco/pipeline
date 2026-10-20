import type { Tool } from "@modelcontextprotocol/client";
import { unwrapScaleInsightsPayload, type ScaleInsightsToolCaller } from "./scale-insights-performance";

export type SqpRow = { query: string; impressions: number; clicks: number; cartAdds: number; orders: number; conversionRate: number | null };
export type SqpReport = { asin: string; country: string; startDate: string; endDate: string; dataThrough: string | null; rows: SqpRow[]; complete: boolean };

export function sqpWeek(weekStart: string, today = new Date().toISOString().slice(0, 10)) {
  const end = new Date(`${weekStart}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  const yesterday = new Date(`${today}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (end > yesterday) end.setTime(yesterday.getTime());
  end.setUTCDate(end.getUTCDate() - (end.getUTCDay() + 1) % 7);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

export async function loadSqp(params: { asin: string; country: string; startDate: string; endDate: string }, definitions: Tool[], call: ScaleInsightsToolCaller): Promise<SqpReport> {
  const tool = definitions.find(item => item.name === "get_search_query_data" || item.name.endsWith("_get_search_query_data"));
  if (!tool) throw new Error("Search Query Performance is not available from this Scale Insights connection.");
  const rows = new Map<string, SqpRow>();
  let dataThrough: string | null = null;
  let complete = false;
  for (let page = 1; page <= 20; page++) {
    const payload = unwrapScaleInsightsPayload(await call(tool.name, { asin_list: [params.asin], country: params.country, start_date: params.startDate, end_date: params.endDate, mode: "raw", count: 100, page, include_capture_gaps: false })) as Record<string, unknown>;
    if (payload.Country !== params.country || !Array.isArray(payload.AsinList) || payload.AsinList.length !== 1 || payload.AsinList[0] !== params.asin || payload.StartDate !== params.startDate || payload.EndDate !== params.endDate) throw new Error("SQP response did not confirm the requested ASIN, marketplace, and dates.");
    if (!Array.isArray(payload.Queries)) throw new Error("Scale Insights returned unreadable SQP data.");
    for (const raw of payload.Queries) {
      const row = raw as Record<string, unknown>;
      if (row.ASIN !== params.asin || typeof row.Query !== "string") throw new Error("SQP returned a row outside the selected ASIN.");
      const values = [row.AsinImpressions, row.AsinClicks, row.AsinCartAdd, row.AsinPurchase];
      if (!values.every(value => typeof value === "number" && Number.isFinite(value) && value >= 0)) throw new Error("SQP is missing required ASIN funnel metrics.");
      const [impressions, clicks, cartAdds, orders] = values as number[];
      const key = row.Query.trim().replace(/\s+/g, " ").toLowerCase();
      if (rows.has(key)) throw new Error("SQP pagination returned duplicate queries; totals could not be confirmed.");
      rows.set(key, { query: row.Query, impressions, clicks, cartAdds, orders, conversionRate: clicks ? orders / clicks * 100 : null });
    }
    const meta = payload.Meta as Record<string, unknown> | undefined;
    if (typeof meta?.data_through === "string") dataThrough = meta.data_through;
    if (meta?.has_next_page === false && meta.total_count === rows.size) { complete = true; break; }
    if (meta?.has_next_page !== true) break;
  }
  return { ...params, rows: [...rows.values()], dataThrough, complete };
}
