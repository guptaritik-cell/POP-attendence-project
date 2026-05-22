"use client";

import { useState, useMemo, useCallback } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { AttendanceSymbol, EmployeeMonthRecord, WeekRange } from "@/types/attendance";

// ── Constants ──────────────────────────────────────────────────────────────
const PER_PAGE = 25;
const HEADER_BG  = "#22222F";
const ODD_BG     = "#1C1C28";
const EVEN_BG    = "#1A1A24";
const HOVER_BG   = "rgba(124,58,237,0.07)";

// Sticky column widths (px) — used to compute left offsets
const STICKY_WIDTHS = [40, 100, 170]; // #, ID, Name
const STICKY_LEFTS  = STICKY_WIDTHS.reduce<number[]>((acc, w, i) => {
  acc.push(i === 0 ? 0 : acc[i - 1] + STICKY_WIDTHS[i - 1]);
  return acc;
}, []);

// ── Attendance badge ───────────────────────────────────────────────────────
function Badge({ symbol }: { symbol: AttendanceSymbol }) {
  const styles: Record<string, { bg: string; color: string; label: string }> = {
    P:   { bg: "rgba(22,163,74,0.14)",  color: "#4ade80", label: "P"   },
    A:   { bg: "rgba(220,38,38,0.14)",  color: "#f87171", label: "A"   },
    WFH: { bg: "rgba(124,58,237,0.14)", color: "#a78bfa", label: "WFH" },
    HD:  { bg: "rgba(217,119,6,0.14)",  color: "#fbbf24", label: "HD"  },
    NHD: { bg: "rgba(100,100,100,0.14)",color: "#888",    label: "NH"  },
    WO:  { bg: "rgba(50,50,50,0.14)",   color: "#555",    label: "WO"  },
  };
  if (!symbol) return <span className="text-[#444]">—</span>;
  const s = styles[symbol] ?? styles.NHD;
  return (
    <span
      className="inline-flex px-1.5 py-0 rounded-full text-[10px] font-semibold whitespace-nowrap"
      style={{ background: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

// ── Att % color ────────────────────────────────────────────────────────────
function attColor(pct: number) {
  if (pct >= 90) return "#4ade80";
  if (pct >= 75) return "#fbbf24";
  return "#f87171";
}

// ── Sort icon ──────────────────────────────────────────────────────────────
function SortIcon({ col, sortConfig }: {
  col: string;
  sortConfig: { key: string; dir: "asc" | "desc" } | null;
}) {
  if (!sortConfig || sortConfig.key !== col) {
    return <ChevronsUpDown size={11} className="opacity-30" />;
  }
  return sortConfig.dir === "asc"
    ? <ChevronUp size={11} className="text-[#7C3AED]" />
    : <ChevronDown size={11} className="text-[#7C3AED]" />;
}

// ── Skeleton rows ─────────────────────────────────────────────────────────
function SkeletonRows({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={i}>
          {Array.from({ length: cols }).map((__, j) => (
            <td key={j} className="px-3 py-2">
              <Skeleton className="h-3 rounded bg-[#22222F]" style={{ width: j < 3 ? "80%" : "60%" }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────
interface AttendanceTableProps {
  records: EmployeeMonthRecord[];
  columnHeaders: string[];
  viewMode: "monthly" | "weekly";
  weekRange?: WeekRange;
  isLoading: boolean;
  onRowClick: (record: EmployeeMonthRecord) => void;
}

// ── Main component ─────────────────────────────────────────────────────────
export function AttendanceTable({
  records,
  columnHeaders,
  viewMode,
  weekRange,
  isLoading,
  onRowClick,
}: AttendanceTableProps) {
  const [page, setPage] = useState(1);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);

  // Day columns visible in current view
  const visibleHeaders = useMemo(() => {
    if (viewMode === "weekly" && weekRange) return weekRange.columnHeaders;
    return columnHeaders;
  }, [viewMode, weekRange, columnHeaders]);

  // Total column count for skeleton
  const totalCols = 3 + 8 + visibleHeaders.length; // sticky + fixed summary + day cols

  // Sort
  const sorted = useMemo(() => {
    if (!sortConfig) return records;
    const { key, dir } = sortConfig;
    return [...records].sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[key] as string | number;
      const bv = (b as unknown as Record<string, unknown>)[key] as string | number;
      if (av < bv) return dir === "asc" ? -1 : 1;
      if (av > bv) return dir === "asc" ? 1  : -1;
      return 0;
    });
  }, [records, sortConfig]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const safePage   = Math.min(page, totalPages);
  const paged      = sorted.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  function toggleSort(key: string) {
    setSortConfig(cur =>
      cur?.key === key
        ? { key, dir: cur.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    );
    setPage(1);
  }

  // Abbreviated day header (e.g. "1-Mar (Sat)" → "1")
  function shortHeader(h: string) {
    return h.split("-")[0];
  }

  // Day abbreviation for sub-label (e.g. "Sat")
  function dayAbbr(h: string) {
    const m = h.match(/\((\w+)\)/);
    return m?.[1]?.slice(0, 1) ?? "";
  }

  const thStyle: React.CSSProperties = {
    background: HEADER_BG,
    color: "#8B8A9B",
    fontSize: 11,
    fontWeight: 500,
    padding: "8px 10px",
    whiteSpace: "nowrap",
    borderBottom: "1px solid rgba(124,58,237,0.18)",
    userSelect: "none",
  };

  const stickyTh = useCallback(
    (idx: number): React.CSSProperties => ({
      ...thStyle,
      position: "sticky",
      left: STICKY_LEFTS[idx],
      zIndex: 15,
      background: HEADER_BG,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(124,58,237,0.18)" }}>
      {/* Scrollable wrapper */}
      <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 320px)" }}>
        <table
          style={{
            borderCollapse: "collapse",
            width: "max-content",
            minWidth: "100%",
            fontSize: 12,
          }}
        >
          {/* ── Header ── */}
          <thead>
            <tr>
              {/* Sticky: # */}
              <th
                style={{ ...stickyTh(0), width: STICKY_WIDTHS[0], cursor: "default" }}
              >
                #
              </th>

              {/* Sticky: Employee ID */}
              <th
                style={{ ...stickyTh(1), width: STICKY_WIDTHS[1], cursor: "pointer" }}
                onClick={() => toggleSort("employeeId")}
              >
                <span className="flex items-center gap-1">
                  EMP ID <SortIcon col="employeeId" sortConfig={sortConfig} />
                </span>
              </th>

              {/* Sticky: Employee Name */}
              <th
                style={{ ...stickyTh(2), width: STICKY_WIDTHS[2], cursor: "pointer" }}
                onClick={() => toggleSort("name")}
              >
                <span className="flex items-center gap-1">
                  Name <SortIcon col="name" sortConfig={sortConfig} />
                </span>
              </th>

              {/* Non-sticky fixed summary columns */}
              {[
                { label: "Team",    key: "team",              w: 120 },
                { label: "BU Lead", key: "buLead",            w: 90  },
                { label: "Present", key: "totalPresent",      w: 68  },
                { label: "Att %",   key: "attendancePercent", w: 64  },
                { label: "WFH",     key: "totalWFH",          w: 52  },
                { label: "WFH %",   key: "wfhPercent",        w: 60  },
                { label: "Hours",   key: "totalHours",        w: 60  },
                { label: "Hrs %",   key: "hoursPercent",      w: 56  },
              ].map(col => (
                <th
                  key={col.key}
                  style={{ ...thStyle, width: col.w, cursor: "pointer" }}
                  onClick={() => toggleSort(col.key)}
                >
                  <span className="flex items-center gap-1">
                    {col.label} <SortIcon col={col.key} sortConfig={sortConfig} />
                  </span>
                </th>
              ))}

              {/* Day columns */}
              {visibleHeaders.map(h => (
                <th key={h} style={{ ...thStyle, width: 38, textAlign: "center", padding: "6px 4px" }}>
                  <div>{shortHeader(h)}</div>
                  <div style={{ fontSize: 9, opacity: 0.6 }}>{dayAbbr(h)}</div>
                </th>
              ))}
            </tr>
          </thead>

          {/* ── Body ── */}
          <tbody>
            {isLoading ? (
              <SkeletonRows cols={totalCols} />
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={totalCols} className="text-center py-16 text-[#555] text-sm">
                  No employees found
                </td>
              </tr>
            ) : (
              paged.map((record, idx) => {
                const isHovered = hoveredId === record.employeeId;
                const baseBg    = idx % 2 === 0 ? EVEN_BG : ODD_BG;
                const rowBg     = isHovered ? HOVER_BG : baseBg;

                const tdBase: React.CSSProperties = {
                  padding: "8px 10px",
                  whiteSpace: "nowrap",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  color: "#D4D4D4",
                  background: rowBg,
                  transition: "background 0.1s",
                };

                const stickyTd = (sIdx: number): React.CSSProperties => ({
                  ...tdBase,
                  position: "sticky",
                  left: STICKY_LEFTS[sIdx],
                  zIndex: 5,
                });

                const globalIdx = (safePage - 1) * PER_PAGE + idx + 1;

                return (
                  <tr
                    key={record.employeeId}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={() => setHoveredId(record.employeeId)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => onRowClick(record)}
                  >
                    {/* Sticky cells */}
                    <td style={stickyTd(0)}>
                      <span style={{ color: "#555" }}>{globalIdx}</span>
                    </td>
                    <td style={stickyTd(1)}>
                      <span style={{ color: "#a78bfa", fontFamily: "monospace", fontSize: 11 }}>
                        {record.employeeId}
                      </span>
                    </td>
                    <td style={stickyTd(2)}>
                      <span style={{ color: "#F1F0F5", fontWeight: 500 }}>
                        {record.name}
                      </span>
                    </td>

                    {/* Summary cells */}
                    <td style={tdBase}>{record.team}</td>
                    <td style={tdBase}>{record.buLead}</td>
                    <td style={tdBase}>{record.totalPresent}</td>
                    <td style={{ ...tdBase, color: attColor(record.attendancePercent), fontWeight: 600 }}>
                      {record.attendancePercent.toFixed(1)}%
                    </td>
                    <td style={tdBase}>{record.totalWFH}</td>
                    <td style={{ ...tdBase, color: "#a78bfa" }}>
                      {record.wfhPercent.toFixed(1)}%
                    </td>
                    <td style={tdBase}>{record.totalHours}h</td>
                    <td style={{ ...tdBase, color: "#94a3b8" }}>
                      {record.hoursPercent.toFixed(1)}%
                    </td>

                    {/* Day cells */}
                    {visibleHeaders.map(h => {
                      const day = record.days.find(d => d.date === h);
                      return (
                        <td
                          key={h}
                          style={{ ...tdBase, textAlign: "center", padding: "7px 4px" }}
                        >
                          <Badge symbol={day?.symbol ?? ""} />
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination footer ── */}
      <div
        className="flex items-center justify-between px-4 py-3 text-xs"
        style={{ background: HEADER_BG, borderTop: "1px solid rgba(124,58,237,0.15)" }}
      >
        <span style={{ color: "#8B8A9B" }}>
          Showing{" "}
          <span style={{ color: "#F1F0F5" }}>
            {Math.min((safePage - 1) * PER_PAGE + 1, sorted.length)}–
            {Math.min(safePage * PER_PAGE, sorted.length)}
          </span>{" "}
          of{" "}
          <span style={{ color: "#F1F0F5" }}>{sorted.length}</span> employees
        </span>

        <div className="flex items-center gap-1">
          <PagButton disabled={safePage <= 1} onClick={() => setPage(1)} label="«" />
          <PagButton disabled={safePage <= 1} onClick={() => setPage(p => p - 1)} label="‹" />
          {getPageNumbers(safePage, totalPages).map((p, i) =>
            p === "…" ? (
              <span key={i} style={{ color: "#555", padding: "0 4px" }}>…</span>
            ) : (
              <PagButton
                key={i}
                disabled={false}
                onClick={() => setPage(p as number)}
                label={String(p)}
                active={p === safePage}
              />
            )
          )}
          <PagButton disabled={safePage >= totalPages} onClick={() => setPage(p => p + 1)} label="›" />
          <PagButton disabled={safePage >= totalPages} onClick={() => setPage(totalPages)} label="»" />
        </div>
      </div>
    </div>
  );
}

// ── Pagination button ────────────────────────────────────────────────────────
function PagButton({
  disabled, onClick, label, active,
}: { disabled: boolean; onClick: () => void; label: string; active?: boolean }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="w-7 h-7 flex items-center justify-center rounded text-xs transition-colors"
      style={{
        background: active ? "rgba(124,58,237,0.3)" : "transparent",
        color: disabled ? "#444" : active ? "#F1F0F5" : "#8B8A9B",
        cursor: disabled ? "not-allowed" : "pointer",
        border: active ? "1px solid rgba(124,58,237,0.5)" : "1px solid transparent",
      }}
    >
      {label}
    </button>
  );
}

// ── Page numbers with ellipsis ──────────────────────────────────────────────
function getPageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "…")[] = [];
  const add = (p: number | "…") => { if (pages[pages.length - 1] !== p) pages.push(p); };
  [1, 2, current - 1, current, current + 1, total - 1, total].forEach(p => {
    if (typeof p === "number" && p >= 1 && p <= total) add(p);
    else if (typeof p === "number" && (p === current - 1 || p === current + 1)) add("…");
  });
  return pages;
}
