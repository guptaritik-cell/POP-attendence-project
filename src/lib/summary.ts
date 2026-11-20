// Shared date-range attendance summary logic used by /api/attendance/summary
// for the Single Employee, Team and Master summaries.
import type { AttendanceSymbol, DayRecord } from "@/types/attendance";
import { getMonthData } from "@/lib/sheets";
import { absentMetrics } from "@/lib/attendanceSymbols";

// The spreadsheet only contains data for ONE specific year. Months whose year
// doesn't match are treated as "no data".
export const SHEET_YEAR = new Date().getFullYear();

export const MONTH_LABELS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

// Standard workday reference (matches the WFH import defaults: 10:00–19:00, 9h).
const STANDARD_START_MIN = 10 * 60;
const STANDARD_END_MIN   = 19 * 60;
const FULL_DAY_MIN       = 9  * 60;

const LEAVE_KEYS = ["ML", "SL", "PL", "ADL", "BEL", "COL", "MRL", "MAL", "MIL", "UNL"] as const;

export interface DaySummary {
  date:       string;
  dayNumber:  number;
  monthIndex: number;
  symbol:     AttendanceSymbol;
}

export interface SummaryCounts {
  present: number;
  wfh: number;
  absent: number;
  halfDay: number;
  leaves: Record<string, number> & { total: number };
  weekOff: number;
  holiday: number;
  workingDays: number;
  absentPercent: number;
  attendancePercent: number;
  wfhPercent: number;
}

export interface TimeMetrics {
  totalHours: string;
  totalMinutes: number;
  avgHoursPerDay: string;
  avgClockIn: string | null;
  avgClockOut: string | null;
  lateArrivals: number;
  earlyDepartures: number;
  overtimeHours: string;
  overtimeMinutes: number;
  punctualityPercent: number;
  daysWithData: number;
}

export interface EmployeeInfo {
  employeeId: string;
  name: string;
  team: string;
  buLead: string;
}

// Raw accumulator — additive, so employee accumulators can be merged into
// team / company totals.
export interface Acc {
  counts: Record<string, number>;
  totalWorkedMin: number;
  daysWithHours: number;
  clockInSum: number;
  clockInCount: number;
  clockOutSum: number;
  clockOutCount: number;
  lateArrivals: number;
  earlyDepartures: number;
  overtimeMin: number;
}

export function emptyAcc(): Acc {
  return {
    counts: {}, totalWorkedMin: 0, daysWithHours: 0,
    clockInSum: 0, clockInCount: 0, clockOutSum: 0, clockOutCount: 0,
    lateArrivals: 0, earlyDepartures: 0, overtimeMin: 0,
  };
}

export function addDay(acc: Acc, d: DayRecord) {
  const sym = (d.symbol ?? "") as AttendanceSymbol;
  acc.counts[sym] = (acc.counts[sym] ?? 0) + 1;
  if (sym !== "P" && sym !== "WFH" && sym !== "HD") return;

  if (typeof d.hoursMinutes === "number" && d.hoursMinutes > 0) {
    acc.totalWorkedMin += d.hoursMinutes;
    acc.daysWithHours++;
    if (d.hoursMinutes > FULL_DAY_MIN) acc.overtimeMin += d.hoursMinutes - FULL_DAY_MIN;
  }
  const inMin = hhmmToMinutes(d.clockIn);
  if (inMin !== null) {
    acc.clockInSum += inMin;
    acc.clockInCount++;
    if (inMin > STANDARD_START_MIN) acc.lateArrivals++;
  }
  const outMin = hhmmToMinutes(d.clockOut);
  if (outMin !== null) {
    acc.clockOutSum += outMin;
    acc.clockOutCount++;
    if (outMin < STANDARD_END_MIN) acc.earlyDepartures++;
  }
}

