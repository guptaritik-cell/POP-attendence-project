import { NextResponse } from "next/server";
import type { AttendanceSymbol, DayRecord } from "@/types/attendance";

// The spreadsheet only contains data for ONE specific year.
// Months whose year doesn't match are treated as "no data" (same policy as
// the /api/attendance/[month] route).
const SHEET_YEAR = new Date().getFullYear();

const MONTH_LABELS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

// Standard workday reference (matches the WFH import defaults: 10:00–19:00, 9h).
const STANDARD_START_MIN = 10 * 60; // 10:00
const STANDARD_END_MIN   = 19 * 60; // 19:00
const FULL_DAY_MIN       = 9  * 60; // 540

interface DaySummary {
  date:      string;          // "12-Mar (Wed)" or "12 We"
  dayNumber: number;
  monthIndex:number;
  symbol:    AttendanceSymbol;
}

// Days in a given month (monthIndex 0-11)
function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

// "HH:MM" (or "H:MM") → minutes past midnight, or null if unparseable
function hhmmToMinutes(s: string | undefined): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(s.trim());
  if (!m) return null;
  const h  = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  if (isNaN(h) || isNaN(mi)) return null;
  return h * 60 + mi;
}

// minutes past midnight → "HH:MM"
function minutesToHHMM(mins: number): string {
  const h  = Math.floor(mins / 60);
  const mi = Math.round(mins % 60);
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}

// total minutes → "Hh Mm" (e.g. "142h 30m")
function minutesToHoursLabel(mins: number): string {
  const h  = Math.floor(mins / 60);
  const mi = Math.round(mins % 60);
  return `${h}h ${String(mi).padStart(2, "0")}m`;
}

// Parse "YYYY-MM-DD" → { year, month (0-idx), day } or null
function parseISODate(s: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const year  = parseInt(m[1], 10);
  const month = parseInt(m[2], 10) - 1;
  const day   = parseInt(m[3], 10);
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  return { year, month, day };
}

