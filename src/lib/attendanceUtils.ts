import type { WeekRange } from "@/types/attendance";

/**
 * Groups columnHeaders into week buckets (7-day chunks).
 * Safe to import in client components — no server-only deps.
 */
export function getWeekRanges(columnHeaders: string[]): WeekRange[] {
  const weeks: WeekRange[] = [];
  let weekNumber = 1;
  let start = 0;

  while (start < columnHeaders.length) {
    const end = Math.min(start + 7, columnHeaders.length);
    const slice = columnHeaders.slice(start, end);

    const firstHeader = slice[0] ?? "";
    const lastHeader = slice[slice.length - 1] ?? "";
    const firstDay = parseInt(firstHeader.split("-")[0], 10) || start + 1;
    const lastDay = parseInt(lastHeader.split("-")[0], 10) || end;
    const monthAbbr = firstHeader.split("-")[1]?.split(" ")[0] ?? "";

    weeks.push({
      weekNumber,
      label: `Week ${weekNumber} (${monthAbbr} ${firstDay}–${lastDay})`,
      startDay: firstDay,
      endDay: lastDay,
      columnHeaders: slice,
    });

    weekNumber++;
    start = end;
  }

  return weeks;
}
