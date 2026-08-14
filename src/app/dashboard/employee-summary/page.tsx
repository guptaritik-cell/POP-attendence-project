"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, CalendarDays, CheckCircle2, XCircle, TrendingUp,
  Clock, ClipboardList, Loader2, AlertCircle, Download,
  LogIn, LogOut, Timer, Zap, Target, AlarmClock, Hourglass,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAttendanceStore } from "@/lib/store";
import { SYMBOL_META } from "@/lib/attendanceSymbols";

// ── Constants ────────────────────────────────────────────────────────────────
const TEAM_COLORS: Record<string, string> = {
  "Founder":     "#FF4D00",
  "Credit Card": "#FF7A35",
  "Marketplace": "#06b6d4",
  "Design":      "#f59e0b",
  "Analytics":   "#10b981",
  "HR":          "#ef4444",
  "CX":          "#8b5cf6",
  "Finance":     "#f97316",
};

const LEAVE_CODES = Object.values(SYMBOL_META)
  .filter(m => m.category === "leave")
  .map(m => m.code);

// ── API response shape ─────────────────────────────────────────────────────────
interface SummaryResponse {
  success: boolean;
  message?: string;
  employee: { employeeId: string; name: string; team: string; buLead: string };
  range: { from: string; to: string; label: string };
  summary: {
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
  };
  timeMetrics: {
    totalHours: string;
    totalMinutes: number;
    avgHoursPerDay: string;
    avgClockIn: string | null;
    avgClockOut: string | null;
    lateArrivals: number;
    earlyDepartures: number;
    overtimeHours: string;
    overtimeMinutes: number;
    punctualityPercent: number;
    daysWithData: number;
  } | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function initials(name: string) {
  return name.split(" ").slice(0, 2).map(p => p[0]).join("").toUpperCase();
}
function attColor(pct: number) {
  return pct >= 90 ? "#4ade80" : pct >= 75 ? "#fbbf24" : "#f87171";
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function firstOfMonthISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

// ── Stat pill ──────────────────────────────────────────────────────────────────
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

// ── SVG ring ─────────────────────────────────────────────────────────────────
function Ring({ value, color, size = 120 }: { value: number; color: string; size?: number }) {
  const R    = size * 0.4;
  const circ = 2 * Math.PI * R;
  const pct  = Math.min(Math.max(value, 0), 100);
  const off  = circ - (pct / 100) * circ;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="#222222" strokeWidth={8} />
        <circle
          cx={size / 2} cy={size / 2} r={R} fill="none"
          stroke={color} strokeWidth={8}
          strokeDasharray={circ} strokeDashoffset={off}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 0.7s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold" style={{ color }}>{pct.toFixed(1)}%</span>
        <span className="text-[10px] text-[#888888]">Attendance</span>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function EmployeeSummaryPage() {
  const { monthData } = useAttendanceStore();

  // Employee picker
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<{ employeeId: string; name: string; team: string } | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  // Date range
  const [fromDate, setFromDate] = useState(firstOfMonthISO());
  const [toDate, setToDate]     = useState(todayISO());

  // Result state
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [result, setResult]   = useState<SummaryResponse | null>(null);

  // Autocomplete from the currently loaded month
  const suggestions = useMemo(() => {
    if (!monthData || query.trim().length < 1) return [];
    const q = query.toLowerCase();
    return monthData.records
      .filter(r => r.name.toLowerCase().includes(q) || r.employeeId.toLowerCase().includes(q))
      .slice(0, 8);
  }, [monthData, query]);

  function selectEmployee(r: { employeeId: string; name: string; team: string }) {
    setSelected({ employeeId: r.employeeId, name: r.name, team: r.team });
    setQuery(r.name);
    setShowDropdown(false);
  }

  function handleQueryChange(v: string) {
    setQuery(v);
    setShowDropdown(true);
    if (!v.trim()) setSelected(null);
  }

  const canGenerate = !!selected && !!fromDate && !!toDate && !loading;

  async function handleGenerate() {
    if (!selected) { setError("Please select an employee first."); return; }
    if (!fromDate || !toDate) { setError("Please choose both a from and to date."); return; }
    if (toDate < fromDate) { setError("The 'to' date cannot be earlier than the 'from' date."); return; }

    setLoading(true);
    setError("");
    setResult(null);
    try {
      const params = new URLSearchParams({
        employeeId: selected.employeeId,
        from: fromDate,
        to: toDate,
      });
      const res  = await fetch(`/api/attendance/summary?${params.toString()}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.message ?? "Failed to generate summary.");
        return;
      }
      setResult(data as SummaryResponse);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  function downloadCSV() {
    if (!result) return;
    const { employee, range, summary, timeMetrics } = result;
    const esc = (v: string | number) => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows: (string | number)[][] = [
      ["Employee Summary"],
      [],
      ["Employee ID", employee.employeeId],
      ["Name",        employee.name],
      ["Team",        employee.team],
      ["BU Lead",     employee.buLead],
      ["Date Range",  range.label],
      ["From",        range.from],
      ["To",          range.to],
      [],
      ["Metric", "Value"],
      ["Present",            summary.present],
      ["WFH",                summary.wfh],
      ["WFH %",              `${summary.wfhPercent}%`],
      ["Half Days",          summary.halfDay],
      ["Absent",             summary.absent],
      ...LEAVE_CODES.map(code => [
        `${SYMBOL_META[code].fullName} (${code})`,
        summary.leaves[code] ?? 0,
      ] as [string, number]),
      ["Total Leaves",       summary.leaves.total],
      ["Week Offs",          summary.weekOff],
      ["Holidays",           summary.holiday],
      ["Working Days",       summary.workingDays],
      ["Attendance %",       `${summary.attendancePercent}%`],
    ];
    if (timeMetrics) {
      rows.push(
        [],
        ["Time & Punctuality", `(based on ${timeMetrics.daysWithData} days with clock data)`],
        ["Total Hours",       timeMetrics.totalHours],
        ["Avg Hours / Day",   timeMetrics.avgHoursPerDay],
        ["Avg Clock-In",      timeMetrics.avgClockIn ?? "—"],
        ["Avg Clock-Out",     timeMetrics.avgClockOut ?? "—"],
        ["Late Arrivals",     timeMetrics.lateArrivals],
        ["Early Departures",  timeMetrics.earlyDepartures],
        ["Punctuality %",     `${timeMetrics.punctualityPercent}%`],
        ["Overtime",          timeMetrics.overtimeHours],
      );
    }
    const csv  = rows.map(r => r.map(esc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    const safeName = employee.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    a.download = `summary-${safeName}-${range.from}_to_${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const teamColor = result ? (TEAM_COLORS[result.employee.team] ?? "#FF4D00") : "#FF4D00";
  const dateInputClass =
    "h-9 px-3 text-sm rounded-md bg-[#181818] border border-[rgba(255,77,0,0.3)] text-[#F5F5F5] " +
    "focus:border-[#FF4D00] focus:outline-none focus:ring-1 focus:ring-[#FF4D00] [color-scheme:dark]";

  return (
    <div className="flex flex-col min-h-full pb-12">
      {/* ── Header / controls ── */}
      <div
        className="sticky top-0 z-20 px-4 sm:px-6 py-4"
        style={{ background: "#0D0D0D", borderBottom: "1px solid rgba(255,77,0,0.12)" }}
      >
        <div className="flex items-center gap-2 mb-4">
          <ClipboardList size={18} className="text-[#FF4D00]" />
          <h1 className="text-base font-semibold text-[#F5F5F5]">Employee Summary</h1>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          {/* Employee search */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-[#888888]">Employee</label>
            <div className="relative w-full sm:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#888888]" />
              <Input
                value={query}
                onChange={e => handleQueryChange(e.target.value)}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                placeholder="Search by name or Employee ID…"
                className="h-9 pl-9 text-sm bg-[#181818] border-[rgba(255,77,0,0.3)] text-[#F5F5F5] placeholder:text-[#555] focus:border-[#FF4D00] focus:ring-1 focus:ring-[#FF4D00]"
              />
              <AnimatePresence>
                {showDropdown && suggestions.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full mt-1 left-0 right-0 rounded-xl overflow-hidden z-50"
                    style={{ background: "#181818", border: "1px solid rgba(255,77,0,0.3)", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}
                  >
                    {suggestions.map(r => (
                      <button
                        key={r.employeeId}
                        onMouseDown={() => selectEmployee(r)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[rgba(255,77,0,0.1)] transition-colors"
                      >
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                          style={{ background: TEAM_COLORS[r.team] ?? "#FF4D00" }}
                        >
                          {initials(r.name)}
                        </div>
                        <div>
                          <p className="text-sm text-[#F5F5F5]">{r.name}</p>
                          <p className="text-[11px] text-[#888888]">{r.employeeId} · {r.team}</p>
                        </div>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* From date */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-[#888888]">From date</label>
            <input
              type="date"
              value={fromDate}
              max={toDate || undefined}
              onChange={e => setFromDate(e.target.value)}
              className={dateInputClass}
            />
          </div>

          {/* To date */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-[#888888]">To date</label>
            <input
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={e => setToDate(e.target.value)}
              className={dateInputClass}
            />
          </div>

          {/* Generate */}
          <Button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="h-9 px-5 rounded-md text-white font-semibold text-sm border-0 disabled:opacity-50"
            style={{ background: "radial-gradient(circle at 35% 35%, #FF7A35 0%, #FF4D00 55%, #CC1F00 100%)" }}
          >
            {loading ? (
              <span className="flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Generating…</span>
            ) : "Generate Summary"}
          </Button>
        </div>

        {!monthData && (
          <p className="text-[11px] text-[#888888] mt-2">
            Loading employee suggestions… you can also type an Employee ID directly.
          </p>
        )}
      </div>

      {/* ── Body ── */}
      <div className="px-4 sm:px-6 pt-6">
        {error && (
          <div
            className="flex items-center gap-2 px-4 py-3 rounded-xl mb-5"
            style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)" }}
          >
            <AlertCircle size={16} className="text-[#f87171]" />
            <span className="text-sm text-[#f87171]">{error}</span>
          </div>
        )}

        {!result && !error && !loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(255,77,0,0.12)" }}>
              <CalendarDays size={28} className="text-[#FF4D00]" />
            </div>
            <p className="text-sm text-[#888888]">Select an employee and a date range, then generate the summary.</p>
          </div>
        )}

        {result && (
          <motion.div
            key={`${result.employee.employeeId}-${result.range.from}-${result.range.to}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="space-y-5"
          >
            {/* Toolbar */}
            <div className="flex justify-end">
              <Button
                onClick={downloadCSV}
                className="h-9 px-4 rounded-md text-sm font-medium border border-[rgba(255,77,0,0.3)] bg-[#181818] text-[#F5F5F5] hover:bg-[rgba(255,77,0,0.1)]"
              >
                <Download size={14} className="mr-2" />
                Download CSV
              </Button>
            </div>

            {/* Header card */}
            <div
              className="rounded-xl p-4 sm:p-6 flex flex-col sm:flex-row items-center gap-4 sm:gap-6 text-center sm:text-left"
              style={{ background: "#181818", border: "1px solid rgba(255,77,0,0.2)" }}
            >
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold flex-shrink-0"
                style={{ background: `linear-gradient(135deg, ${teamColor}, #FF7A35)` }}
              >
                {initials(result.employee.name)}
              </div>
              <div className="flex-1 min-w-0 w-full sm:w-auto">
                <h2 className="text-xl font-semibold text-[#F5F5F5]">{result.employee.name}</h2>
                <p className="text-sm text-[#888888] mt-0.5">{result.employee.employeeId}</p>
                <div className="flex items-center justify-center sm:justify-start gap-4 mt-3 flex-wrap">
                  <span className="text-xs px-3 py-1 rounded-full" style={{ background: `${teamColor}22`, color: teamColor }}>
                    {result.employee.team}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-[#888888]">
                    <CalendarDays size={12} /> {result.range.label}
                  </span>
                </div>
              </div>
              <Ring value={result.summary.attendancePercent} color={attColor(result.summary.attendancePercent)} />
            </div>

            {/* Stat pills */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3">
              <StatPill icon={<CheckCircle2 size={18} />} label="Present" value={result.summary.present} color="#4ade80" />
              <StatPill icon={<TrendingUp size={18} />}   label="WFH"     value={`${result.summary.wfh} · ${result.summary.wfhPercent}%`} color="#FF7A35" />
              <StatPill icon={<Clock size={18} />}        label="Half Days" value={result.summary.halfDay} color="#fbbf24" />
              <StatPill icon={<XCircle size={18} />}      label="Absent"  value={result.summary.absent}  color={result.summary.absent > 0 ? "#f87171" : "#4ade80"} />
              <StatPill icon={<CalendarDays size={18} />} label="Working Days" value={result.summary.workingDays} color="#94a3b8" />
              <StatPill icon={<Target size={18} />}       label="Leaves"  value={result.summary.leaves.total} color="#f472b6" />
            </div>

            {/* Leaves breakdown */}
            <div className="rounded-xl p-5" style={{ background: "#181818", border: "1px solid rgba(255,77,0,0.15)" }}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-medium text-[#888888]">Leaves Taken</p>
                <span className="text-sm text-[#F5F5F5]">
                  Total: <span className="font-semibold">{result.summary.leaves.total}</span>
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {LEAVE_CODES.map(code => {
                  const meta = SYMBOL_META[code];
                  return (
                    <div
                      key={code}
                      className="flex items-center justify-between px-4 py-3 rounded-lg"
                      style={{ background: "#222222", border: `1px solid ${meta.color}33` }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: meta.color }} />
                        <div>
                          <p className="text-sm font-semibold" style={{ color: meta.color }}>{code}</p>
                          <p className="text-[10px] text-[#888888]">{meta.fullName}</p>
                        </div>
                      </div>
                      <span className="text-xl font-bold text-[#F5F5F5]">{result.summary.leaves[code] ?? 0}</span>
                    </div>
                  );
                })}
              </div>
              {(result.summary.weekOff > 0 || result.summary.holiday > 0) && (
                <p className="text-[11px] text-[#666] mt-4">
                  Excluded from working days: {result.summary.weekOff} week-off{result.summary.weekOff !== 1 ? "s" : ""}, {result.summary.holiday} holiday{result.summary.holiday !== 1 ? "s" : ""}.
                </p>
              )}
            </div>

            {/* Time & Punctuality */}
            {result.timeMetrics && (
              <div className="rounded-xl p-5" style={{ background: "#181818", border: "1px solid rgba(255,77,0,0.15)" }}>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-medium text-[#888888]">Time &amp; Punctuality</p>
                  <span className="text-[11px] text-[#666]">
                    Based on {result.timeMetrics.daysWithData} day{result.timeMetrics.daysWithData !== 1 ? "s" : ""} with clock data · standard 10:00–19:00
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatPill icon={<Timer size={18} />}      label="Total Hours"       value={result.timeMetrics.totalHours} color="#06b6d4" />
                  <StatPill icon={<Hourglass size={18} />}  label="Avg Hours / Day"   value={result.timeMetrics.avgHoursPerDay} color="#06b6d4" />
                  <StatPill icon={<LogIn size={18} />}      label="Avg Clock-In"      value={result.timeMetrics.avgClockIn ?? "—"} color="#4ade80" />
                  <StatPill icon={<LogOut size={18} />}     label="Avg Clock-Out"     value={result.timeMetrics.avgClockOut ?? "—"} color="#94a3b8" />
                  <StatPill icon={<AlarmClock size={18} />} label="Late Arrivals"     value={result.timeMetrics.lateArrivals} color={result.timeMetrics.lateArrivals > 0 ? "#f87171" : "#4ade80"} />
                  <StatPill icon={<LogOut size={18} />}     label="Early Departures"  value={result.timeMetrics.earlyDepartures} color={result.timeMetrics.earlyDepartures > 0 ? "#fbbf24" : "#4ade80"} />
                  <StatPill icon={<Target size={18} />}     label="Punctuality"       value={`${result.timeMetrics.punctualityPercent}%`} color={attColor(result.timeMetrics.punctualityPercent)} />
                  <StatPill icon={<Zap size={18} />}        label="Overtime"          value={result.timeMetrics.overtimeHours} color="#FF7A35" />
                </div>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
