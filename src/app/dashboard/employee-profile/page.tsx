"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, User, Users, Clock, TrendingUp, Calendar, CheckCircle2, XCircle, Minus } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer,
  Tooltip, Cell, CartesianGrid, AreaChart, Area,
} from "recharts";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAttendanceStore } from "@/lib/store";
import { getWeekRanges } from "@/lib/attendanceUtils";
import type { EmployeeMonthRecord, WeekRange, AttendanceSymbol } from "@/types/attendance";

// ── Constants ────────────────────────────────────────────────────────────────
const TEAM_COLORS: Record<string, string> = {
  "Founder":     "#7C3AED",
  "Credit Card": "#EC4899",
  "Marketplace": "#06b6d4",
  "Design":      "#f59e0b",
  "Analytics":   "#10b981",
  "HR":          "#ef4444",
  "CX":          "#8b5cf6",
  "Finance":     "#f97316",
};

const BADGE_STYLES: Record<AttendanceSymbol, { bg: string; color: string; label: string }> = {
  P:   { bg: "rgba(22,163,74,0.18)",   color: "#4ade80", label: "P"   },
  A:   { bg: "rgba(220,38,38,0.18)",   color: "#f87171", label: "A"   },
  WFH: { bg: "rgba(124,58,237,0.18)",  color: "#a78bfa", label: "WFH" },
  HD:  { bg: "rgba(217,119,6,0.18)",   color: "#fbbf24", label: "HD"  },
  NHD: { bg: "rgba(100,100,100,0.14)", color: "#666",    label: "NH"  },
  WO:  { bg: "rgba(50,50,50,0.14)",    color: "#444",    label: "WO"  },
  "":  { bg: "transparent",            color: "#333",    label: "—"   },
};

const TOOLTIP_STYLE = {
  background: "#22222F",
  border: "1px solid rgba(124,58,237,0.3)",
  borderRadius: 8,
  color: "#F1F0F5",
  fontSize: 12,
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function initials(name: string) {
  return name.split(" ").slice(0, 2).map(p => p[0]).join("").toUpperCase();
}

function attColor(pct: number) {
  return pct >= 90 ? "#4ade80" : pct >= 75 ? "#fbbf24" : "#f87171";
}

function weeklyData(record: EmployeeMonthRecord, weekRanges: WeekRange[]) {
  return weekRanges.map(wr => {
    const days = record.days.filter(d => wr.columnHeaders.includes(d.date));
    let workingDays = 0, present = 0;
    for (const d of days) {
      if (d.symbol === "WO" || d.symbol === "NHD" || d.symbol === "") continue;
      workingDays++;
      if (d.symbol === "P" || d.symbol === "WFH") present += 1;
      else if (d.symbol === "HD") present += 0.5;
    }
    return {
      week: `W${wr.weekNumber}`,
      percent: workingDays > 0 ? Math.round((present / workingDays) * 100) : 0,
    };
  });
}

// ── SVG ring ─────────────────────────────────────────────────────────────────
function Ring({ value, label, color, size = 80 }: {
  value: number; label: string; color: string; size?: number;
}) {
  const R    = size * 0.38;
  const circ = 2 * Math.PI * R;
  const pct  = Math.min(Math.max(value, 0), 100);
  const off  = circ - (pct / 100) * circ;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="#22222F" strokeWidth={6} />
          <circle
            cx={size / 2} cy={size / 2} r={R} fill="none"
            stroke={color} strokeWidth={6}
            strokeDasharray={circ} strokeDashoffset={off}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: "stroke-dashoffset 0.7s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold text-[#F1F0F5]">{pct.toFixed(0)}%</span>
        </div>
      </div>
      <span className="text-xs text-[#8B8A9B]">{label}</span>
    </div>
  );
}

// ── Stat pill ─────────────────────────────────────────────────────────────────
function StatPill({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: string | number; color?: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: "#22222F" }}>
      <div className="text-[#8B8A9B]">{icon}</div>
      <div>
        <p className="text-xs text-[#8B8A9B]">{label}</p>
        <p className="text-sm font-semibold mt-0.5" style={{ color: color ?? "#F1F0F5" }}>{value}</p>
      </div>
    </div>
  );
}

// ── Day badge ─────────────────────────────────────────────────────────────────
function DayBadge({ symbol }: { symbol: AttendanceSymbol }) {
  const s = BADGE_STYLES[symbol] ?? BADGE_STYLES[""];
  return (
    <span
      className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-semibold"
      style={{ background: s.bg, color: s.color, minWidth: 28 }}
    >
      {s.label}
    </span>
  );
}

