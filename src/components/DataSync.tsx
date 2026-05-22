"use client";

import { useEffect } from "react";
import { useAttendanceStore } from "@/lib/store";

const MONTH_NAMES = [
  "january","february","march","april","may","june",
  "july","august","september","october","november","december",
];

/**
 * Invisible component mounted once in the dashboard layout.
 * Owns all data fetching so every tab (All Employees, Team View,
 * Analytics, Employee Profile) always has fresh data without each
 * page managing its own fetch.
 *
 * Re-fetches when:
 *  • selectedMonth changes
 *  • selectedYear changes
 *  • refreshKey increments (manual refresh button)
 */
export function DataSync() {
  const {
    selectedMonth,
    selectedYear,
    refreshKey,
    setMonthData,
    setLoading,
    setLastFetched,
  } = useAttendanceStore();

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      console.log("[DataSync] fetchData() started");
      setLoading(true);
      try {
        const monthName = MONTH_NAMES[selectedMonth];
        const url = `/api/attendance/${monthName}?year=${selectedYear}`;
        console.log(`[DataSync] Fetching: ${url}`);
        
        const res = await fetch(
          url,
          { cache: "no-store" }           // bypass browser cache too
        );
        console.log(`[DataSync] Response status: ${res.status}`);

        if (!res.ok) {
          console.log("[DataSync] Response not OK, trying to parse error body");
          const body = await res.json().catch(() => ({}));
          console.error("[DataSync] Error body:", body);
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }

        console.log("[DataSync] Response OK, parsing JSON...");
        const data = await res.json();
        console.log("[DataSync] Data received successfully:", data);
        if (!cancelled) {
          console.log("[DataSync] Setting month data");
          setMonthData(data);
          setLastFetched(Date.now());
        }
      } catch (err) {
        console.error("[DataSync] fetch failed:", err);
        if (!cancelled) setMonthData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, selectedYear, refreshKey]);

  return null;   // renders nothing — pure side-effect component
}