export async function GET(req: Request) {
  const url        = new URL(req.url);
  const employeeId = (url.searchParams.get("employeeId") ?? "").trim();
  const fromStr    = (url.searchParams.get("from") ?? "").trim();
  const toStr      = (url.searchParams.get("to") ?? "").trim();

  // ── Validation ──────────────────────────────────────────────────────────────
  if (!employeeId) {
    return NextResponse.json({ success: false, message: "employeeId is required" }, { status: 422 });
  }
  const from = parseISODate(fromStr);
  const to   = parseISODate(toStr);
  if (!from || !to) {
    return NextResponse.json({ success: false, message: "from and to must be valid YYYY-MM-DD dates" }, { status: 422 });
  }

  const fromAbs = from.year * 12 + from.month;
  const toAbs   = to.year   * 12 + to.month;
  const fromSerial = new Date(from.year, from.month, from.day).getTime();
  const toSerial   = new Date(to.year,   to.month,   to.day).getTime();
  if (toSerial < fromSerial) {
    return NextResponse.json({ success: false, message: "The 'to' date cannot be earlier than the 'from' date" }, { status: 422 });
  }

  try {
    const { getMonthData } = await import("@/lib/sheets");

    // Accumulators
    const counts: Record<AttendanceSymbol, number> = {
      P: 0, A: 0, HD: 0, WFH: 0, NHD: 0, WO: 0, ML: 0, SL: 0, PL: 0,
      ADL: 0, BEL: 0, COL: 0, MRL: 0, MAL: 0, MIL: 0, UNL: 0, "": 0,
    };
    const dayBreakdown: DaySummary[] = [];

    // Time / punctuality accumulators (only over days that carry clock data)
    let totalWorkedMin  = 0;   // sum of hoursMinutes
    let daysWithHours   = 0;
    let clockInSum      = 0;   // sum of clock-in minutes-past-midnight
    let clockInCount    = 0;
    let clockOutSum     = 0;
    let clockOutCount   = 0;
    let lateArrivals    = 0;
    let earlyDepartures = 0;
    let overtimeMin     = 0;

    let employeeName = "";
    let team         = "";
    let buLead       = "";
    let foundInAnyMonth = false;

    // Iterate every month covered by the range
    for (let abs = fromAbs; abs <= toAbs; abs++) {
      const year  = Math.floor(abs / 12);
      const month = abs % 12;

      // The sheet only holds SHEET_YEAR — skip other years (contributes nothing)
      if (year !== SHEET_YEAR) continue;

      // Determine the day window inside this month
      const dayFrom = abs === fromAbs ? from.day : 1;
      const dayTo   = abs === toAbs   ? to.day   : daysInMonth(year, month);

      const monthData = await getMonthData(month, year);
      const record = monthData.records.find(r => r.employeeId === employeeId);
      if (!record) continue;

      foundInAnyMonth = true;
      if (!employeeName) {
        employeeName = record.name;
        team         = record.team;
        buLead       = record.buLead;
      }

      for (const d of record.days as DayRecord[]) {
        if (d.dayNumber < dayFrom || d.dayNumber > dayTo) continue;
        const sym = (d.symbol ?? "") as AttendanceSymbol;
        counts[sym] = (counts[sym] ?? 0) + 1;
        dayBreakdown.push({
          date:       d.date,
          dayNumber:  d.dayNumber,
          monthIndex: month,
          symbol:     sym,
        });

        // ── Time / punctuality (only meaningful for attended days) ───────────
        if (sym === "P" || sym === "WFH" || sym === "HD") {
          if (typeof d.hoursMinutes === "number" && d.hoursMinutes > 0) {
            totalWorkedMin += d.hoursMinutes;
            daysWithHours++;
            if (d.hoursMinutes > FULL_DAY_MIN) {
              overtimeMin += d.hoursMinutes - FULL_DAY_MIN;
            }
          }
          const inMin = hhmmToMinutes(d.clockIn);
          if (inMin !== null) {
            clockInSum += inMin;
            clockInCount++;
            if (inMin > STANDARD_START_MIN) lateArrivals++;
          }
          const outMin = hhmmToMinutes(d.clockOut);
          if (outMin !== null) {
            clockOutSum += outMin;
            clockOutCount++;
            if (outMin < STANDARD_END_MIN) earlyDepartures++;
          }
        }
      }
    }

    if (!foundInAnyMonth) {
      return NextResponse.json(
        {
          success: false,
          message: `No records found for employee "${employeeId}" in the selected date range.`,
        },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    // ── Derived metrics ─────────────────────────────────────────────────────────
    const present   = counts.P;
    const wfh        = counts.WFH;
    const absent    = counts.A;
    const halfDay   = counts.HD;
    const ml        = counts.ML;
    const sl        = counts.SL;
    const pl        = counts.PL;
    const adl       = counts.ADL;
    const bel       = counts.BEL;
    const col       = counts.COL;
    const mrl       = counts.MRL;
    const mal       = counts.MAL;
    const mil       = counts.MIL;
    const unl       = counts.UNL;
    const weekOff   = counts.WO;
    const holiday   = counts.NHD;
    const totalLeaves = ml + sl + pl + adl + bel + col + mrl + mal + mil + unl;

    // Working days exclude week-offs, national holidays, and empty/future days
    const workingDays = present + wfh + halfDay + absent + totalLeaves;
    // Attendance credit: full for P/WFH, half for HD
    const attendedCredit   = present + wfh + halfDay * 0.5;
    const attendancePercent =
      workingDays > 0 ? (attendedCredit / workingDays) * 100 : 0;

    const wfhPercent = workingDays > 0 ? (wfh / workingDays) * 100 : 0;

    // ── Time & punctuality metrics ──────────────────────────────────────────────
    const hasClockData    = daysWithHours > 0 || clockInCount > 0 || clockOutCount > 0;
    const avgWorkedMin    = daysWithHours > 0 ? totalWorkedMin / daysWithHours : 0;
    const onTimeDays      = clockInCount - lateArrivals;
    const punctualityPct  = clockInCount > 0 ? (onTimeDays / clockInCount) * 100 : 0;

    const timeMetrics = hasClockData
      ? {
          totalHours:      minutesToHoursLabel(totalWorkedMin),
          totalMinutes:    totalWorkedMin,
          avgHoursPerDay:  minutesToHoursLabel(avgWorkedMin),
          avgClockIn:      clockInCount  > 0 ? minutesToHHMM(clockInSum  / clockInCount)  : null,
          avgClockOut:     clockOutCount > 0 ? minutesToHHMM(clockOutSum / clockOutCount) : null,
          lateArrivals,
          earlyDepartures,
          overtimeHours:   minutesToHoursLabel(overtimeMin),
          overtimeMinutes: overtimeMin,
          punctualityPercent: Math.round(punctualityPct * 10) / 10,
          daysWithData:    daysWithHours,
        }
      : null;

    const monthLabel = (i: number) => MONTH_LABELS[i];
    const rangeLabel =
      `${monthLabel(from.month)} ${from.day}` +
      (fromAbs === toAbs
        ? `–${to.day}`
        : ` – ${monthLabel(to.month)} ${to.day}`);

    return NextResponse.json(
      {
        success: true,
        employee: { employeeId, name: employeeName, team, buLead },
        range: { from: fromStr, to: toStr, label: rangeLabel },
        summary: {
          present,
          wfh,
          absent,
          halfDay,
          leaves: {
            ML: ml, SL: sl, PL: pl,
            ADL: adl, BEL: bel, COL: col, MRL: mrl, MAL: mal, MIL: mil, UNL: unl,
            total: totalLeaves,
          },
          weekOff,
          holiday,
          workingDays,
          attendancePercent: Math.round(attendancePercent * 10) / 10,
          wfhPercent: Math.round(wfhPercent * 10) / 10,
        },
        timeMetrics,
        days: dayBreakdown,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[attendance/summary]", String(err));
    return NextResponse.json(
      { success: false, message: "Failed to build summary", detail: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
