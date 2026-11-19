"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import {
  CalendarDays, CheckCircle2, XCircle, TrendingUp, Clock, Loader2, AlertCircle,
  Download, Target, Users, Timer, Hourglass, LogIn, LogOut, AlarmClock, ArrowUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAttendanceStore } from "@/lib/store";
import { SYMBOL_META } from "@/lib/attendanceSymbols";
import { calculationRows } from "@/lib/summaryCalc";

// ── API response shape (team / master scope) ─────────────────────────────────
interface Summary {
  present: number;
  wfh: number;
  absent: number;
  halfDay: number;
  leaves: Record<string, number> & { total: number };
  weekOff: number;
  holiday: number;
  workingDays: number;
  attendancePercent: number;
  wfhPercent: number;
}
interface TimeMetrics {
  totalHours: string;
  totalMinutes: number;
  avgHoursPerDay: string;
  avgClockIn: string | null;
  avgClockOut: string | null;
  lateArrivals: number;
  earlyDepartures: number;
  overtimeHours: string;
  overtimeMinutes?: number;
  punctualityPercent: number;
  daysWithData: number;
}
interface EmployeeRow {
  employee: { employeeId: string; name: string; team: string; buLead: string };
  summary: Summary;
  totalMinutes: number;
  totalHours: string | null;
  avgHoursPerDay: string | null;
  lateArrivals: number;
}
interface TeamRow {
  team: string;
  employeeCount: number;
  summary: Summary;
  timeMetrics: TimeMetrics | null;
}
interface GroupResponse {
  success: boolean;
  scope: "team" | "master";
  team: string | null;
  range: { from: string; to: string; label: string };
  employeeCount: number;
  summary: Summary;
  timeMetrics: TimeMetrics | null;
  teams: TeamRow[];
  employees: EmployeeRow[];
}

const LEAVE_CODES = Object.values(SYMBOL_META).filter(m => m.category === "leave").map(m => m.code);

function attColor(pct: number) {
  return pct >= 90 ? "#4ade80" : pct >= 75 ? "#fbbf24" : "#f87171";
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function firstOfMonthISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function StatPill({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: string | number; color?: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: "#222222" }}>
      <div className="text-[#888888]">{icon}</div>
      <div>
        <p className="text-xs text-[#888888]">{label}</p>
        <p className="text-lg font-semibold mt-0.5" style={{ color: color ?? "#F5F5F5" }}>{value}</p>
      </div>
    </div>
  );
}

const cardStyle = { background: "#181818", border: "1px solid rgba(255,77,0,0.15)" };

// ── Sortable employee table ──────────────────────────────────────────────────
type SortKey = "name" | "team" | "present" | "wfh" | "halfDay" | "absent" | "leaves" | "workingDays" | "att" | "hours";

function sortValue(r: EmployeeRow, k: SortKey): string | number {
  switch (k) {
    case "name":        return r.employee.name.toLowerCase();
    case "team":        return r.employee.team.toLowerCase();
    case "present":     return r.summary.present;
    case "wfh":         return r.summary.wfh;
    case "halfDay":     return r.summary.halfDay;
    case "absent":      return r.summary.absent;
    case "leaves":      return r.summary.leaves.total;
    case "workingDays": return r.summary.workingDays;
    case "att":         return r.summary.attendancePercent;
    case "hours":       return r.totalMinutes;
  }
}

