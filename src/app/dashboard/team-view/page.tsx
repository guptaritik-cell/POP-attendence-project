"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ResponsiveContainer, LineChart, Line,
} from "recharts";
import { useAttendanceStore } from "@/lib/store";
import { getWeekRanges } from "@/lib/attendanceUtils";
import { FilterBar } from "@/components/FilterBar";
import { AttendanceTable } from "@/components/AttendanceTable";
import { EmployeeDrawer } from "@/components/EmployeeDrawer";
import { TeamComparisonChart } from "@/components/TeamComparisonChart";
import { TeamTrendChart } from "@/components/TeamTrendChart";
import type { EmployeeMonthRecord } from "@/types/attendance";

// ── Animation variants ────────────────────────────────────────────────────────
const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};
const cardVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] as const } },
};

// ── Daily sparkline data for selected team ────────────────────────────────────
function dailyTrend(records: EmployeeMonthRecord[], columnHeaders: string[]) {
  return columnHeaders
    .map(h => {
      let total = 0, count = 0;
      for (const r of records) {
        const day = r.days.find(d => d.date === h);
        if (!day || day.symbol === "WO" || day.symbol === "NHD" || day.symbol === "") continue;
        count++;
        if (day.symbol === "P" || day.symbol === "WFH") total += 1;
        else if (day.symbol === "HD") total += 0.5;
      }
      return count > 0 ? { v: Math.round((total / count) * 100) } : null;
    })
    .filter(Boolean) as { v: number }[];
}

// ── Mini sparkline ────────────────────────────────────────────────────────────
function Sparkline({ data }: { data: { v: number }[] }) {
  if (data.length < 2) return null;
  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <Line
          type="monotone"
          dataKey="v"
          stroke="#7C3AED"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({
  label, value, color, sparkData,
}: {
  label: string;
  value: string | number;
  color?: string;
  sparkData?: { v: number }[];
}) {
  return (
    <div
      className="relative rounded-xl overflow-hidden px-5 py-4 flex flex-col gap-1"
      style={{ background: "#1A1A24", border: "1px solid rgba(124,58,237,0.15)" }}
    >
      {/* Top gradient border strip */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{ background: "linear-gradient(90deg, #7C3AED, #EC4899)" }}
      />
      <span className="text-[11px] text-[#8B8A9B] font-medium pt-1">{label}</span>
      <span className="text-[28px] font-semibold leading-tight" style={{ color: color ?? "#F1F0F5" }}>
        {value}
      </span>
      {sparkData && sparkData.length > 1 && (
        <div className="mt-1 -mx-1">
          <Sparkline data={sparkData} />
        </div>
      )}
    </div>
  );
}

// ── Info chip ─────────────────────────────────────────────────────────────────
function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs"
      style={{ background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.25)" }}
    >
      <span className="text-[#8B8A9B]">{label}:</span>
      <span className="text-[#F1F0F5] font-medium">{value}</span>
    </div>
  );
}

