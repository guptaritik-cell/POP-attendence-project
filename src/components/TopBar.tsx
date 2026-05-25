"use client";

import { usePathname } from "next/navigation";
import { RefreshCw } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAttendanceStore } from "@/lib/store";
import { ThemeToggle } from "@/components/ThemeToggle";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const YEARS = [2024, 2025, 2026];

const PATH_TITLES: Record<string, string> = {
  "/dashboard/all-employees":    "All Employees",
  "/dashboard/team-view":        "Team View",
  "/dashboard/analytics":        "Analytics",
  "/dashboard/employee-profile": "Employee Profile",
  "/dashboard/add-member":       "Add Member",
};

function formatLastSynced(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5)  return "just now";
  if (diff < 60) return `${diff}s ago`;
  const mins = Math.floor(diff / 60);
  return `${mins}m ago`;
}

export function TopBar() {
  const pathname = usePathname();
  const title    = PATH_TITLES[pathname] ?? "Dashboard";

  const {
    selectedMonth, selectedYear,
    setMonth, setYear,
    isLoading, triggerRefresh, lastFetched,
  } = useAttendanceStore();

  return (
    <header
      className="flex-shrink-0 h-16 flex items-center justify-between px-6 gap-4"
      style={{
        background: "#0D0D0D",
        borderBottom: "1px solid rgba(255,77,0,0.15)",
        position: "sticky",
        top: 0,
        zIndex: 30,
      }}
    >
      {/* Page title */}
      <h1 className="text-[15px] font-semibold text-[#F5F5F5] whitespace-nowrap">
        {title}
      </h1>

      {/* Month + Year selectors */}
      <div className="flex items-center gap-2">
        <Select value={String(selectedMonth)} onValueChange={v => setMonth(Number(v))}>
          <SelectTrigger className="h-8 w-32 text-xs border-[rgba(255,77,0,0.3)] bg-[#181818] text-[#F5F5F5]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#181818] border-[rgba(255,77,0,0.3)]">
            {MONTHS.map((m, i) => (
              <SelectItem key={i} value={String(i)}
                className="text-xs text-[#F5F5F5] focus:bg-[rgba(255,77,0,0.15)] focus:text-white">
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={String(selectedYear)} onValueChange={v => setYear(Number(v))}>
          <SelectTrigger className="h-8 w-24 text-xs border-[rgba(255,77,0,0.3)] bg-[#181818] text-[#F5F5F5]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#181818] border-[rgba(255,77,0,0.3)]">
            {YEARS.map(y => (
              <SelectItem key={y} value={String(y)}
                className="text-xs text-[#F5F5F5] focus:bg-[rgba(255,77,0,0.15)] focus:text-white">
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Right side: sync status + theme toggle */}
      <div className="flex items-center gap-3">
        {/* Last synced + refresh */}
        <div className="flex items-center gap-2">
          {lastFetched && !isLoading && (
            <span className="text-[11px] text-[#555] whitespace-nowrap">
              Synced {formatLastSynced(lastFetched)}
            </span>
          )}
          <button
            onClick={triggerRefresh}
            disabled={isLoading}
            title="Refresh data from Google Sheets"
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
            style={{
              background: "rgba(255,77,0,0.1)",
              border: "1px solid rgba(255,77,0,0.25)",
              color: isLoading ? "#555" : "#FF7A35",
              cursor: isLoading ? "not-allowed" : "pointer",
            }}
          >
            <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} />
          </button>
        </div>

        {/* Theme toggle */}
        <ThemeToggle />
      </div>
    </header>
  );
}
