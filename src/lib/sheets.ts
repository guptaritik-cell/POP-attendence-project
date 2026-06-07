import { google } from "googleapis";
import type {
  MonthData,
  EmployeeMonthRecord,
  DayRecord,
  AttendanceSymbol,
  WeekRange,
  Employee,
} from "@/types/attendance";

// Full names used for display in the UI
const MONTH_DISPLAY_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

// Abbreviated names that match actual tab names in the Google Sheet
const MONTH_TAB_NAMES = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec",
];

// Keep MONTH_NAMES for addEmployee (iterates all tabs)
const MONTH_NAMES = MONTH_TAB_NAMES;

// No server-side cache — every request fetches fresh data from Google Sheets

// ── OAuth2 auth (refresh token — auto-renews, never expires) ─────────────────
function getAuth() {
  const clientId     = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Missing OAuth2 env vars: GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / GOOGLE_OAUTH_REFRESH_TOKEN"
    );
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return oauth2;
}

function getSheetsClient() {
  return google.sheets({ version: "v4", auth: getAuth() });
}

// ── HH:MM → minutes parser ────────────────────────────────────────────────────
function parseHHMM(s: string): number {
  if (!s) return 0;
  const parts = s.trim().split(":");
  if (parts.length !== 2) return 0;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return 0;
  return h * 60 + m;
}

// ── Symbol parser ────────────────────────────────────────────────────────────
// Handles all known variants from biometric / HR export systems.
// WOP = Week Off + Public holiday  →  still an off day (WO)
// Any unrecognised token            →  "" (treated as no-data / future day)
function parseSymbol(raw: string): AttendanceSymbol {
  const s = raw.trim().toUpperCase();
  if (s === "P")   return "P";
  if (s === "A")   return "A";
  if (s === "HD")  return "HD";
  if (s === "WFH") return "WFH";
  if (s === "NHD") return "NHD";
  if (s === "WO" || s === "WOP") return "WO";   // WOP = Week Off + Public holiday
  return "";
}

// ── Compute all derived totals ────────────────────────────────────────────────
//
// companyWorkingDays — passed in from parseMonthData, derived from:
//   total calendar days in month  −  calendar weekends  −  NHD days in sheet
//   (immune to missing/typo WO symbols; same value for every employee)
//
// Attendance %  =  (P + WFH + 0.5×HD)  ÷  companyWorkingDays  × 100
//
// Hours %       =  totalHours  ÷  (A + P + WFH + HD) × 9  × 100
//   Denominator = only days the employee had actual data (handles current month
//   automatically — future blank days are excluded).
//
function computeRecord(
  employeeId: string,
  name: string,
  team: string,
  buLead: string,
  days: DayRecord[],
  companyWorkingDays: number,
): EmployeeMonthRecord {
  let totalPresent = 0, totalWFH = 0, totalAbsent = 0, totalHalfDay = 0;
  let daysWithData = 0; // A + P + WFH + HD
  let totalMinutes = 0;

  for (const day of days) {
    const s = day.symbol;
    if (s === "NHD" || s === "WO" || s === "") continue;
    daysWithData++;
    if      (s === "P")   { totalPresent += 1; }
    else if (s === "WFH") { totalPresent += 1; totalWFH += 1; }
    else if (s === "HD")  { totalPresent += 0.5; totalHalfDay += 1; }
    else if (s === "A")   { totalAbsent += 1; }
    totalMinutes += day.hoursMinutes ?? 0;
  }

  const workingDays       = companyWorkingDays;
  const attendancePercent = workingDays > 0 ? (totalPresent / workingDays) * 100 : 0;
  const wfhPercent        = workingDays > 0 ? (totalWFH     / workingDays) * 100 : 0;

  // Actual clocked hours when available; fall back to 9 h per present day
  const totalHours   = totalMinutes > 0
    ? Math.round((totalMinutes / 60) * 10) / 10
    : Math.round(totalPresent * 9  * 10) / 10;

  // (A + P + WFH + HD) × 9 — correct for both current and completed months
  const hoursPercent = daysWithData > 0 ? (totalHours / (daysWithData * 9)) * 100 : 0;

  return {
    employeeId, name, team, buLead, days,
    totalPresent, totalWFH, totalAbsent, totalHalfDay, workingDays,
    attendancePercent, wfhPercent, totalHours, hoursPercent,
  };
}

