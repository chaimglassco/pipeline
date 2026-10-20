import { getSelectedMonthWeekStarts } from "./ppc-dashboard-state";

export const PPC_WORKSPACE_SELECTION_KEY = "glassco.ppcWorkspaceSelection.v1";

export type PpcWorkspaceSelection = {
  productId: string;
  weekStart: string;
  selectedMonths: string[];
};

const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export function parsePpcWorkspaceSelection(raw: string | null, currentWeekStart: string): PpcWorkspaceSelection | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!record(value) || value.version !== 1 || typeof value.productId !== "string" || !value.productId.trim()
      || value.productId.length > 160 || typeof value.weekStart !== "string" || !Array.isArray(value.selectedMonths)
      || value.selectedMonths.length < 1 || value.selectedMonths.length > 24
      || !value.selectedMonths.every(month => typeof month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(month))) return null;
    const selectedMonths = [...new Set(value.selectedMonths as string[])].sort();
    if (!getSelectedMonthWeekStarts(selectedMonths, currentWeekStart).includes(value.weekStart)) return null;
    return { productId: value.productId.trim(), weekStart: value.weekStart, selectedMonths };
  } catch { return null; }
}

export function serializePpcWorkspaceSelection(selection: PpcWorkspaceSelection) {
  return JSON.stringify({ version: 1, ...selection });
}
