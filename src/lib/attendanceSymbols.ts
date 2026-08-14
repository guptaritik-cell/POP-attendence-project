import type { AttendanceSymbol } from "@/types/attendance";

export type SymbolCategory = "present" | "absent" | "leave" | "off";

export interface SymbolMeta {
  code: Exclude<AttendanceSymbol, "">;
  fullName: string;
  category: SymbolCategory;
  bg: string;
  color: string;
}

// ── Single source of truth for every attendance symbol ──────────────────────
// To add a new leave type in future: add one entry here with category "leave".
// Parsing (sheets.ts parseSymbol/LEAVE_SYMBOL), totals (computeRecord and the
// other per-page recomputes), table/calendar badges, and the Annotation legend
// page all read from this map — no other file needs to change.
export const SYMBOL_META: Record<Exclude<AttendanceSymbol, "">, SymbolMeta> = {
  P:   { code: "P",   fullName: "Present",          category: "present", bg: "rgba(22,163,74,0.14)",   color: "#4ade80" },
  A:   { code: "A",   fullName: "Absent",           category: "absent",  bg: "rgba(220,38,38,0.14)",   color: "#f87171" },
  WFH: { code: "WFH", fullName: "Work From Home",   category: "present", bg: "rgba(255,77,0,0.14)",    color: "#FF7A35" },
  HD:  { code: "HD",  fullName: "Half Day",         category: "present", bg: "rgba(217,119,6,0.14)",   color: "#fbbf24" },
  NHD: { code: "NHD", fullName: "National Holiday", category: "off",     bg: "rgba(100,100,100,0.14)", color: "#888888" },
  WO:  { code: "WO",  fullName: "Week Off",         category: "off",     bg: "rgba(50,50,50,0.14)",    color: "#555555" },
  ML:  { code: "ML",  fullName: "Menstrual Leave",  category: "leave",   bg: "rgba(236,72,153,0.14)",  color: "#f472b6" },
  SL:  { code: "SL",  fullName: "Sick Leave",       category: "leave",   bg: "rgba(251,146,60,0.14)",  color: "#fb923c" },
  PL:  { code: "PL",  fullName: "Paid Leave",       category: "leave",   bg: "rgba(234,179,8,0.14)",   color: "#eab308" },
  ADL: { code: "ADL", fullName: "Adoption Leave",    category: "leave",  bg: "rgba(45,212,191,0.14)",  color: "#2dd4bf" },
  BEL: { code: "BEL", fullName: "Bereavement Leave", category: "leave",  bg: "rgba(148,163,184,0.14)", color: "#94a3b8" },
  COL: { code: "COL", fullName: "Comp Off",          category: "leave",  bg: "rgba(56,189,248,0.14)",  color: "#38bdf8" },
  MRL: { code: "MRL", fullName: "Marriage Leave",    category: "leave",  bg: "rgba(232,121,249,0.14)", color: "#e879f9" },
  MAL: { code: "MAL", fullName: "Maternity Leave",   category: "leave",  bg: "rgba(244,114,182,0.14)", color: "#f9a8d4" },
  MIL: { code: "MIL", fullName: "Miscarriage Leave", category: "leave",  bg: "rgba(168,85,247,0.14)",  color: "#a78bfa" },
  UNL: { code: "UNL", fullName: "Unpaid Leave",      category: "leave",  bg: "rgba(120,113,108,0.14)", color: "#a8a29e" },
};

export const SYMBOL_LIST: SymbolMeta[] = Object.values(SYMBOL_META);

// Leave codes beyond the 3 that already have dedicated named counters
// (totalML/totalSL/totalPL). These are tallied generically into
// EmployeeMonthRecord.otherLeaves, keyed by code.
export const OTHER_LEAVE_CODES: string[] = SYMBOL_LIST
  .filter(m => m.category === "leave" && m.code !== "ML" && m.code !== "SL" && m.code !== "PL")
  .map(m => m.code);

export function emptyOtherLeaves(): Record<string, number> {
  return Object.fromEntries(OTHER_LEAVE_CODES.map(code => [code, 0]));
}

export function badgeStyle(symbol: AttendanceSymbol | string): { bg: string; color: string; label: string } {
  const meta = SYMBOL_META[symbol as Exclude<AttendanceSymbol, "">];
  if (!meta) return { bg: "transparent", color: "#333333", label: "—" };
  return { bg: meta.bg, color: meta.color, label: meta.code === "NHD" ? "NH" : meta.code };
}