// ── Parse raw rows into MonthData ────────────────────────────────────────────
//
// Supports two sheet layouts:
//
// OLD (4-col prefix):  [ID, Name, Team, BuLead, day1, day2, …]
//   – one row per employee, sub-rows ignored
//
// NEW (5-col prefix):  [ID, Name, Team/BU, BuLead, Type\Date, day1, day2, …]
//   – col 4 = "Status" / "Clock In" / "Clock Out" / "Total WK"
//   – 4 rows per employee; sub-rows have empty col 0
//
// Detection: if col 4 of the header does NOT start with a digit → new format.
//
export function parseMonthData(
  rows: string[][],
  month: string,
  monthIndex: number,
  year: number
): MonthData {
  if (!rows || rows.length < 2) {
    return { month, monthIndex, year, records: [], columnHeaders: [] };
  }

  const headerRow = rows[0];

  // ── Format detection ──────────────────────────────────────────────────────
  const col4        = (headerRow[4] ?? "").trim();
  const isNewFormat = col4 !== "" && isNaN(parseInt(col4, 10));
  const dayColStart = isNewFormat ? 5 : 4;

  // ── Identify day column indices + headers ─────────────────────────────────
  const dayColIndices: number[] = [];
  const columnHeaders: string[] = [];

  for (let i = dayColStart; i < headerRow.length; i++) {
    const h = (headerRow[i] ?? "").trim();
    if (!h || h.toLowerCase().startsWith("total")) break;
    dayColIndices.push(i);
    columnHeaders.push(h);
  }

  // Helper: column header ("1 Th" or "1-Jan (Thu)") → day number
  function dayNumFromHeader(header: string, fallback: number): number {
    return parseInt(header.split(" ")[0], 10)
        || parseInt(header.split("-")[0], 10)
        || fallback;
  }

  // ── Phase 1: build days arrays for every employee ─────────────────────────
  // We need all days arrays first so we can derive NHD indices before computing
  // any attendance percentages.

  type EmpGroup = {
    employeeId: string; name: string; team: string; buLead: string;
    days: DayRecord[];
  };
  const groups: EmpGroup[] = [];

  if (isNewFormat) {
    let i = 1;
    while (i < rows.length) {
      const row        = rows[i];
      const employeeId = (row[0] ?? "").trim();
      if (!employeeId) { i++; continue; }

      const name   = (row[1] ?? "").trim();
      const team   = (row[2] ?? "").trim();
      const buLead = (row[3] ?? "").trim();
      const statusRow = dayColIndices.map(ci => (row[ci] ?? "").trim());

      let clockInRow:  string[] = [];
      let clockOutRow: string[] = [];
      let hoursRow:    string[] = [];

      i++;
      while (i < rows.length && !(rows[i][0] ?? "").trim()) {
        const sub     = rows[i];
        const subType = (sub[4] ?? "").trim().toLowerCase();
        if (subType === "clock in")       clockInRow  = dayColIndices.map(ci => (sub[ci] ?? "").trim());
        else if (subType === "clock out") clockOutRow = dayColIndices.map(ci => (sub[ci] ?? "").trim());
        else if (subType === "total wk")  hoursRow    = dayColIndices.map(ci => (sub[ci] ?? "").trim());
        i++;
      }

      const days: DayRecord[] = dayColIndices.map((_, idx) => {
        const header = columnHeaders[idx] ?? "";
        const hwStr  = hoursRow[idx] ?? "";
        return {
          date:         header,
          dayNumber:    dayNumFromHeader(header, idx + 1),
          symbol:       parseSymbol(statusRow[idx] ?? ""),
          clockIn:      clockInRow[idx]  || undefined,
          clockOut:     clockOutRow[idx] || undefined,
          hoursWorked:  hwStr            || undefined,
          hoursMinutes: hwStr ? parseHHMM(hwStr) : 0,
        };
      });

      groups.push({ employeeId, name, team, buLead, days });
    }
  } else {
    for (let r = 1; r < rows.length; r++) {
      const row        = rows[r];
      const employeeId = (row[0] ?? "").trim();
      if (!employeeId) continue;

      const name   = (row[1] ?? "").trim();
      const team   = (row[2] ?? "").trim();
      const buLead = (row[3] ?? "").trim();

      const days: DayRecord[] = dayColIndices.map((colIdx, i) => {
        const raw    = row[colIdx] ?? "";
        const header = columnHeaders[i] ?? "";
        return {
          date:      header,
          dayNumber: dayNumFromHeader(header, i + 1),
          symbol:    parseSymbol(raw),
        };
      });

      groups.push({ employeeId, name, team, buLead, days });
    }
  }

  // ── Phase 2: compute company-wide working days ────────────────────────────
  //
  // Working Days = total day-columns in sheet
  //               − WO columns   (majority vote: ≥ 50 % of employees carry WO)
  //               − NHD columns  (union: any employee carries NHD)
  //
  // Why majority vote for WO?
  //   • The company pre-fills WO for every employee on their off days.
  //   • A ≥ 50 % threshold makes the count robust: one bad cell (absent employee
  //     whose WO cell was accidentally left blank, or an unrecognised symbol on
  //     a single row) does NOT change the company-level off-day count.
  //   • WOP is already normalised to WO by parseSymbol, so all WO variants are
  //     counted correctly.
  //
  // Why NOT compute from JS Date()?
  //   • The company's week-off pattern (Fri+Sat, Sat+Sun, or other) is only
  //     known from the sheet. Hard-coding Sat+Sun would give the wrong answer.
  //
  const numEmployees = groups.length;
  const woVotesPerCol = new Array(dayColIndices.length).fill(0);
  const nhdColSet     = new Set<number>();

  for (const g of groups) {
    g.days.forEach((day, colIdx) => {
      if (day.symbol === "WO")  woVotesPerCol[colIdx]++;
      if (day.symbol === "NHD") nhdColSet.add(colIdx);
    });
  }

  const woColSet = new Set<number>();
  if (numEmployees > 0) {
    woVotesPerCol.forEach((votes, colIdx) => {
      if (votes / numEmployees >= 0.5) woColSet.add(colIdx);
    });
  }

  // dayColIndices.length = total days in the sheet (full month when sheet is complete)
  const companyWorkingDays = dayColIndices.length - woColSet.size - nhdColSet.size;

  // ── Phase 3: build final records with the correct working-days denominator ─
  const records: EmployeeMonthRecord[] = groups.map(g =>
    computeRecord(g.employeeId, g.name, g.team, g.buLead, g.days, companyWorkingDays)
  );

  return { month, monthIndex, year, records, columnHeaders };
}