function SortTh({ k, label, right, active, onSort }: {
  k: SortKey; label: string; right: boolean; active: boolean; onSort: (k: SortKey) => void;
}) {
  return (
    <th
      onClick={() => onSort(k)}
      className={`px-3 py-2.5 text-[11px] font-medium text-[#888888] cursor-pointer select-none whitespace-nowrap ${right ? "text-right" : "text-left"}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown size={10} className={active ? "text-[#FF7A35]" : "text-[#444]"} />
      </span>
    </th>
  );
}

function EmployeeTable({ rows, showTeam }: { rows: EmployeeRow[]; showTeam: boolean }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: showTeam ? "team" : "name", dir: 1 });
  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const va = sortValue(a, sort.key), vb = sortValue(b, sort.key);
      const c = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return c * sort.dir || a.employee.name.localeCompare(b.employee.name);
    });
  }, [rows, sort]);

  const onSort = (k: SortKey) =>
    setSort(s => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : (k === "name" || k === "team" ? 1 : -1) }));
  const th = (k: SortKey, label: string, right = false) => (
    <SortTh k={k} label={label} right={right} active={sort.key === k} onSort={onSort} />
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead style={{ borderBottom: "1px solid rgba(255,77,0,0.15)" }}>
          <tr>
            <th className="px-3 py-2.5 text-[11px] font-medium text-[#888888] text-left">#</th>
            <th className="px-3 py-2.5 text-[11px] font-medium text-[#888888] text-left">EMP ID</th>
            {th("name", "Name")}
            {showTeam && th("team", "Team")}
            {th("present", "Present", true)}
            {th("wfh", "WFH", true)}
            {th("halfDay", "Half Days", true)}
            {th("absent", "Absent", true)}
            {th("leaves", "Leaves", true)}
            {th("workingDays", "Working Days", true)}
            {th("att", "Att %", true)}
            <th className="px-3 py-2.5 text-[11px] font-medium text-[#888888] text-right whitespace-nowrap">WFH %</th>
            {th("hours", "Hours", true)}
            <th className="px-3 py-2.5 text-[11px] font-medium text-[#888888] text-right whitespace-nowrap">Avg / Day</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={r.employee.employeeId} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <td className="px-3 py-2 text-[#555]">{i + 1}</td>
              <td className="px-3 py-2 text-[#FF7A35] font-mono text-xs">{r.employee.employeeId}</td>
              <td className="px-3 py-2 text-[#F5F5F5] whitespace-nowrap">{r.employee.name}</td>
              {showTeam && <td className="px-3 py-2 text-[#aaaaaa] whitespace-nowrap">{r.employee.team}</td>}
              <td className="px-3 py-2 text-right text-[#4ade80]">{r.summary.present}</td>
              <td className="px-3 py-2 text-right text-[#FF7A35]">{r.summary.wfh}</td>
              <td className="px-3 py-2 text-right text-[#fbbf24]">{r.summary.halfDay}</td>
              <td className="px-3 py-2 text-right" style={{ color: r.summary.absent > 0 ? "#f87171" : "#888888" }}>{r.summary.absent}</td>
              <td className="px-3 py-2 text-right text-[#f472b6]">{r.summary.leaves.total}</td>
              <td className="px-3 py-2 text-right text-[#94a3b8]">{r.summary.workingDays}</td>
              <td className="px-3 py-2 text-right font-semibold" style={{ color: attColor(r.summary.attendancePercent) }}>
                {r.summary.attendancePercent}%
              </td>
              <td className="px-3 py-2 text-right text-[#aaaaaa]">{r.summary.wfhPercent}%</td>
              <td className="px-3 py-2 text-right text-[#06b6d4] whitespace-nowrap">{r.totalHours ?? "—"}</td>
              <td className="px-3 py-2 text-right text-[#aaaaaa] whitespace-nowrap">{r.avgHoursPerDay ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export function GroupSummary({ scope }: { scope: "team" | "master" }) {
  const { data: session } = useSession();
  const isManager   = session?.user?.role === "manager";
  const managerTeam = session?.user?.team ?? "";

  const monthData = useAttendanceStore(s => s.monthData);
  const teams = useMemo(
    () => [...new Set((monthData?.records ?? []).map(r => r.team))].filter(Boolean).sort(),
    [monthData],
  );

  const [team, setTeam]         = useState("");
  const [fromDate, setFromDate] = useState(firstOfMonthISO());
  const [toDate, setToDate]     = useState(todayISO());
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [result, setResult]     = useState<GroupResponse | null>(null);

  const effectiveTeam = isManager ? managerTeam : team;
  const canGenerate = !!fromDate && !!toDate && !loading && (scope === "master" || !!effectiveTeam);

  async function handleGenerate() {
    if (scope === "team" && !effectiveTeam) { setError("Please select a team first."); return; }
    if (toDate < fromDate) { setError("The 'to' date cannot be earlier than the 'from' date."); return; }
    setLoading(true); setError(""); setResult(null);
    try {
      const params = new URLSearchParams({ scope, from: fromDate, to: toDate });
      if (scope === "team") params.set("team", effectiveTeam);
      const res  = await fetch(`/api/attendance/summary?${params.toString()}`);
      const data = await res.json();
      if (!res.ok || !data.success) { setError(data.message ?? "Failed to generate summary."); return; }
      setResult(data as GroupResponse);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function downloadReportXlsx() {
    if (!result) return;
    const { downloadReport } = await import("@/lib/reportXlsx");
    const isTeam = result.scope === "team";
    const buLeads = [...new Set(result.employees.map(e => e.employee.buLead).filter(Boolean))];
    const name = isTeam ? (result.team ?? "Team") : result.team ? `All employees · ${result.team}` : "All employees";
    downloadReport(
      {
        kind: result.scope,
        identity: {
          id: String(result.employeeCount),
          name,
          team: isTeam ? (result.team ?? "") : `All teams (${result.teams.length})`,
          buLead: isTeam ? (buLeads.join(", ") || "—") : "—",
        },
        range: result.range,
        summary: result.summary,
        timeMetrics: result.timeMetrics,
        employees: result.employees,
        teams: result.teams,
      },
      `${isTeam ? `${(result.team ?? "Team").replace(/[^a-z0-9]+/gi, "_")}_Team` : "Master"}_Attendance_Report_${result.range.from}_to_${result.range.to}.xlsx`,
    );
  }

  function downloadCSV() {
    if (!result) return;
    const esc = (v: string | number) => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const title = scope === "team" ? `Team Summary — ${result.team}` : "Master Summary";
    const s = result.summary;
    const rows: (string | number)[][] = [
      [title],
      ["Date Range", result.range.label],
      ["From", result.range.from],
      ["To", result.range.to],
      ["Employees", result.employeeCount],
      [],
      ["Overall", "Value"],
      ["Present", s.present],
      ["WFH", s.wfh],
      ["WFH %", `${s.wfhPercent}%`],
      ["Half Days", s.halfDay],
      ["Absent", s.absent],
      ["Total Leaves", s.leaves.total],
      ["Working Days", s.workingDays],
      ["Attendance %", `${s.attendancePercent}%`],
    ];
    if (result.timeMetrics) rows.push(["Total Hours", result.timeMetrics.totalHours], ["Avg Hours / Day", result.timeMetrics.avgHoursPerDay]);

    rows.push(
      [],
      ["How it's calculated (overall — every employee row below uses the same formulas)"],
      ["Metric", "Formula", "Calculation", "Result"],
      ...calculationRows(result.summary, result.timeMetrics),
    );

    if (scope === "master") {
      rows.push([], ["Team", "Employees", "Present", "WFH", "Half Days", "Absent", "Leaves", "Working Days", "Attendance %", "WFH %", "Total Hours"]);
      for (const t of result.teams) {
        rows.push([
          t.team, t.employeeCount, t.summary.present, t.summary.wfh, t.summary.halfDay, t.summary.absent,
          t.summary.leaves.total, t.summary.workingDays, `${t.summary.attendancePercent}%`, `${t.summary.wfhPercent}%`,
          t.timeMetrics?.totalHours ?? "—",
        ]);
      }
    }

    rows.push([], [
      "Employee ID", "Name", "Team", "BU Lead", "Present", "WFH", "Half Days", "Absent",
      ...LEAVE_CODES, "Total Leaves", "Working Days", "Attendance %", "Attendance % calculation", "WFH %", "WFH % calculation",
      "Total Hours", "Avg Hours / Day", "Late Arrivals",
    ]);
    for (const e of result.employees) {
      rows.push([
        e.employee.employeeId, e.employee.name, e.employee.team, e.employee.buLead,
        e.summary.present, e.summary.wfh, e.summary.halfDay, e.summary.absent,
        ...LEAVE_CODES.map(c => e.summary.leaves[c] ?? 0),
        e.summary.leaves.total, e.summary.workingDays,
        `${e.summary.attendancePercent}%`,
        `(${e.summary.present} + ${e.summary.wfh} + 0.5 × ${e.summary.halfDay}) ÷ ${e.summary.workingDays} × 100`,
        `${e.summary.wfhPercent}%`,
        `${e.summary.wfh} ÷ ${e.summary.workingDays} × 100`,
        e.totalHours ?? "—", e.avgHoursPerDay ?? "—", e.lateArrivals,
      ]);
    }

    const csv  = rows.map(r => r.map(esc).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    const slug = scope === "team" ? `team-${(result.team ?? "").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}` : "master";
    a.download = `summary-${slug}-${result.range.from}_to_${result.range.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const dateInputClass =
    "h-9 px-3 text-sm rounded-md bg-[#181818] border border-[rgba(255,77,0,0.3)] text-[#F5F5F5] " +
    "focus:border-[#FF4D00] focus:outline-none focus:ring-1 focus:ring-[#FF4D00] [color-scheme:dark]";

  const title = result
    ? (result.scope === "team" ? result.team : result.team ? `All employees · ${result.team}` : "All employees")
    : "";

  return (
    <>
      {/* ── Controls ── */}
      <div className="px-4 sm:px-6 py-4" style={{ borderBottom: "1px solid rgba(255,77,0,0.08)" }}>
        <div className="flex flex-wrap items-end gap-3">
          {scope === "team" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-[#888888]">Team</label>
              {isManager ? (
                <div className="h-9 px-3 flex items-center text-sm rounded-md bg-[#181818] border border-[rgba(255,77,0,0.3)] text-[#F5F5F5] w-full sm:w-56">
                  {managerTeam || "—"}
                </div>
              ) : (
                <Select value={team} onValueChange={setTeam}>
                  <SelectTrigger className="h-9 w-full sm:w-56 text-sm bg-[#181818] border-[rgba(255,77,0,0.3)] text-[#F5F5F5]">
                    <SelectValue placeholder={teams.length ? "Select a team" : "Loading teams…"} />
                  </SelectTrigger>
                  <SelectContent className="bg-[#181818] border-[rgba(255,77,0,0.3)]">
                    {teams.map(t => (
                      <SelectItem key={t} value={t} className="text-[#F5F5F5] focus:bg-[rgba(255,77,0,0.12)]">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-[#888888]">From date</label>
            <input type="date" value={fromDate} max={toDate || undefined} onChange={e => setFromDate(e.target.value)} className={dateInputClass} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-[#888888]">To date</label>
            <input type="date" value={toDate} min={fromDate || undefined} onChange={e => setToDate(e.target.value)} className={dateInputClass} />
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="h-9 px-5 rounded-md text-white font-semibold text-sm border-0 disabled:opacity-50"
            style={{ background: "radial-gradient(circle at 35% 35%, #FF7A35 0%, #FF4D00 55%, #CC1F00 100%)" }}
          >
            {loading
              ? <span className="flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Generating…</span>
              : "Generate Summary"}
          </Button>
        </div>
        {scope === "master" && isManager && (
          <p className="text-[11px] text-[#888888] mt-2">As a manager, the master summary covers your team ({managerTeam}).</p>
        )}
      </div>

      {/* ── Body ── */}
      <div className="px-4 sm:px-6 pt-6">
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl mb-5" style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)" }}>
            <AlertCircle size={16} className="text-[#f87171]" />
            <span className="text-sm text-[#f87171]">{error}</span>
          </div>
        )}

        {!result && !error && !loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(255,77,0,0.12)" }}>
              <CalendarDays size={28} className="text-[#FF4D00]" />
            </div>
            <p className="text-sm text-[#888888]">
              {scope === "team"
                ? "Select a team and a date range, then generate the summary."
                : "Select a date range, then generate the summary for all employees."}
            </p>
          </div>
        )}

        {result && (
          <motion.div
            key={`${result.scope}-${result.team}-${result.range.from}-${result.range.to}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="space-y-5"
          >
            {/* Header */}
            <div className="rounded-xl p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4" style={cardStyle}>
              <div>
                <h2 className="text-xl font-semibold text-[#F5F5F5]">{title}</h2>
                <div className="flex items-center gap-4 mt-2 flex-wrap text-xs text-[#888888]">
                  <span className="flex items-center gap-1.5"><Users size={12} /> {result.employeeCount} employees</span>
                  {result.scope === "master" && <span>{result.teams.length} teams</span>}
                  <span className="flex items-center gap-1.5"><CalendarDays size={12} /> {result.range.label}</span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-xs text-[#888888]">Overall Attendance</p>
                  <p className="text-3xl font-bold" style={{ color: attColor(result.summary.attendancePercent) }}>
                    {result.summary.attendancePercent}%
                  </p>
                </div>
                <Button
                  onClick={downloadCSV}
                  className="h-9 px-4 rounded-md text-sm font-medium border border-[rgba(255,77,0,0.3)] bg-[#181818] text-[#F5F5F5] hover:bg-[rgba(255,77,0,0.1)]"
                >
                  <Download size={14} className="mr-2" /> CSV
                </Button>
                <Button
                  onClick={downloadReportXlsx}
                  className="h-9 px-4 rounded-md text-sm font-semibold text-white border-0"
                  style={{ background: "linear-gradient(135deg, #FF4D00, #FF7A35)" }}
                >
                  <Download size={14} className="mr-2" /> Download Report (.xlsx)
                </Button>
              </div>
            </div>

            {/* Totals */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3">
              <StatPill icon={<CheckCircle2 size={18} />} label="Present"      value={result.summary.present} color="#4ade80" />
              <StatPill icon={<TrendingUp size={18} />}   label="WFH"          value={`${result.summary.wfh} · ${result.summary.wfhPercent}%`} color="#FF7A35" />
              <StatPill icon={<Clock size={18} />}        label="Half Days"    value={result.summary.halfDay} color="#fbbf24" />
              <StatPill icon={<XCircle size={18} />}      label="Absent"       value={result.summary.absent} color={result.summary.absent > 0 ? "#f87171" : "#4ade80"} />
              <StatPill icon={<CalendarDays size={18} />} label="Working Days" value={result.summary.workingDays} color="#94a3b8" />
              <StatPill icon={<Target size={18} />}       label="Leaves"       value={result.summary.leaves.total} color="#f472b6" />
            </div>

            {result.timeMetrics && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <StatPill icon={<Timer size={18} />}      label="Total Hours"     value={result.timeMetrics.totalHours} color="#06b6d4" />
                <StatPill icon={<Hourglass size={18} />}  label="Avg Hours / Day" value={result.timeMetrics.avgHoursPerDay} color="#06b6d4" />
                <StatPill icon={<LogIn size={18} />}      label="Avg Clock-In"    value={result.timeMetrics.avgClockIn ?? "—"} color="#4ade80" />
                <StatPill icon={<LogOut size={18} />}     label="Avg Clock-Out"   value={result.timeMetrics.avgClockOut ?? "—"} color="#94a3b8" />
                <StatPill icon={<AlarmClock size={18} />} label="Late Arrivals"   value={result.timeMetrics.lateArrivals} color={result.timeMetrics.lateArrivals > 0 ? "#f87171" : "#4ade80"} />
              </div>
            )}

            {/* Team breakdown (master only) */}
            {result.scope === "master" && result.teams.length > 1 && (
              <div className="rounded-xl p-5" style={cardStyle}>
                <p className="text-sm font-medium text-[#888888] mb-4">By Team</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead style={{ borderBottom: "1px solid rgba(255,77,0,0.15)" }}>
                      <tr className="text-[11px] text-[#888888]">
                        {["Team", "Employees", "Present", "WFH", "Half Days", "Absent", "Leaves", "Working Days", "Att %", "WFH %", "Hours"].map((h, i) => (
                          <th key={h} className={`px-3 py-2.5 font-medium whitespace-nowrap ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.teams.map(t => (
                        <tr key={t.team} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                          <td className="px-3 py-2 text-[#F5F5F5] whitespace-nowrap">{t.team}</td>
                          <td className="px-3 py-2 text-right text-[#aaaaaa]">{t.employeeCount}</td>
                          <td className="px-3 py-2 text-right text-[#4ade80]">{t.summary.present}</td>
                          <td className="px-3 py-2 text-right text-[#FF7A35]">{t.summary.wfh}</td>
                          <td className="px-3 py-2 text-right text-[#fbbf24]">{t.summary.halfDay}</td>
                          <td className="px-3 py-2 text-right" style={{ color: t.summary.absent > 0 ? "#f87171" : "#888888" }}>{t.summary.absent}</td>
                          <td className="px-3 py-2 text-right text-[#f472b6]">{t.summary.leaves.total}</td>
                          <td className="px-3 py-2 text-right text-[#94a3b8]">{t.summary.workingDays}</td>
                          <td className="px-3 py-2 text-right font-semibold" style={{ color: attColor(t.summary.attendancePercent) }}>{t.summary.attendancePercent}%</td>
                          <td className="px-3 py-2 text-right text-[#aaaaaa]">{t.summary.wfhPercent}%</td>
                          <td className="px-3 py-2 text-right text-[#06b6d4] whitespace-nowrap">{t.timeMetrics?.totalHours ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Employees */}
            <div className="rounded-xl p-5" style={cardStyle}>
              <p className="text-sm font-medium text-[#888888] mb-4">Employees ({result.employees.length})</p>
              <EmployeeTable rows={result.employees} showTeam={result.scope === "master"} />
            </div>
          </motion.div>
        )}
      </div>
    </>
  );
}
