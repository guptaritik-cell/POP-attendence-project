"use client";

import { usePathname } from "next/navigation";
import { Search, RefreshCw } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useAttendanceStore } from "@/lib/store";

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
    selectedMonth, selectedYear, searchQuery,
    setMonth, setYear, setSearchQuery,
    isLoading, triggerRefresh, lastFetched,
  } = useAttendanceStore();

  return (
    <header
      className="flex-shrink-0 h-16 flex items-center justify-between px-6 gap-4"
      style={{
        background: "#0F0F13",
        borderBottom: "1px solid rgba(124,58,237,0.15)",
        position: "sticky",
        top: 0,
        zIndex: 30,
      }}
    >
      {/* Page title */}
      <h1 className="text-[15px] font-semibold text-[#F1F0F5] whitespace-nowrap">
        {title}
      </h1>

      {/* Month + Year selectors */}
      <div className="flex items-center gap-2">
        <Select value={String(selectedMonth)} onValueChange={v => setMonth(Number(v))}>
          <SelectTrigger className="h-8 w-32 text-xs border-[rgba(124,58,237,0.3)] bg-[#1A1A24] text-[#F1F0F5]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#1A1A24] border-[rgba(124,58,237,0.3)]">
            {MONTHS.map((m, i) => (
              <SelectItem key={i} value={String(i)}
                className="text-xs text-[#F1F0F5] focus:bg-[rgba(124,58,237,0.15)] focus:text-white">
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={String(selectedYear)} onValueChange={v => setYear(Number(v))}>
          <SelectTrigger className="h-8 w-24 text-xs border-[rgba(124,58,237,0.3)] bg-[#1A1A24] text-[#F1F0F5]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#1A1A24] border-[rgba(124,58,237,0.3)]">
            {YEARS.map(y => (
              <SelectItem key={y} value={String(y)}
                className="text-xs text-[#F1F0F5] focus:bg-[rgba(124,58,237,0.15)] focus:text-white">
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Right side: search + sync */}
      <div className="flex items-center gap-3">
        {/* Last synced + refresh button */}
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
              background: "rgba(124,58,237,0.1)",
              border: "1px solid rgba(124,58,237,0.25)",
              color: isLoading ? "#555" : "#a78bfa",
              cursor: isLoading ? "not-allowed" : "pointer",
            }}
          >
            <RefreshCw
              size={13}
              className={isLoading ? "animate-spin" : ""}
            />
          </button>
        </div>

        {/* Global search */}
        <div className="relative w-52">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8B8A9B]" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search employees…"
            className="h-8 pl-8 text-xs bg-[#1A1A24] border-[rgba(124,58,237,0.3)] text-[#F1F0F5] placeholder:text-[#8B8A9B] focus:border-[#7C3AED] focus:ring-1 focus:ring-[#7C3AED]"
          />
        </div>
      </div>
    </header>
  );
}