// ── Fetch one month from Sheets ───────────────────────────────────────────────
export async function getMonthData(
  monthIndex: number,
  year: number = new Date().getFullYear()
): Promise<MonthData> {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error("GOOGLE_SHEET_ID is not set");

  const tabName     = MONTH_TAB_NAMES[monthIndex];     // e.g. "Jan"
  const displayName = MONTH_DISPLAY_NAMES[monthIndex]; // e.g. "January"
  const sheets      = getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: tabName,
  });

  const rows = (res.data.values ?? []) as string[][];
  return parseMonthData(rows, displayName, monthIndex, year);
}

// ── List all tab names ────────────────────────────────────────────────────────
export async function getSheetTabs(): Promise<string[]> {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error("GOOGLE_SHEET_ID is not set");

  const sheets = getSheetsClient();
  const meta   = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  return (meta.data.sheets ?? []).map(s => s.properties?.title ?? "");
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export function getAllTeams(monthData: MonthData): string[] {
  const teams = new Set<string>();
  for (const r of monthData.records) if (r.team) teams.add(r.team);
  return Array.from(teams).sort();
}

export function getWeekRanges(columnHeaders: string[]): WeekRange[] {
  const weeks: WeekRange[] = [];
  let weekNumber = 1, start = 0;

  while (start < columnHeaders.length) {
    const end   = Math.min(start + 7, columnHeaders.length);
    const slice = columnHeaders.slice(start, end);

    const first     = slice[0] ?? "";
    const last      = slice[slice.length - 1] ?? "";
    const firstDay  = parseInt(first.split("-")[0], 10) || start + 1;
    const lastDay   = parseInt(last.split("-")[0],  10) || end;
    const monthAbbr = first.split("-")[1]?.split(" ")[0] ?? "";

    weeks.push({
      weekNumber,
      label: `Week ${weekNumber} (${monthAbbr} ${firstDay}–${lastDay})`,
      startDay: firstDay, endDay: lastDay,
      columnHeaders: slice,
    });

    weekNumber++;
    start = end;
  }

  return weeks;
}

export async function addEmployee(
  employee: Employee,
  joinMonth: number,   // 0-indexed: 0 = January … 11 = December
  joinYear:  number,
): Promise<void> {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error("GOOGLE_SHEET_ID is not set");

  const sheets = getSheetsClient();

  // ── 1. Fetch which tabs actually exist ───────────────────────────────────
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const existingTabs = new Set(
    (meta.data.sheets ?? []).map(s => s.properties?.title ?? "")
  );

  // ── 2. Filter to tabs the employee should appear in ─────────────────────
  // The Google Sheet has one tab per month ("Jan", "Feb", …).
  // We only add the employee to months >= joinMonth (within joinYear) or any
  // future year tab if the sheet ever spans multiple years.
  //
  // Current assumption: all tabs belong to a single year (the sheet year).
  // Tabs are compared by their index in MONTH_NAMES (0 = Jan … 11 = Dec).
  const tabsToWrite = MONTH_NAMES.filter((_, monthIdx) => monthIdx >= joinMonth);

  // ── 3. Detect sheet format from the first eligible existing tab ──────────
  // New format: col E header is a non-numeric label ("Type\Date").
  // Old format: col E header is a day number ("1 Th", "1-Jan", etc.).
  let isNewFormat = false;
  for (const tabName of tabsToWrite) {
    if (!existingTabs.has(tabName)) continue;
    const hdr = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${tabName}!E1`,
    });
    const col4val = ((hdr.data.values?.[0]?.[0]) ?? "").trim();
    isNewFormat = col4val !== "" && isNaN(parseInt(col4val, 10));
    break;
  }

  // ── 4. Build row(s) to append ────────────────────────────────────────────
  const rowsToAppend = isNewFormat
    ? [
        [employee.employeeId, employee.name, employee.team, employee.buLead, "Status"],
        ["", "", "", "", "Clock In"],
        ["", "", "", "", "Clock Out"],
        ["", "", "", "", "Total WK"],
      ]
    : [
        [employee.employeeId, employee.name, employee.team, employee.buLead],
      ];

  const range = isNewFormat ? "A:E" : "A:D";

  // ── 5. Append — skip tabs that don't exist yet, collect any errors ───────
  const writeErrors: string[] = [];
  for (const tabName of tabsToWrite) {
    if (!existingTabs.has(tabName)) continue;
    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: `${tabName}!${range}`,
        valueInputOption: "RAW",
        requestBody: { values: rowsToAppend },
      });
    } catch (err: unknown) {
      // Extract the actual Google API error message if available
      let detail = String(err);
      if (err && typeof err === "object") {
        const e = err as Record<string, unknown>;
        // googleapis errors expose .errors[] or .message
        if (typeof e.message === "string") detail = e.message;
        const errData = (e as { errors?: Array<{ message: string }> }).errors;
        if (Array.isArray(errData) && errData[0]?.message) {
          detail = errData[0].message;
        }
        // GaxiosError wraps the response body in .response.data.error.message
        const resp = e.response as { data?: { error?: { message?: string } } } | undefined;
        if (resp?.data?.error?.message) detail = resp.data.error.message;
      }
      console.error(`[addEmployee] Failed to append to tab "${tabName}":`, detail, err);
      writeErrors.push(`${tabName}: ${detail}`);
    }
  }

  if (writeErrors.length) {
    throw new Error(`Failed to write to some tabs:\n${writeErrors.join("\n")}`);
  }
}