// ── Calendar grid ─────────────────────────────────────────────────────────────
function CalendarGrid({ record }: { record: EmployeeMonthRecord }) {
  const days = record.days;

  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
      {["Sa", "Su", "Mo", "Tu", "We", "Th", "Fr"].map(d => (
        <div key={d} className="text-center text-[10px] text-[#555] py-1">{d}</div>
      ))}
      {days.map((day, i) => {
        const s = BADGE_STYLES[day.symbol] ?? BADGE_STYLES[""];
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.008, duration: 0.2 }}
            title={`${day.date}: ${s.label}`}
            className="flex flex-col items-center gap-0.5 py-1.5 rounded-lg"
            style={{ background: s.bg }}
          >
            <span className="text-[9px] text-[#555]">{day.dayNumber}</span>
            <span className="text-[10px] font-semibold" style={{ color: s.color }}>{s.label}</span>
          </motion.div>
        );
      })}
    </div>
  );
}

// ── Attendance log table ───────────────────────────────────────────────────────
function AttendanceLog({ record }: { record: EmployeeMonthRecord }) {
  const workingDays = record.days.filter(
    d => d.symbol !== "WO" && d.symbol !== "NHD" && d.symbol !== ""
  );

  return (
    <div className="overflow-auto max-h-64 rounded-lg" style={{ border: "1px solid rgba(124,58,237,0.12)" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
        <thead>
          <tr style={{ background: "#22222F" }}>
            {["Date", "Day", "Status"].map(h => (
              <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "#8B8A9B", fontWeight: 500, whiteSpace: "nowrap", borderBottom: "1px solid rgba(124,58,237,0.15)" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {workingDays.map((day, i) => {
            const s = BADGE_STYLES[day.symbol] ?? BADGE_STYLES[""];
            const parts = day.date.split(" ");
            const datePart = parts[0] ?? day.date;
            const dayPart  = (parts[1] ?? "").replace(/[()]/g, "");
            return (
              <tr
                key={i}
                style={{
                  background: i % 2 === 0 ? "#1A1A24" : "#1C1C28",
                  borderBottom: "1px solid rgba(255,255,255,0.03)",
                }}
              >
                <td style={{ padding: "7px 12px", color: "#D4D4D4" }}>{datePart}</td>
                <td style={{ padding: "7px 12px", color: "#8B8A9B" }}>{dayPart}</td>
                <td style={{ padding: "7px 12px" }}>
                  <DayBadge symbol={day.symbol} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Empty / prompt state ──────────────────────────────────────────────────────
function EmptyPrompt() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center"
        style={{ background: "rgba(124,58,237,0.12)" }}
      >
        <User size={28} className="text-[#7C3AED]" />
      </div>
      <p className="text-sm text-[#8B8A9B]">Search for an employee to view their profile</p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function EmployeeProfilePage() {
  const { monthData, isLoading } = useAttendanceStore();
  const [query, setQuery] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<EmployeeMonthRecord | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  const weekRanges = useMemo(
    () => (monthData ? getWeekRanges(monthData.columnHeaders) : []),
    [monthData]
  );

  // Auto-load the first Founder (or first employee overall) when data arrives
  useEffect(() => {
    if (!monthData || selectedRecord) return;
    const founder =
      monthData.records.find(r => r.team === "Founder") ??
      monthData.records[0];
    if (founder) {
      setSelectedRecord(founder);
      setQuery(founder.name);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthData]);

  // Autocomplete suggestions
  const suggestions = useMemo(() => {
    if (!monthData || query.trim().length < 1) return [];
    const q = query.toLowerCase();
    return monthData.records
      .filter(r => r.name.toLowerCase().includes(q) || r.employeeId.toLowerCase().includes(q))
      .slice(0, 8);
  }, [monthData, query]);

  const weekChart    = useMemo(() => selectedRecord ? weeklyData(selectedRecord, weekRanges) : [], [selectedRecord, weekRanges]);
  const teamColor    = selectedRecord ? (TEAM_COLORS[selectedRecord.team] ?? "#7C3AED") : "#7C3AED";

  // Daily presence for area chart (working days only)
  const dailyChart = useMemo(() => {
    if (!selectedRecord) return [];
    return selectedRecord.days
      .filter(d => d.symbol !== "WO" && d.symbol !== "NHD" && d.symbol !== "")
      .map(d => ({
        label: String(d.dayNumber),
        value:
          d.symbol === "P" || d.symbol === "WFH" ? 100
          : d.symbol === "HD" ? 50
          : 0,
        symbol: d.symbol,
      }));
  }, [selectedRecord]);

  function selectEmployee(record: EmployeeMonthRecord) {
    setSelectedRecord(record);
    setQuery(record.name);
    setShowDropdown(false);
  }

  function handleQueryChange(v: string) {
    setQuery(v);
    setShowDropdown(true);
    if (!v.trim()) setSelectedRecord(null);
  }

  return (
    <div className="flex flex-col min-h-full pb-12">

      {/* ── Search bar ── */}
      <div
        className="sticky top-16 z-20 px-6 py-4"
        style={{ background: "#0F0F13", borderBottom: "1px solid rgba(124,58,237,0.12)" }}
      >
        <div className="relative max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8B8A9B]" />
          <Input
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            placeholder="Search by name or Employee ID…"
            className="h-9 pl-9 text-sm bg-[#1A1A24] border-[rgba(124,58,237,0.3)] text-[#F1F0F5] placeholder:text-[#555] focus:border-[#7C3AED] focus:ring-1 focus:ring-[#7C3AED]"
          />

          {/* Dropdown */}
          <AnimatePresence>
            {showDropdown && suggestions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
                className="absolute top-full mt-1 left-0 right-0 rounded-xl overflow-hidden z-50"
                style={{ background: "#1A1A24", border: "1px solid rgba(124,58,237,0.3)", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}
              >
                {suggestions.map(r => (
                  <button
                    key={r.employeeId}
                    onMouseDown={() => selectEmployee(r)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[rgba(124,58,237,0.1)] transition-colors"
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                      style={{ background: TEAM_COLORS[r.team] ?? "#7C3AED" }}
                    >
                      {initials(r.name)}
                    </div>
                    <div>
                      <p className="text-sm text-[#F1F0F5]">{r.name}</p>
                      <p className="text-[11px] text-[#8B8A9B]">{r.employeeId} · {r.team}</p>
                    </div>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Profile content ── */}
      <div className="px-6 pt-6">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-28 rounded-xl bg-[#22222F]" />
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl bg-[#22222F]" />)}
            </div>
          </div>
        ) : !selectedRecord ? (
          <EmptyPrompt />
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedRecord.employeeId}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="space-y-5"
            >
              {/* ── Profile header card ── */}
              <div
                className="rounded-xl p-6 flex items-center gap-6"
                style={{ background: "#1A1A24", border: "1px solid rgba(124,58,237,0.2)" }}
              >
                {/* Large avatar */}
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold flex-shrink-0"
                  style={{ background: `linear-gradient(135deg, ${teamColor}, #EC4899)` }}
                >
                  {initials(selectedRecord.name)}
                </div>

                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-semibold text-[#F1F0F5]">{selectedRecord.name}</h2>
                  <p className="text-sm text-[#8B8A9B] mt-0.5">{selectedRecord.employeeId}</p>

                  <div className="flex items-center gap-4 mt-3 flex-wrap">
                    <span
                      className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-full"
                      style={{ background: `${teamColor}22`, color: teamColor }}
                    >
                      <Users size={11} />
                      {selectedRecord.team}
                    </span>
                    <span className="text-xs text-[#8B8A9B]">
                      BU Lead: <span className="text-[#D4D4D4]">{selectedRecord.buLead}</span>
                    </span>
                  </div>
                </div>

                {/* Quick badge */}
                <div className="text-right flex-shrink-0">
                  <p
                    className="text-3xl font-bold"
                    style={{ color: attColor(selectedRecord.attendancePercent) }}
                  >
                    {selectedRecord.attendancePercent.toFixed(1)}%
                  </p>
                  <p className="text-xs text-[#8B8A9B] mt-1">Attendance</p>
                </div>
              </div>

              {/* ── Stat pills row ── */}
              <div className="grid grid-cols-4 gap-3">
                <StatPill
                  icon={<CheckCircle2 size={16} />}
                  label="Present Days"
                  value={`${selectedRecord.totalPresent} / ${selectedRecord.workingDays}`}
                  color="#4ade80"
                />
                <StatPill
                  icon={<TrendingUp size={16} />}
                  label="WFH Days"
                  value={selectedRecord.totalWFH}
                  color="#a78bfa"
                />
                <StatPill
                  icon={<XCircle size={16} />}
                  label="Absent Days"
                  value={selectedRecord.totalAbsent}
                  color={selectedRecord.totalAbsent > 0 ? "#f87171" : "#4ade80"}
                />
                <StatPill
                  icon={<Clock size={16} />}
                  label="Total Hours"
                  value={`${selectedRecord.totalHours}h`}
                  color="#94a3b8"
                />
              </div>

              {/* ── Progress rings + weekly bar ── */}
              <div className="grid grid-cols-2 gap-4">
                {/* Rings */}
                <div
                  className="rounded-xl p-5"
                  style={{ background: "#1A1A24", border: "1px solid rgba(124,58,237,0.15)" }}
                >
                  <p className="text-sm font-medium text-[#8B8A9B] mb-5">Performance Overview</p>
                  <div className="flex items-center justify-around">
                    <Ring value={selectedRecord.attendancePercent} label="Attendance" color="#7C3AED" size={88} />
                    <Ring value={selectedRecord.wfhPercent}        label="WFH"        color="#EC4899" size={88} />
                    <Ring value={selectedRecord.hoursPercent}      label="Hours"      color="#06b6d4" size={88} />
                  </div>
                </div>

                {/* Weekly bar chart */}
                <div
                  className="rounded-xl p-5"
                  style={{ background: "#1A1A24", border: "1px solid rgba(124,58,237,0.15)" }}
                >
                  <p className="text-sm font-medium text-[#8B8A9B] mb-3">Week-by-Week Attendance</p>
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={weekChart} barSize={28}>
                      <XAxis dataKey="week" tick={{ fill: "#8B8A9B", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fill: "#8B8A9B", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} width={32} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}%`, "Attendance"]} />
                      <Bar dataKey="percent" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={700}>
                        {weekChart.map((entry, i) => (
                          <Cell
                            key={i}
                            fill={entry.percent >= 90 ? "#7C3AED" : entry.percent >= 75 ? "#d97706" : "#ef4444"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* ── Daily presence area chart ── */}
              <div
                className="rounded-xl p-5"
                style={{ background: "#1A1A24", border: "1px solid rgba(124,58,237,0.15)" }}
              >
                <p className="text-sm font-medium text-[#8B8A9B] mb-3">Daily Presence (Working Days)</p>
                <svg width={0} height={0} style={{ position: "absolute" }}>
                  <defs>
                    <linearGradient id="empAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={teamColor} stopOpacity={0.28} />
                      <stop offset="95%" stopColor={teamColor} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                </svg>
                <ResponsiveContainer width="100%" height={140}>
                  <AreaChart data={dailyChart} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: "#8B8A9B", fontSize: 9 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fill: "#8B8A9B", fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} width={28} />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(v: unknown, _: unknown, p) => {
                        const sym = (p?.payload as { symbol?: AttendanceSymbol })?.symbol;
                        return [`${sym ?? ""}`, "Status"];
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke={teamColor}
                      strokeWidth={2}
                      fill="url(#empAreaGrad)"
                      dot={{ fill: teamColor, r: 3, strokeWidth: 0 }}
                      activeDot={{ r: 5, fill: teamColor, strokeWidth: 0 }}
                      isAnimationActive
                      animationDuration={700}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* ── Calendar grid + log ── */}
              <div className="grid grid-cols-2 gap-4">
                {/* Calendar */}
                <div
                  className="rounded-xl p-5"
                  style={{ background: "#1A1A24", border: "1px solid rgba(124,58,237,0.15)" }}
                >
                  <p className="text-sm font-medium text-[#8B8A9B] mb-4">Monthly Calendar</p>
                  <CalendarGrid record={selectedRecord} />

                  {/* Legend */}
                  <div className="flex flex-wrap gap-3 mt-4">
                    {(["P", "WFH", "A", "HD", "WO", "NHD"] as AttendanceSymbol[]).map(sym => {
                      const s = BADGE_STYLES[sym];
                      return (
                        <span key={sym} className="flex items-center gap-1 text-[10px]" style={{ color: s.color }}>
                          <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                          {s.label}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Attendance log */}
                <div
                  className="rounded-xl p-5"
                  style={{ background: "#1A1A24", border: "1px solid rgba(124,58,237,0.15)" }}
                >
                  <p className="text-sm font-medium text-[#8B8A9B] mb-4">Attendance Log</p>
                  <AttendanceLog record={selectedRecord} />
                </div>
              </div>

            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
