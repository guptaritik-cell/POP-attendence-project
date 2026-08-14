"use client";

import { Download, Search, ChevronDown, Check } from "lucide-react";
import {
  ToggleGroup, ToggleGroupItem,
} from "@/components/ui/toggle-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAttendanceStore } from "@/lib/store";
import type { MonthData, WeekRange, EmployeeMonthRecord } from "@/types/attendance";

interface FilterBarProps {
  monthData: MonthData | null;
  weekRanges: WeekRange[];
  localSearch: string;
  onLocalSearchChange: (v: string) => void;
  filteredRecords: EmployeeMonthRecord[];
  hideTeamFilter?: boolean;
  /** Set false when the parent is already inside a sticky container */
  isSticky?: boolean;
}

export function FilterBar({
  monthData,
  weekRanges,
  localSearch,
  onLocalSearchChange,
  filteredRecords,
  hideTeamFilter = false,
  isSticky = true,
}: FilterBarProps) {
  const {
    viewMode, setViewMode,
    selectedWeek, setWeek,
    selectedTeams, setTeams,
  } = useAttendanceStore();

  const allTeams = monthData
    ? [...new Set(monthData.records.map(r => r.team))].sort()
    : [];

  function toggleTeam(team: string) {
    setTeams(
      selectedTeams.includes(team)
        ? selectedTeams.filter(t => t !== team)
        : [...selectedTeams, team]
    );
  }

  function exportCSV() {
    if (!filteredRecords.length) return;
    const esc = (v: string | number) => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const headers = [
      "Employee ID",
      "Name",
      "Team",
      "BU Lead",
      "Working Days",
      "Present",
      "Att %",
      "WFH Days",
      "WFH %",
      "Half Days",
      "Total Leave",
      "Casual Leave (A)",
      "Menstrual Leave (ML)",
      "Sick Leave (SL)",
      "Paid Leave (PL)",
      "Other Leaves",
      "Total Hours",
      "Hours %",
    ];
    const rows = filteredRecords.map(r => {
      const otherLeaveDays = Object.values(r.otherLeaves || {}).reduce((s, n) => s + (n || 0), 0);
      const totalLeave = (r.totalAbsent || 0) + (r.totalML || 0) + (r.totalSL || 0) + (r.totalPL || 0) + otherLeaveDays;
      return [
        r.employeeId,
        r.name,
        r.team,
        r.buLead,
        r.workingDays,
        r.totalPresent.toFixed(1),
        r.attendancePercent.toFixed(1),
        r.totalWFH,
        r.wfhPercent.toFixed(1),
        r.totalHalfDay || 0,
        totalLeave,
        r.totalAbsent || 0,
        r.totalML || 0,
        r.totalSL || 0,
        r.totalPL || 0,
        otherLeaveDays,
        r.totalHours,
        r.hoursPercent.toFixed(1),
      ];
    });
    const csv = [headers, ...rows].map(row => row.map(esc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `attendance-${monthData?.month ?? "export"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      className={`${isSticky ? "sticky top-0 z-20" : ""} flex items-center gap-3 px-6 py-3 flex-wrap`}
      style={{ background: "#181818", borderBottom: "1px solid rgba(255,77,0,0.12)" }}
    >
      {/* Monthly / Weekly toggle */}
      <ToggleGroup
        type="single"
        value={viewMode}
        onValueChange={v => v && setViewMode(v as "monthly" | "weekly")}
        className="rounded-lg overflow-hidden border border-[rgba(255,77,0,0.25)]"
      >
        <ToggleGroupItem
          value="monthly"
          className="h-8 px-3 text-xs data-[state=on]:bg-[rgba(255,77,0,0.25)] data-[state=on]:text-white text-[#888888] rounded-none border-0"
        >
          Monthly
        </ToggleGroupItem>
        <ToggleGroupItem
          value="weekly"
          className="h-8 px-3 text-xs data-[state=on]:bg-[rgba(255,77,0,0.25)] data-[state=on]:text-white text-[#888888] rounded-none border-0"
        >
          Weekly
        </ToggleGroupItem>
      </ToggleGroup>

      {/* Week selector — visible only in weekly mode */}
      {viewMode === "weekly" && (
        <Select value={String(selectedWeek)} onValueChange={v => setWeek(Number(v))}>
          <SelectTrigger className="h-8 w-48 text-xs bg-[#222222] border-[rgba(255,77,0,0.25)] text-[#F5F5F5]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#181818] border-[rgba(255,77,0,0.3)]">
            {weekRanges.map(wr => (
              <SelectItem
                key={wr.weekNumber}
                value={String(wr.weekNumber)}
                className="text-xs text-[#F5F5F5] focus:bg-[rgba(255,77,0,0.15)] focus:text-[#F5F5F5] data-[highlighted]:bg-[rgba(255,77,0,0.15)] data-[highlighted]:text-[#F5F5F5]"
              >
                {wr.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Team filter */}
      {!hideTeamFilter && <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="h-8 px-3 text-xs border-[rgba(255,77,0,0.25)] bg-[#222222] text-[#F5F5F5] hover:bg-[rgba(255,77,0,0.12)] gap-1.5"
          >
            {selectedTeams.length === 0
              ? "All Teams"
              : `${selectedTeams.length} Team${selectedTeams.length > 1 ? "s" : ""}`}
            <ChevronDown size={12} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="bg-[#181818] border-[rgba(255,77,0,0.3)] p-1 min-w-[160px]"
        >
          {/* All Teams */}
          <button
            onClick={() => setTeams([])}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs rounded text-[#F5F5F5] hover:bg-[rgba(255,77,0,0.12)]"
          >
            <div
              className="w-3.5 h-3.5 rounded border flex items-center justify-center"
              style={{ borderColor: selectedTeams.length === 0 ? "#FF4D00" : "rgba(255,77,0,0.3)", background: selectedTeams.length === 0 ? "#FF4D00" : "transparent" }}
            >
              {selectedTeams.length === 0 && <Check size={9} className="text-white" />}
            </div>
            All Teams
          </button>
          <div className="my-1 h-px bg-[rgba(255,77,0,0.15)]" />
          {allTeams.map(team => (
            <button
              key={team}
              onClick={() => toggleTeam(team)}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs rounded text-[#F5F5F5] hover:bg-[rgba(255,77,0,0.12)]"
            >
              <div
                className="w-3.5 h-3.5 rounded border flex items-center justify-center"
                style={{ borderColor: selectedTeams.includes(team) ? "#FF4D00" : "rgba(255,77,0,0.3)", background: selectedTeams.includes(team) ? "#FF4D00" : "transparent" }}
              >
                {selectedTeams.includes(team) && <Check size={9} className="text-white" />}
              </div>
              {team}
            </button>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>}

      {/* Local search */}
      <div className="relative">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#888888]" />
        <Input
          value={localSearch}
          onChange={e => onLocalSearchChange(e.target.value)}
          placeholder="Name or ID…"
          className="h-8 pl-8 w-44 text-xs bg-[#222222] border-[rgba(255,77,0,0.25)] text-[#F5F5F5] placeholder:text-[#888888] focus:border-[#FF4D00] focus:ring-1 focus:ring-[#FF4D00]"
        />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Export CSV */}
      <Button
        onClick={exportCSV}
        variant="outline"
        className="h-8 px-3 text-xs border-[rgba(255,77,0,0.25)] bg-[#222222] text-[#F5F5F5] hover:bg-[rgba(255,77,0,0.12)] gap-1.5"
      >
        <Download size={12} />
        Export CSV
      </Button>
    </div>
  );
}