export function mergeAcc(into: Acc, from: Acc) {
  for (const [k, v] of Object.entries(from.counts)) into.counts[k] = (into.counts[k] ?? 0) + v;
  into.totalWorkedMin  += from.totalWorkedMin;
  into.daysWithHours   += from.daysWithHours;
  into.clockInSum      += from.clockInSum;
  into.clockInCount    += from.clockInCount;
  into.clockOutSum     += from.clockOutSum;
  into.clockOutCount   += from.clockOutCount;
  into.lateArrivals    += from.lateArrivals;
  into.earlyDepartures += from.earlyDepartures;
  into.overtimeMin     += from.overtimeMin;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function toSummary(acc: Acc): SummaryCounts {
  const c = (k: string) => acc.counts[k] ?? 0;
  const leaves = Object.fromEntries(LEAVE_KEYS.map(k => [k, c(k)])) as Record<string, number>;
  const totalLeaves = LEAVE_KEYS.reduce((s, k) => s + c(k), 0);

  const present = c("P"), wfh = c("WFH"), halfDay = c("HD");
  // Working days exclude week-offs, holidays, inactive and empty/future days
  const workingDays = present + wfh + halfDay + c("A") + totalLeaves;
  // Absent = Working Days − (all leaves + WFH + NHD + HD + P). NHD days are
  // already outside Working Days here, so they are not subtracted again.
  const { absent, absentPercent } = absentMetrics(workingDays, present + wfh + halfDay + totalLeaves);
  // Attendance credit: full for P/WFH, half for HD
  const attended = present + wfh + halfDay * 0.5;

  return {
    present, wfh, absent, halfDay,
    leaves: { ...leaves, total: totalLeaves },
    weekOff: c("WO"),
    holiday: c("NHD"),
    workingDays,
    absentPercent,
    attendancePercent: round1(workingDays > 0 ? (attended / workingDays) * 100 : 0),
    wfhPercent:        round1(workingDays > 0 ? (wfh / workingDays) * 100 : 0),
  };
}

export function toTimeMetrics(acc: Acc): TimeMetrics | null {
  if (!(acc.daysWithHours > 0 || acc.clockInCount > 0 || acc.clockOutCount > 0)) return null;
  const avgWorked = acc.daysWithHours > 0 ? acc.totalWorkedMin / acc.daysWithHours : 0;
  const onTime = acc.clockInCount - acc.lateArrivals;
  return {
    totalHours:         minutesToHoursLabel(acc.totalWorkedMin),
    totalMinutes:       acc.totalWorkedMin,
    avgHoursPerDay:     minutesToHoursLabel(avgWorked),
    avgClockIn:         acc.clockInCount  > 0 ? minutesToHHMM(acc.clockInSum  / acc.clockInCount)  : null,
    avgClockOut:        acc.clockOutCount > 0 ? minutesToHHMM(acc.clockOutSum / acc.clockOutCount) : null,
    lateArrivals:       acc.lateArrivals,
    earlyDepartures:    acc.earlyDepartures,
    overtimeHours:      minutesToHoursLabel(acc.overtimeMin),
    overtimeMinutes:    acc.overtimeMin,
    punctualityPercent: round1(acc.clockInCount > 0 ? (onTime / acc.clockInCount) * 100 : 0),
    daysWithData:       acc.daysWithHours,
  };
}

// ── Range collection ─────────────────────────────────────────────────────────
export interface ParsedDate { year: number; month: number; day: number }

export function parseISODate(s: string): ParsedDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const year = +m[1], month = +m[2] - 1, day = +m[3];
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  return { year, month, day };
}

export function rangeLabel(from: ParsedDate, to: ParsedDate): string {
  const same = from.year === to.year && from.month === to.month;
  return `${MONTH_LABELS[from.month]} ${from.day}` +
    (same ? `–${to.day}` : ` – ${MONTH_LABELS[to.month]} ${to.day}`);
}

export interface EmployeeRange {
  employee: EmployeeInfo;
  acc: Acc;
  days: DaySummary[];
}

// Reads every month tab in [from, to] once and returns per-employee
// accumulators for the days inside the range. `include` filters records
// (e.g. by employee ID or team) before any work is done.
export async function collectRange(
  from: ParsedDate,
  to: ParsedDate,
  include: (r: EmployeeInfo) => boolean,
  keepDays = false,
): Promise<Map<string, EmployeeRange>> {
  const out = new Map<string, EmployeeRange>();
  const fromAbs = from.year * 12 + from.month;
  const toAbs   = to.year * 12 + to.month;

  for (let abs = fromAbs; abs <= toAbs; abs++) {
    const year = Math.floor(abs / 12), month = abs % 12;
    if (year !== SHEET_YEAR) continue;

    const dayFrom = abs === fromAbs ? from.day : 1;
    const dayTo   = abs === toAbs   ? to.day   : new Date(year, month + 1, 0).getDate();

    const monthData = await getMonthData(month, year);
    for (const r of monthData.records) {
      if (!include(r)) continue;
      const key = r.employeeId.trim().toUpperCase();
      let entry = out.get(key);
      if (!entry) {
        entry = {
          employee: { employeeId: r.employeeId, name: r.name, team: r.team, buLead: r.buLead },
          acc: emptyAcc(),
          days: [],
        };
        out.set(key, entry);
      } else {
        // Latest month wins for team / name (handles team moves)
        entry.employee = { employeeId: r.employeeId, name: r.name, team: r.team, buLead: r.buLead };
      }
      for (const d of r.days) {
        if (d.dayNumber < dayFrom || d.dayNumber > dayTo) continue;
        addDay(entry.acc, d);
        if (keepDays) {
          entry.days.push({ date: d.date, dayNumber: d.dayNumber, monthIndex: month, symbol: (d.symbol ?? "") as AttendanceSymbol });
        }
      }
    }
  }
  return out;
}

// ── Formatting helpers ───────────────────────────────────────────────────────
function hhmmToMinutes(s: string | undefined): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(s.trim());
  if (!m) return null;
  return +m[1] * 60 + +m[2];
}

function minutesToHHMM(mins: number): string {
  const t = Math.round(mins), h = Math.floor(t / 60), mi = t % 60;
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}

function minutesToHoursLabel(mins: number): string {
  const t = Math.round(mins), h = Math.floor(t / 60), mi = t % 60;
  return `${h}h ${String(mi).padStart(2, "0")}m`;
}