// ── Weekly record transformer ─────────────────────────────────────────────────
function toWeeklyRecord(
  record: EmployeeMonthRecord,
  weekHeaders: string[]
): EmployeeMonthRecord {
  const weekDays = record.days.filter(d => weekHeaders.includes(d.date));
  let totalPresent = 0, totalWFH = 0, totalAbsent = 0, totalHalfDay = 0, workingDays = 0;

  for (const d of weekDays) {
    if (d.symbol === "WO" || d.symbol === "NHD" || d.symbol === "") continue;
    workingDays++;
    if      (d.symbol === "P")   totalPresent += 1;
    else if (d.symbol === "WFH") { totalPresent += 1; totalWFH++; }
    else if (d.symbol === "HD")  { totalPresent += 0.5; totalHalfDay++; }
    else if (d.symbol === "A")   totalAbsent++;
  }

  const attendancePercent = workingDays > 0 ? (totalPresent / workingDays) * 100 : 0;
  const wfhPercent        = workingDays > 0 ? (totalWFH / workingDays) * 100 : 0;
  const totalHours        = totalPresent * 9;
  const hoursPercent      = workingDays > 0 ? (totalHours / (workingDays * 9)) * 100 : 0;

  return {
    ...record,
    totalPresent, totalWFH, totalAbsent, totalHalfDay, workingDays,
    attendancePercent, wfhPercent, totalHours, hoursPercent,
  };
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function TeamViewPage() {
  const {
    monthData, isLoading,
    viewMode, selectedWeek, searchQuery,
  } = useAttendanceStore();

  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const [localSearch, setLocalSearch] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<EmployeeMonthRecord | null>(null);

  const weekRanges = useMemo(
    () => (monthData ? getWeekRanges(monthData.columnHeaders) : []),
    [monthData]
  );
  const activeWeekRange = useMemo(
    () => weekRanges.find(wr => wr.weekNumber === selectedWeek) ?? weekRanges[0],
    [weekRanges, selectedWeek]
  );

  // Unique teams
  const allTeams = useMemo(() => {
    if (!monthData) return [];
    return [...new Set(monthData.records.map(r => r.team))].sort();
  }, [monthData]);

  // Records for selected team (before search)
  const teamRecords = useMemo(() => {
    if (!monthData) return [];
    return selectedTeam
      ? monthData.records.filter(r => r.team === selectedTeam)
      : monthData.records;
  }, [monthData, selectedTeam]);

  // Apply search on top of team filter
  const filteredRecords = useMemo(() => {
    const q = (searchQuery + localSearch).trim().toLowerCase();
    if (!q) return teamRecords;
    return teamRecords.filter(
      r =>
        r.name.toLowerCase().includes(q) ||
        r.employeeId.toLowerCase().includes(q)
    );
  }, [teamRecords, searchQuery, localSearch]);

  // When weekly mode is active, recompute per-record stats for that week only
  const displayRecords = useMemo(() => {
    if (viewMode === "weekly" && activeWeekRange) {
      return filteredRecords.map(r => toWeeklyRecord(r, activeWeekRange.columnHeaders));
    }
    return filteredRecords;
  }, [filteredRecords, viewMode, activeWeekRange]);

  // Team-level info chips
  const teamInfo = useMemo(() => {
    const recs = selectedTeam ? teamRecords : [];
    if (!recs.length) return null;
    const buLead = recs[0]?.buLead ?? "—";
    const members = recs.length;
    const avgAtt = recs.reduce((s, r) => s + r.attendancePercent, 0) / members;
    return { buLead, members, avgAtt };
  }, [selectedTeam, teamRecords]);

  // Stats for selected team — use display (weekly-adjusted) records when in weekly mode
  const stats = useMemo(() => {
    // For total members use teamRecords (not filtered by search), but use weekly-adjusted values
    const baseRecs = viewMode === "weekly" && activeWeekRange
      ? teamRecords.map(r => toWeeklyRecord(r, activeWeekRange.columnHeaders))
      : teamRecords;
    if (!baseRecs.length) return null;
    const total = baseRecs.length;
    const avgAtt = baseRecs.reduce((s, r) => s + r.attendancePercent, 0) / total;
    const totalWFH = baseRecs.reduce((s, r) => s + r.totalWFH, 0);
    const totalAbsent = baseRecs.reduce((s, r) => s + r.totalAbsent, 0);
    const spark = monthData ? dailyTrend(teamRecords, monthData.columnHeaders) : [];
    return { total, avgAtt, totalWFH, totalAbsent, spark };
  }, [teamRecords, monthData, viewMode, activeWeekRange]);

  const attColor = (pct: number) =>
    pct >= 90 ? "#4ade80" : pct >= 75 ? "#fbbf24" : "#f87171";

  const pillBase: React.CSSProperties = {
    padding: "6px 16px",
    borderRadius: 9999,
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    border: "none",
    background: "transparent",
    position: "relative",
    transition: "color 0.15s",
  };

  return (
    <div className="flex flex-col min-h-full pb-8">

      {/* ── Team pill selector (sticky) ── */}
      <div
        className="sticky top-16 z-20 px-6 py-2 flex items-center gap-2 flex-wrap"
        style={{ background: "#0F0F13", borderBottom: "1px solid rgba(124,58,237,0.12)" }}
      >
        {["", ...allTeams].map(team => {
          const isActive = selectedTeam === team;
          const label = team === "" ? "All Teams" : team;
          return (
            <button
              key={label}
              onClick={() => setSelectedTeam(team)}
              style={{
                ...pillBase,
                color: isActive ? "#fff" : "#8B8A9B",
              }}
            >
              {isActive && (
                <motion.span
                  layoutId="team-indicator"
                  className="absolute inset-0 rounded-full"
                  style={{ background: "linear-gradient(135deg, #7C3AED, #EC4899)" }}
                  transition={{ type: "spring", stiffness: 420, damping: 32 }}
                />
              )}
              <span className="relative z-10">{label}</span>
            </button>
          );
        })}

        {/* Info chips for specific team */}
        <AnimatePresence>
          {teamInfo && (
            <motion.div
              key="chips"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-2 ml-3"
            >
              <InfoChip label="BU Lead" value={teamInfo.buLead} />
              <InfoChip label="Members" value={String(teamInfo.members)} />
              <InfoChip
                label="Avg Att."
                value={`${teamInfo.avgAtt.toFixed(1)}%`}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Stats cards ── */}
      <motion.div
        key={selectedTeam}
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-4 gap-4 px-6 pt-3 pb-1"
      >
        <motion.div variants={cardVariants}>
          <StatCard label="Total Members" value={stats?.total ?? "—"} />
        </motion.div>
        <motion.div variants={cardVariants}>
          <StatCard
            label={viewMode === "weekly" ? "Avg Attendance % (Week)" : "Avg Attendance %"}
            value={stats ? `${stats.avgAtt.toFixed(1)}%` : "—"}
            color={stats ? attColor(stats.avgAtt) : undefined}
            sparkData={stats?.spark}
          />
        </motion.div>
        <motion.div variants={cardVariants}>
          <StatCard
            label={viewMode === "weekly" ? "WFH Days (Week)" : "Total WFH Days"}
            value={stats?.totalWFH ?? "—"}
            color="#a78bfa"
          />
        </motion.div>
        <motion.div variants={cardVariants}>
          <StatCard
            label="Total Absences"
            value={stats?.totalAbsent ?? "—"}
            color={stats && stats.totalAbsent > 0 ? "#f87171" : "#4ade80"}
          />
        </motion.div>
      </motion.div>

      {/* ── Filter bar ── */}
      <FilterBar
        monthData={monthData}
        weekRanges={weekRanges}
        localSearch={localSearch}
        onLocalSearchChange={setLocalSearch}
        filteredRecords={displayRecords}
        hideTeamFilter
      />

      {/* ── Attendance table ── */}
      <div className="px-6 py-4">
        <AttendanceTable
          records={displayRecords}
          columnHeaders={monthData?.columnHeaders ?? []}
          viewMode={viewMode}
          weekRange={activeWeekRange}
          isLoading={isLoading}
          onRowClick={setSelectedRecord}
        />
      </div>

      {/* ── Charts section ── */}
      <div className="px-6 space-y-6">
        {/* Team Comparison — only when All Teams */}
        <AnimatePresence>
          {selectedTeam === "" && (
            <motion.div
              key="comparison"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] as const }}
              className="rounded-xl p-5"
              style={{ background: "#1A1A24", border: "1px solid rgba(124,58,237,0.15)" }}
            >
              <p className="text-xs font-medium text-[#8B8A9B] mb-4">
                Team Attendance Comparison
              </p>
              {monthData && <TeamComparisonChart records={monthData.records} />}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Trend chart — always */}
        <div
          className="rounded-xl p-5"
          style={{ background: "#1A1A24", border: "1px solid rgba(124,58,237,0.15)" }}
        >
          <p className="text-xs font-medium text-[#8B8A9B] mb-4">
            Weekly Attendance Trend
            {selectedTeam ? ` — ${selectedTeam}` : " — All Teams"}
          </p>
          <TeamTrendChart
            records={teamRecords}
            weekRanges={weekRanges}
            selectedTeam={selectedTeam}
            allTeams={allTeams}
          />
        </div>
      </div>

      {/* ── Drawer ── */}
      <EmployeeDrawer
        record={selectedRecord}
        weekRanges={weekRanges}
        onClose={() => setSelectedRecord(null)}
      />
    </div>
  );
}
