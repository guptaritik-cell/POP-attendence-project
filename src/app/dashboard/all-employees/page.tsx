"use client";

import { useState, useMemo, useEffect } from "react";
import { useAttendanceStore } from "@/lib/store";
import { getWeekRanges } from "@/lib/attendanceUtils";
import { FilterBar } from "@/components/FilterBar";
import { AttendanceTable } from "@/components/AttendanceTable";
import { EmployeeDrawer } from "@/components/EmployeeDrawer";
import type { EmployeeMonthRecord, WeekRange } from "@/types/attendance";
import { OTHER_LEAVE_CODES, emptyOtherLeaves } from "@/lib/attendanceSymbols";

// ── Summary stat card ─────────────────────────────────────────────────────────
function StatCard({
  label, value, sub, color,
}: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div
      className="rounded-xl px-5 pt-4 pb-3 flex flex-col justify-between"
      style={{
        background: "#181818",
        border: "1px solid rgba(255,77,0,0.15)",
        height: 100,
      }}
    >
      <span className="text-[11px] text-[#888888] font-medium">{label}</span>
      <div>
        <span className="text-[26px] font-bold leading-tight" style={{ color: color ?? "#F5F5F5" }}>
          {value}
        </span>
        {sub && <p className="text-[11px] text-[#555] mt-0.5">{sub}</p>}
      </div>
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
  let totalML = 0, totalSL = 0, totalPL = 0;
  const otherLeaves = emptyOtherLeaves();

  for (const d of weekDays) {
    if (d.symbol === "WO" || d.symbol === "NHD" || d.symbol === "") continue;
    workingDays++;
    if      (d.symbol === "P")   totalPresent += 1;
    else if (d.symbol === "WFH") { totalPresent += 1; totalWFH++; }
    else if (d.symbol === "HD")  { totalPresent += 0.5; totalHalfDay++; }
    else if (d.symbol === "A")   totalAbsent++;
    else if (d.symbol === "ML")  totalML++;
    else if (d.symbol === "SL")  totalSL++;
    else if (d.symbol === "PL")  totalPL++;
    else if (OTHER_LEAVE_CODES.includes(d.symbol)) otherLeaves[d.symbol]++;
  }

  const attendancePercent = workingDays > 0 ? (totalPresent / workingDays) * 100 : 0;
  const wfhPercent        = workingDays > 0 ? (totalWFH / workingDays) * 100 : 0;
  const totalHours        = totalPresent * 9;
  const hoursPercent      = workingDays > 0 ? (totalHours / (workingDays * 9)) * 100 : 0;

  return {
    ...record,
    totalPresent, totalWFH, totalAbsent, totalHalfDay,
    totalML, totalSL, totalPL, otherLeaves,
    workingDays, attendancePercent, wfhPercent, totalHours, hoursPercent,
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────
// Data fetching is handled by <DataSync> in the dashboard layout —
// this page only reads from the Zustand store.
export default function AllEmployeesPage() {
  const {
    monthData, isLoading,
    selectedTeams, searchQuery,
    viewMode, selectedWeek,
  } = useAttendanceStore();

  const [localSearch,    setLocalSearch]    = useState("");
  const [selectedRecord, setSelectedRecord] = useState<EmployeeMonthRecord | null>(null);

  // When month/year changes, refresh the open detail panel with new data
  useEffect(() => {
    if (!monthData || !selectedRecord) return;
    const refreshed = monthData.records.find(r => r.employeeId === selectedRecord.employeeId);
    setSelectedRecord(refreshed ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthData]);

  const weekRanges: WeekRange[] = useMemo(
    () => (monthData ? getWeekRanges(monthData.columnHeaders) : []),
    [monthData]
  );

  const activeWeekRange = useMemo(
    () => weekRanges.find(wr => wr.weekNumber === selectedWeek) ?? weekRanges[0],
    [weekRanges, selectedWeek]
  );

  const filteredRecords = useMemo(() => {
    if (!monthData) return [];
    let recs = monthData.records;

    if (selectedTeams.length > 0) {
      recs = recs.filter(r => selectedTeams.includes(r.team));
    }

    const q = (searchQuery + localSearch).trim().toLowerCase();
    if (q) {
      recs = recs.filter(
        r =>
          r.name.toLowerCase().includes(q) ||
          r.employeeId.toLowerCase().includes(q)
      );
    }
    return recs;
  }, [monthData, selectedTeams, searchQuery, localSearch]);

  // When weekly mode is active, recompute per-record stats for that week only
  const displayRecords = useMemo(() => {
    if (viewMode === "weekly" && activeWeekRange) {
      return filteredRecords.map(r => toWeeklyRecord(r, activeWeekRange.columnHeaders));
    }
    return filteredRecords;
  }, [filteredRecords, viewMode, activeWeekRange]);

  const stats = useMemo(() => {
    if (!displayRecords.length) return null;
    const total          = displayRecords.length;
    const avgAtt         = displayRecords.reduce((s, r) => s + r.attendancePercent, 0) / total;
    const workingDays    = displayRecords[0]?.workingDays ?? 0;
    const belowThreshold = displayRecords.filter(r => r.attendancePercent < 75).length;
    return { total, avgAtt, workingDays, belowThreshold };
  }, [displayRecords]);

  return (
    <div className="flex flex-col min-h-full pb-16">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 px-4 sm:px-6 py-5">
        <StatCard
          label="Total Employees"
          value={stats?.total ?? "—"}
          sub={
            monthData
              ? viewMode === "weekly" && activeWeekRange
                ? `${activeWeekRange.label}`
                : `${monthData.month} ${monthData.year}`
              : undefined
          }
        />
        <StatCard
          label="Avg Attendance"
          value={stats ? `${stats.avgAtt.toFixed(1)}%` : "—"}
          color={
            stats
              ? stats.avgAtt >= 90 ? "#4ade80"
              : stats.avgAtt >= 75 ? "#fbbf24"
              : "#f87171"
              : undefined
          }
        />
        <StatCard
          label={viewMode === "weekly" ? "Working Days (Week)" : "Working Days This Month"}
          value={stats?.workingDays ?? "—"}
        />
        <StatCard
          label="Below 75% Attendance"
          value={stats?.belowThreshold ?? "—"}
          color={stats && stats.belowThreshold > 0 ? "#f87171" : "#4ade80"}
          sub="employees at risk"
        />
      </div>

      {/* Filter bar */}
      <FilterBar
        monthData={monthData}
        weekRanges={weekRanges}
        localSearch={localSearch}
        onLocalSearchChange={setLocalSearch}
        filteredRecords={displayRecords}
      />

      {/* Table */}
      <div className="px-4 sm:px-6 py-4 flex-1">
        <AttendanceTable
          records={displayRecords}
          columnHeaders={monthData?.columnHeaders ?? []}
          viewMode={viewMode}
          weekRange={activeWeekRange}
          isLoading={isLoading}
          onRowClick={setSelectedRecord}
        />
      </div>

      {/* Drawer */}
      <EmployeeDrawer
        record={selectedRecord}
        weekRanges={weekRanges}
        onClose={() => setSelectedRecord(null)}
      />
    </div>
  );
}
