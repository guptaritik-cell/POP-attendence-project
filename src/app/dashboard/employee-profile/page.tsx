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
  "Founder":     "#FF4D00",
  "Credit Card": "#FF7A35",
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
  WFH: { bg: "rgba(255,77,0,0.18)",  color: "#FF7A35", label: "WFH" },
  HD:  { bg: "rgba(217,119,6,0.18)",   color: "#fbbf24", label: "HD"  },
  NHD: { bg: "rgba(100,100,100,0.14)", color: "#666",    label: "NH"  },
  WO:  { bg: "rgba(50,50,50,0.14)",    color: "#444",    label: "WO"  },
  "":  { bg: "transparent",            color: "#333",    label: "—"   },
};

const TOOLTIP_STYLE = {
  background: "#222222",
  border: "1px solid rgba(255,77,0,0.3)",
  borderRadius: 8,
  color: "#F5F5F5",
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
          <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="#222222" strokeWidth={6} />
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
          <span className="text-sm font-bold text-[#F5F5F5]">{pct.toFixed(0)}%</span>
        </div>
      </div>
      <span className="text-xs text-[#888888]">{label}</span>
    </div>
  );
}

// ── Stat pill ─────────────────────────────────────────────────────────────────
function StatPill({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: string | number; color?: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: "#222222" }}>
      <div className="text-[#888888]">{icon}</div>
      <div>
        <p className="text-xs text-[#888888]">{label}</p>
        <p className="text-sm font-semibold mt-0.5" style={{ color: color ?? "#F5F5F5" }}>{value}</p>
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

  // Only show clock columns if at least one day has clock data
  const hasClockData = workingDays.some(d => d.clockIn || d.clockOut || d.hoursWorked);

  const thStyle: React.CSSProperties = {
    padding: "8px 12px",
    textAlign: "left",
    color: "#888888",
    fontWeight: 500,
    whiteSpace: "nowrap",
    borderBottom: "1px solid rgba(255,77,0,0.15)",
  };

  return (
    <div className="overflow-auto max-h-64 rounded-lg" style={{ border: "1px solid rgba(255,77,0,0.12)" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
        <thead>
          <tr style={{ background: "#222222" }}>
            <th style={thStyle}>Date</th>
            <th style={thStyle}>Day</th>
            <th style={thStyle}>Status</th>
            {hasClockData && (
              <>
                <th style={thStyle}>Clock In</th>
                <th style={thStyle}>Clock Out</th>
                <th style={thStyle}>Hours</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {workingDays.map((day, i) => {
            const s      = BADGE_STYLES[day.symbol] ?? BADGE_STYLES[""];
            const parts   = day.date.split(" ");
            const datePart = parts[0] ?? day.date;
            const dayPart  = (parts[1] ?? "").replace(/[()]/g, "");
            return (
              <tr
                key={i}
                style={{
                  background: i % 2 === 0 ? "#181818" : "#1E1E1E",
                  borderBottom: "1px solid rgba(255,255,255,0.03)",
                }}
              >
                <td style={{ padding: "7px 12px", color: "#D4D4D4" }}>{datePart}</td>
                <td style={{ padding: "7px 12px", color: "#888888" }}>{dayPart}</td>
                <td style={{ padding: "7px 12px" }}>
                  <DayBadge symbol={day.symbol} />
                </td>
                {hasClockData && (
                  <>
                    <td style={{ padding: "7px 12px", color: "#aaaaaa", fontVariantNumeric: "tabular-nums" }}>
                      {day.clockIn || <span style={{ color: "#444" }}>—</span>}
                    </td>
                    <td style={{ padding: "7px 12px", color: "#aaaaaa", fontVariantNumeric: "tabular-nums" }}>
                      {day.clockOut || <span style={{ color: "#444" }}>—</span>}
                    </td>
                    <td style={{ padding: "7px 12px", color: day.hoursWorked ? "#06b6d4" : "#444", fontVariantNumeric: "tabular-nums" }}>
                      {day.hoursWorked || "—"}
                    </td>
                  </>
                )}
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
        style={{ background: "rgba(255,77,0,0.12)" }}
      >
        <User size={28} className="text-[#FF4D00]" />
      </div>
      <p className="text-sm text-[#888888]">Search for an employee to view their profile</p>
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

  // Refresh displayed employee whenever monthData changes (month / year switch)
  useEffect(() => {
    if (!monthData) return;

    if (selectedRecord) {
      // Find the same employee in the newly-loaded month's data
      const refreshed = monthData.records.find(
        r => r.employeeId === selectedRecord.employeeId
      );
      if (refreshed) {
        setSelectedRecord(refreshed);
      } else {
        // Employee not present in this month — clear selection
        setSelectedRecord(null);
        setQuery("");
      }
      return;
    }

    // No prior selection — auto-load first Founder (or first employee)
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
  const teamColor    = selectedRecord ? (TEAM_COLORS[selectedRecord.team] ?? "#FF4D00") : "#FF4D00";


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
        className="sticky top-0 z-20 px-6 py-4"
        style={{ background: "#0D0D0D", borderBottom: "1px solid rgba(255,77,0,0.12)" }}
      >
        <div className="relative max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#888888]" />
          <Input
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            placeholder="Search by name or Employee ID…"
            className="h-9 pl-9 text-sm bg-[#181818] border-[rgba(255,77,0,0.3)] text-[#F5F5F5] placeholder:text-[#555] focus:border-[#FF4D00] focus:ring-1 focus:ring-[#FF4D00]"
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

      {/* ── Profile content ── */}
      <div className="px-6 pt-6">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-28 rounded-xl bg-[#222222]" />
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl bg-[#222222]" />)}
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
                style={{ background: "#181818", border: "1px solid rgba(255,77,0,0.2)" }}
              >
                {/* Large avatar */}
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold flex-shrink-0"
                  style={{ background: `linear-gradient(135deg, ${teamColor}, #FF7A35)` }}
                >
                  {initials(selectedRecord.name)}
                </div>

                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-semibold text-[#F5F5F5]">{selectedRecord.name}</h2>
                  <p className="text-sm text-[#888888] mt-0.5">{selectedRecord.employeeId}</p>

                  <div className="flex items-center gap-4 mt-3 flex-wrap">
                    <span
                      className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-full"
                      style={{ background: `${teamColor}22`, color: teamColor }}
                    >
                      <Users size={11} />
                      {selectedRecord.team}
                    </span>
                    <span className="text-xs text-[#888888]">
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
                  <p className="text-xs text-[#888888] mt-1">Attendance</p>
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
                  color="#FF7A35"
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
                  value={`${selectedRecord.totalHours.toFixed(1)}h`}
                  color="#94a3b8"
                />
              </div>

              {/* ── Progress rings + weekly bar ── */}
              <div className="grid grid-cols-2 gap-4">
                {/* Rings */}
                <div
                  className="rounded-xl p-5"
                  style={{ background: "#181818", border: "1px solid rgba(255,77,0,0.15)" }}
                >
                  <p className="text-sm font-medium text-[#888888] mb-5">Performance Overview</p>
                  <div className="flex items-center justify-around">
                    <Ring value={selectedRecord.attendancePercent} label="Attendance" color="#FF4D00" size={88} />
                    <Ring value={selectedRecord.wfhPercent}        label="WFH"        color="#FF7A35" size={88} />
                    <Ring value={selectedRecord.hoursPercent}      label="Hours"      color="#06b6d4" size={88} />
                  </div>
                </div>

                {/* Weekly bar chart */}
                <div
                  className="rounded-xl p-5"
                  style={{ background: "#181818", border: "1px solid rgba(255,77,0,0.15)" }}
                >
                  <p className="text-sm font-medium text-[#888888] mb-3">Week-by-Week Attendance</p>
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={weekChart} barSize={28}>
                      <XAxis dataKey="week" tick={{ fill: "#888888", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fill: "#888888", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} width={32} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}%`, "Attendance"]} />
                      <Bar dataKey="percent" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={700}>
                        {weekChart.map((entry, i) => (
                          <Cell
                            key={i}
                            fill={entry.percent >= 90 ? "#FF4D00" : entry.percent >= 75 ? "#d97706" : "#ef4444"}
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
                style={{ background: "#181818", border: "1px solid rgba(255,77,0,0.15)" }}
              >
                <p className="text-sm font-medium text-[#888888] mb-3">Daily Presence (Working Days)</p>
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
                    <XAxis dataKey="label" tick={{ fill: "#888888", fontSize: 9 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fill: "#888888", fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} width={28} />
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
                  style={{ background: "#181818", border: "1px solid rgba(255,77,0,0.15)" }}
                >
                  <p className="text-sm font-medium text-[#888888] mb-4">Monthly Calendar</p>
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
                  style={{ background: "#181818", border: "1px solid rgba(255,77,0,0.15)" }}
                >
                  <p className="text-sm font-medium text-[#888888] mb-4">Attendance Log</p>
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
