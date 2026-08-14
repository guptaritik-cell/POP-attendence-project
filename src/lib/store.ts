import { create } from "zustand";
import type { MonthData } from "@/types/attendance";

interface AttendanceStore {
  // ── State ──────────────────────────────────────────────────────────────────
  selectedMonth: number;          // 0-11
  selectedYear: number;
  selectedTeams: string[];        // [] = all teams
  viewMode: "monthly" | "weekly";
  selectedWeek: number;           // 1-5
  monthData: MonthData | null;
  isLoading: boolean;
  searchQuery: string;
  refreshKey: number;             // increment to force a re-fetch
  lastFetched: number | null;     // epoch ms of last successful fetch
  mobileNavOpen: boolean;         // sidebar drawer state on small screens

  // ── Actions ────────────────────────────────────────────────────────────────
  setMonth: (month: number) => void;
  setYear: (year: number) => void;
  setTeams: (teams: string[]) => void;
  setViewMode: (mode: "monthly" | "weekly") => void;
  setWeek: (week: number) => void;
  setMonthData: (data: MonthData | null) => void;
  setLoading: (loading: boolean) => void;
  setSearchQuery: (query: string) => void;
  triggerRefresh: () => void;
  setLastFetched: (ts: number) => void;
  setMobileNavOpen: (open: boolean) => void;
}

export const useAttendanceStore = create<AttendanceStore>((set) => ({
  selectedMonth: new Date().getMonth(),
  selectedYear:  new Date().getFullYear(),
  selectedTeams: [],
  viewMode:      "monthly",
  selectedWeek:  1,
  monthData:     null,
  isLoading:     false,
  searchQuery:   "",
  refreshKey:    0,
  lastFetched:   null,
  mobileNavOpen: false,

  setMonth:        (month)   => set({ selectedMonth: month,   monthData: null }),
  setYear:         (year)    => set({ selectedYear:  year,    monthData: null }),
  setTeams:        (teams)   => set({ selectedTeams: teams }),
  setViewMode:     (mode)    => set({ viewMode: mode }),
  setWeek:         (week)    => set({ selectedWeek: week }),
  setMonthData:    (data)    => set({ monthData: data }),
  setLoading:      (loading) => set({ isLoading: loading }),
  setSearchQuery:  (query)   => set({ searchQuery: query }),
  triggerRefresh:  ()        => set(s => ({ refreshKey: s.refreshKey + 1, monthData: null })),
  setLastFetched:  (ts)      => set({ lastFetched: ts }),
  setMobileNavOpen: (open)   => set({ mobileNavOpen: open }),
}));
