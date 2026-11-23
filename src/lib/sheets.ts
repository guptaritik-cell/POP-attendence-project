import { google } from "googleapis";
import * as XLSX from "xlsx";
import type {
  MonthData,
  EmployeeMonthRecord,
  DayRecord,
  AttendanceSymbol,
  WeekRange,
  Employee,
} from "@/types/attendance";
import {
  OTHER_LEAVE_CODES,
  emptyOtherLeaves,
  SYMBOL_META,
  isAccountedSymbol,
  absentMetrics,
} from "@/lib/attendanceSymbols";
import { parseHolidayDate } from "@/lib/holidays";

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
  if (s === "NHD" || s === "HO") return "NHD";
  if (s === "WO" || s === "WOP" || s === "MO") return "WO";   // WOP/MO = Week Off
  if (s === "INACTIVE" || s === "IN") return "IN";            // employee has exited
  if (s in SYMBOL_META) return s as AttendanceSymbol;
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
  accountedWorkingDays: number,
): EmployeeMonthRecord {
  let totalPresent = 0, totalWFH = 0, totalAbsent = 0, totalHalfDay = 0;
  let totalML = 0, totalSL = 0, totalPL = 0;
  const otherLeaves = emptyOtherLeaves();
  let daysWithData = 0; // A/ML/SL/PL/otherLeaves + P + WFH + HD
  let totalMinutes = 0;

  for (const day of days) {
    const s = day.symbol;
    if (s === "NHD" || s === "WO" || s === "IN" || s === "") continue;
    daysWithData++;
    if      (s === "P")   { totalPresent += 1; }
    else if (s === "WFH") { totalPresent += 1; totalWFH += 1; }
    else if (s === "HD")  { totalPresent += 0.5; totalHalfDay += 1; }
    else if (s === "A")   { totalAbsent += 1; }
    // Leave types — each counts as 1 absent day
    else if (s === "ML")  { totalAbsent += 1; totalML += 1; }
    else if (s === "SL")  { totalAbsent += 1; totalSL += 1; }
    else if (s === "PL")  { totalAbsent += 1; totalPL += 1; }
    else if (OTHER_LEAVE_CODES.includes(s)) {
      totalAbsent += 1;
      otherLeaves[s] = (otherLeaves[s] || 0) + 1;
    }
    totalMinutes += day.hoursMinutes ?? 0;
  }

  const workingDays       = companyWorkingDays;
  const attendancePercent = workingDays > 0 ? (totalPresent / workingDays) * 100 : 0;
  const wfhPercent        = workingDays > 0 ? (totalWFH     / workingDays) * 100 : 0;
  const { absent: absentDays, absentPercent } = absentMetrics(workingDays, accountedWorkingDays);

  // Actual clocked hours when available; fall back to 9 h per present day
  const totalHours   = totalMinutes > 0
    ? Math.round((totalMinutes / 60) * 10) / 10
    : Math.round(totalPresent * 9  * 10) / 10;

  // (A/ML/SL/PL + P + WFH + HD) × 9 — correct for both current and completed months
  const hoursPercent = daysWithData > 0 ? (totalHours / (daysWithData * 9)) * 100 : 0;

  return {
    employeeId, name, team, buLead, days,
    totalPresent, totalWFH, totalAbsent, totalHalfDay,
    totalML, totalSL, totalPL, otherLeaves,
    workingDays, absentDays, absentPercent,
    attendancePercent, wfhPercent, totalHours, hoursPercent,
  };
}

// ── Parse raw rows into MonthData ────────────────────────────────────────────
//
// ── Format detector ──────────────────────────────────────────────────────────
// Determines:
//  • dayColStart — 0-based column index where day 1 data starts
//  • hasSubRows — whether sub-rows exist (Clock In / Clock Out / Total WK)
//  • typeCol — 0-based column index containing sub-row type labels ("Status", "Clock In", etc.)
//
export function detectFormat(rows: string[][]): {
  dayColStart: number;
  hasSubRows: boolean;
  typeCol: number;
} {
  if (!rows || rows.length === 0) {
    return { dayColStart: 4, hasSubRows: false, typeCol: 3 };
  }

  const headerRow = rows[0];

  // 1. Find dayColStart: first column index >= 1 whose header cell starts with a digit
  let dayColStart = -1;
  for (let c = 1; c < headerRow.length; c++) {
    const h = (headerRow[c] ?? "").trim();
    if (/^\d/.test(h)) {
      dayColStart = c;
      break;
    }
  }
  if (dayColStart === -1) {
    dayColStart = 4;
  }

  const typeCol = Math.max(0, dayColStart - 1);

  // 2. Check if sub-rows exist (Clock In / Clock Out / Total WK)
  let hasSubRows = false;

  // Check header row labels before dayColStart
  for (let c = 0; c < dayColStart; c++) {
    const hLabel = (headerRow[c] ?? "").trim().toLowerCase();
    if (hLabel.includes("type") || hLabel.includes("status")) {
      hasSubRows = true;
      break;
    }
  }

  // Check data rows for empty col 0 with subType labels
  if (!hasSubRows) {
    for (let r = 1; r < Math.min(rows.length, 100); r++) {
      const row = rows[r];
      if (!cell(row, detectIdentityCols(headerRow, dayColStart).id)) {
        for (let c = 0; c < dayColStart; c++) {
          const label = (row[c] ?? "").trim().toLowerCase();
          if (
            label === "clock in" ||
            label === "clock out" ||
            label === "total wk" ||
            label === "clock-in" ||
            label === "clock-out" ||
            label === "status"
          ) {
            hasSubRows = true;
            break;
          }
        }
        if (hasSubRows) break;
      }
    }
  }

  return { dayColStart, hasSubRows, typeCol };
}

// ── Identity column detector ────────────────────────────────────────────────
// Locates the employee-info columns (ID, Name, Team, BU Lead, Designation,
// Entity Status) by header name, so columns can be added / reordered in the
// sheet without breaking parsing. Falls back to the legacy fixed layout
// (A = ID, B = Name, C = Team, D = BU Lead) when headers are not recognised.
export interface IdentityCols {
  id: number;
  name: number;
  team: number;
  buLead: number;
  designation: number; // -1 if absent
  entity: number;      // -1 if absent
}

export function detectIdentityCols(headerRow: string[], dayColStart: number): IdentityCols {
  const hdr = (headerRow ?? []).slice(0, dayColStart).map(h => (h ?? "").trim().toLowerCase());
  const find = (...candidates: string[]) =>
    hdr.findIndex(h => !!h && candidates.some(c => h === c || h.includes(c)));

  const id = find("employee id", "emp id", "employee number", "employee code");
  if (id === -1) {
    // Legacy layout
    return {
      id: 0,
      name: 1,
      team: dayColStart > 2 ? 2 : -1,
      buLead: dayColStart > 3 ? 3 : -1,
      designation: -1,
      entity: -1,
    };
  }
  return {
    id,
    name:        find("first name", "employee name", "full name", "name"),
    team:        find("team / bu", "team/bu", "team"),
    buLead:      find("bu lead", "lead"),
    designation: find("designation"),
    entity:      find("employee entity status", "entity status", "employment type", "fte/intern"),
  };
}

// A day column header starts with the day number ("1 Thu", "1-Jan (Thu)").
// Day columns end at the first header that doesn't — e.g. "Total …",
// "Date of Joining", or a blank cell.
export function isDayHeader(h: string): boolean {
  return /^\d/.test((h ?? "").trim());
}

// Columns AFTER the day block (e.g. "Date of Joining" / "Date of Leaving").
function detectTrailingCols(headerRow: string[], afterCol: number): { doj: number; dol: number } {
  let doj = -1, dol = -1;
  for (let c = afterCol; c < (headerRow ?? []).length; c++) {
    const h = (headerRow[c] ?? "").trim().toLowerCase();
    if (doj === -1 && (h.includes("date of joining") || h === "doj" || h.includes("joining date"))) doj = c;
    if (dol === -1 && (h.includes("date of leaving") || h.includes("date of exit") || h === "dol" || h.includes("leaving date") || h.includes("exit date"))) dol = c;
  }
  return { doj, dol };
}

const cell = (row: string[] | undefined, idx: number) =>
  idx < 0 || !row ? "" : (row[idx] ?? "").trim();

// ── Parse raw rows into MonthData ────────────────────────────────────────────
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
  const { dayColStart, hasSubRows: isNewFormat, typeCol } = detectFormat(rows);
  const ic = detectIdentityCols(headerRow, dayColStart);

  // ── Identify day column indices + headers ─────────────────────────────────
  const dayColIndices: number[] = [];
  const columnHeaders: string[] = [];

  for (let i = dayColStart; i < headerRow.length; i++) {
    const h = (headerRow[i] ?? "").trim();
    if (!isDayHeader(h)) break;
    dayColIndices.push(i);
    columnHeaders.push(h);
  }
  const lastDayCol = dayColIndices.length ? dayColIndices[dayColIndices.length - 1] : dayColStart - 1;
  const tc = detectTrailingCols(headerRow, lastDayCol + 1);

  // Helper: column header ("1 Th" or "1-Jan (Thu)" or "1 M") → day number
  function dayNumFromHeader(header: string, fallback: number): number {
    return parseInt(header.split(/[\s-]/)[0], 10) || fallback;
  }

  // ── Phase 1: build days arrays for every employee ─────────────────────────
  type EmpGroup = {
    employeeId: string; name: string; team: string; buLead: string;
    designation: string; employmentType: string;
    dateOfJoining: string; dateOfLeaving: string;
    days: DayRecord[];
  };
  const groups: EmpGroup[] = [];

  if (isNewFormat) {
    let i = 1;
    while (i < rows.length) {
      const row        = rows[i];
      const employeeId = cell(row, ic.id);
      if (!employeeId) { i++; continue; }

      const name   = cell(row, ic.name);
      const team   = ic.team   < typeCol ? cell(row, ic.team)   : "";
      const buLead = ic.buLead < typeCol ? cell(row, ic.buLead) : "";
      const designation    = cell(row, ic.designation);
      const employmentType = cell(row, ic.entity);
      const dateOfJoining  = cell(row, tc.doj);
      const dateOfLeaving  = cell(row, tc.dol);
      const statusRow = dayColIndices.map(ci => (row[ci] ?? "").trim());

      let clockInRow:  string[] = [];
      let clockOutRow: string[] = [];
      let hoursRow:    string[] = [];

      i++;
      while (i < rows.length && !cell(rows[i], ic.id)) {
        const sub     = rows[i];
        const subType = (sub[typeCol] ?? "").trim().toLowerCase();
        if (subType === "clock in" || subType === "clock-in") {
          clockInRow  = dayColIndices.map(ci => (sub[ci] ?? "").trim());
        } else if (subType === "clock out" || subType === "clock-out") {
          clockOutRow = dayColIndices.map(ci => (sub[ci] ?? "").trim());
        } else if (subType === "total wk" || subType === "total work" || subType === "hours" || subType === "total hours") {
          hoursRow    = dayColIndices.map(ci => (sub[ci] ?? "").trim());
        }
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

      groups.push({ employeeId, name, team, buLead, designation, employmentType, dateOfJoining, dateOfLeaving, days });
    }
  } else {
    for (let r = 1; r < rows.length; r++) {
      const row        = rows[r];
      const employeeId = cell(row, ic.id);
      if (!employeeId) continue;

      const name   = cell(row, ic.name);
      const team   = cell(row, ic.team);
      const buLead = cell(row, ic.buLead);
      const designation    = cell(row, ic.designation);
      const employmentType = cell(row, ic.entity);
      const dateOfJoining  = cell(row, tc.doj);
      const dateOfLeaving  = cell(row, tc.dol);

      const days: DayRecord[] = dayColIndices.map((colIdx, i) => {
        const raw    = row[colIdx] ?? "";
        const header = columnHeaders[i] ?? "";
        return {
          date:      header,
          dayNumber: dayNumFromHeader(header, i + 1),
          symbol:    parseSymbol(raw),
        };
      });

      groups.push({ employeeId, name, team, buLead, designation, employmentType, dateOfJoining, dateOfLeaving, days });
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
  // Inactive (exited) days on company working days are removed from that
  // employee's denominator so leaving mid-month doesn't tank their %.
  //
  // Absent = Working Days − (leaves + WFH + NHD + HD + P), counted only on the
  // company working-day columns. Blank days later than today (current month)
  // are not yet absent, so they are treated as accounted.
  const now = new Date();
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() === monthIndex;
  const isFutureMonth  = year > now.getFullYear() || (year === now.getFullYear() && monthIndex > now.getMonth());
  const records: EmployeeMonthRecord[] = groups.map(g => {
    let inactiveWorkingDays = 0;
    let accountedWorkingDays = 0;
    g.days.forEach((day, colIdx) => {
      if (woColSet.has(colIdx) || nhdColSet.has(colIdx)) return;
      if (day.symbol === "IN") { inactiveWorkingDays++; return; }
      const notYet = day.symbol === "" && (isFutureMonth || (isCurrentMonth && day.dayNumber > now.getDate()));
      if (notYet || isAccountedSymbol(day.symbol)) accountedWorkingDays++;
    });
    const rec = computeRecord(
      g.employeeId, g.name, g.team, g.buLead, g.days,
      Math.max(0, companyWorkingDays - inactiveWorkingDays),
      accountedWorkingDays,
    );
    if (g.designation)    rec.designation    = g.designation;
    if (g.employmentType) rec.employmentType = g.employmentType;
    if (g.dateOfJoining)  rec.dateOfJoining  = g.dateOfJoining;
    if (g.dateOfLeaving)  rec.dateOfLeaving  = g.dateOfLeaving;
    return rec;
  });

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
// Team names are compared case/whitespace-insensitively so "Design", "design "
// and "DESIGN" in the sheet / managers DB all match.
export function sameTeam(a: string | undefined | null, b: string | undefined | null): boolean {
  const norm = (v: string | undefined | null) => (v ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  return !!norm(a) && norm(a) === norm(b);
}

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

// Convert 0-based column index to A1 letter(s)  (0→A, 25→Z, 26→AA, …)
function colIndexToLetter(idx: number): string {
  let letter = "";
  let n = idx;
  while (n >= 0) {
    letter = String.fromCharCode((n % 26) + 65) + letter;
    n = Math.floor(n / 26) - 1;
  }
  return letter;
}

// Builds the empty row block for one employee in a tab's layout: the info /
// Status row plus (new format) Clock In / Clock Out / Total WK sub-rows.
// Identity values go into the columns detected from that tab's header; any
// missing value is left blank.
function buildEmployeeBlock(
  headerRows: string[][],
  employee: Partial<Employee> & { employeeId: string },
): { rows: string[][]; dayColStart: number; hasSubRows: boolean } {
  const fmt = headerRows.length
    ? detectFormat(headerRows)
    : { dayColStart: 5, hasSubRows: true, typeCol: 4 };
  const ic  = detectIdentityCols(headerRows[0] ?? [], fmt.dayColStart);
  const width = fmt.hasSubRows ? fmt.typeCol + 1 : fmt.dayColStart;
  const info = new Array<string>(width).fill("");
  const put = (idx: number, v: string | undefined) => {
    if (idx >= 0 && idx < width && v) info[idx] = v;
  };
  put(ic.id,          employee.employeeId);
  put(ic.name,        employee.name);
  put(ic.team,        employee.team);
  put(ic.buLead,      employee.buLead);
  put(ic.designation, employee.designation);
  put(ic.entity,      employee.employmentType);
  if (!fmt.hasSubRows) return { rows: [info], dayColStart: fmt.dayColStart, hasSubRows: false };
  const sub = (label: string) => {
    const r = new Array<string>(width).fill("");
    r[fmt.typeCol] = label;
    return r;
  };
  info[fmt.typeCol] = "Status";
  return {
    rows: [info, sub("Clock In"), sub("Clock Out"), sub("Total WK")],
    dayColStart: fmt.dayColStart,
    hasSubRows: true,
  };
}

export async function addEmployee(
  employee: Employee,
  joinMonth: number,   // 0-indexed: 0 = January … 11 = December
  joinYear:  number,
  joinDate:  number = 1,   // 1-indexed day of the joining month (1–31). Defaults to 1
  endMonth:  number = 11,  // 0-indexed inclusive upper bound (defaults to December)
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
  // The employee is written to every month from joinMonth up to endMonth
  // (inclusive).
  const upperBound  = Math.min(Math.max(endMonth, joinMonth), 11);
  const tabsToWrite = MONTH_NAMES.filter(
    (_, monthIdx) => monthIdx >= joinMonth && monthIdx <= upperBound,
  );

  // ── 3/4. Row layout is built per tab (see buildBlock below) because tabs can
  // have different column layouts (e.g. older months: ID/Name/Team/BU Lead;
  // newer months: Entity Status/Designation/ID/Name/Team/BU Lead).
  const buildBlock = (headerRows: string[][]) => buildEmployeeBlock(headerRows, employee);

  // ── 5. Write each tab: find the true last row, then write the block ──────
  //
  // NOTE: We deliberately do NOT use spreadsheets.values.append here. In the
  // new format an employee spans 4 rows (Status + Clock In / Out / Total WK)
  // where the sub-rows have an EMPTY column A. Google's append "table
  // detection" treats the previous employee's Status row as the last row and,
  // with the default OVERWRITE option, clobbers the sub-rows of whoever was
  // added just before. Instead we read the sheet, compute the real last used
  // row (values.get already trims trailing empties), and write the block at
  // lastRow+1 with a plain update — deterministic and gap-free.
  const writeErrors: string[] = [];
  for (const tabName of tabsToWrite) {
    if (!existingTabs.has(tabName)) continue;
    try {
      // Read existing rows across the full width so the last row reflects
      // day-cell data too (not just A:E). Trailing empty rows are trimmed.
      const cur = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: tabName,
      });
      const curRows = (cur.data.values ?? []) as string[][];
      const lastRow    = curRows.length;   // 1-based index of last non-empty row
      const writeStart = lastRow + 1;

      // Build the block for this tab's layout (also used to inject joining-day "P").
      const { rows, dayColStart } = buildBlock(curRows);

      // ── Mark 'P' on the joining date — only for the joining month tab ───
      if (tabName === MONTH_NAMES[joinMonth] && joinDate >= 1) {
        const headers = curRows[0] ?? [];
        let dayColAbsIdx = -1;
        for (let i = dayColStart; i < headers.length; i++) {
          const h = (headers[i] ?? "").trim();
          if (!isDayHeader(h)) break;
          // Headers look like "1 Th" or "1-Jan Thu" — day number is the first token
          const dayNum = parseInt(h.split(/[\s-]/)[0], 10);
          if (dayNum === joinDate) { dayColAbsIdx = i; break; }
        }
        if (dayColAbsIdx >= 0) {
          while (rows[0].length <= dayColAbsIdx) rows[0].push("");
          rows[0][dayColAbsIdx] = "P";
        }
      }

      // Write the whole block starting at column A of the first free row.
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${tabName}!A${writeStart}`,
        valueInputOption: "RAW",
        requestBody: { values: rows },
      });
    } catch (err: unknown) {
      // Extract the actual Google API error message if available
      let detail = String(err);
      if (err && typeof err === "object") {
        const e = err as Record<string, unknown>;
        if (typeof e.message === "string") detail = e.message;
        const errData = (e as { errors?: Array<{ message: string }> }).errors;
        if (Array.isArray(errData) && errData[0]?.message) detail = errData[0].message;
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

// ── Update attendance from uploaded CSV ───────────────────────────────────────
//
// Reads the CSV rows (already split into string[][]), parses them with
// parseMonthData, then writes ONLY the attendance cells back to the Google
// Sheet tab for that month.
//
// Rules:
//  • First 4 columns (ID, Name, Team, BU Lead) are NEVER touched.
//  • Days where the CSV has an empty symbol ("") are SKIPPED — existing sheet
//    data is preserved for those cells.
//  • Days with a real symbol (P/A/WFH/HD/WO/NHD) are written (overwrite).
//  • Clock In / Clock Out / Total WK cells are written only when present in CSV.
//
export type AttendanceUploadMode = "all" | "wfh" | "leave";

export async function updateAttendanceFromCsv(
  monthIndex: number,
  csvRows: string[][],
  mode: AttendanceUploadMode = "all",
): Promise<{ employeesUpdated: number; cellsWritten: number; notFound: string[] }> {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error("GOOGLE_SHEET_ID not set");

  const tabName     = MONTH_TAB_NAMES[monthIndex];
  const displayName = MONTH_DISPLAY_NAMES[monthIndex];
  const sheets      = getSheetsClient();

  // 1. Parse CSV into records (each record has days: DayRecord[])
  const csvData = parseMonthData(csvRows, displayName, monthIndex, new Date().getFullYear());
  if (!csvData.records.length) {
    throw new Error("No employee records found in the uploaded file");
  }

  // 2. Read the Google Sheet tab
  const sheetRes = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: tabName,
  });
  const sheetRows = (sheetRes.data.values ?? []) as string[][];
  if (!sheetRows.length) throw new Error(`Sheet tab "${tabName}" is empty or does not exist`);

  // 3. Detect format, build day-number → column index map
  const sheetHeader = sheetRows[0];
  const { dayColStart, hasSubRows: isNewFmt, typeCol } = detectFormat(sheetRows);
  const idCol = detectIdentityCols(sheetHeader, dayColStart).id;

  // Map: 1-based day number (1–31) → 0-based column index in the sheet row
  const dayNumToColIdx = new Map<number, number>();
  for (let i = dayColStart; i < sheetHeader.length; i++) {
    const h = (sheetHeader[i] ?? "").trim();
    if (!isDayHeader(h)) break;
    const n = parseInt(h.split(/[\s-]/)[0], 10);
    if (!isNaN(n)) dayNumToColIdx.set(n, i);
  }

  // 4. Build employee ID → sheet row numbers (1-indexed for Sheets API)
  type EmpRows = { status: number; clockIn: number; clockOut: number; hours: number };
  const empRowMap = new Map<string, EmpRows>();

  let ri = 1;
  while (ri < sheetRows.length) {
    const row = sheetRows[ri];
    const id  = cell(row, idCol).toUpperCase();
    if (!id) { ri++; continue; }

    const entry: EmpRows = { status: ri + 1, clockIn: -1, clockOut: -1, hours: -1 };

    if (isNewFmt) {
      let j = ri + 1;
      while (j < sheetRows.length && !cell(sheetRows[j], idCol)) {
        const sub = (sheetRows[j][typeCol] ?? "").trim().toLowerCase();
        if (sub === "clock in" || sub === "clock-in")       entry.clockIn  = j + 1;
        else if (sub === "clock out" || sub === "clock-out") entry.clockOut = j + 1;
        else if (sub === "total wk" || sub === "total work" || sub === "hours")  entry.hours    = j + 1;
        j++;
      }
      empRowMap.set(id, entry);
      ri = j;
    } else {
      empRowMap.set(id, entry);
      ri++;
    }
  }

  // 5. Build ValueRanges for batch update
  const data: { range: string; values: string[][] }[] = [];
  const notFound: string[] = [];
  let employeesUpdated = 0;

  for (const record of csvData.records) {
    const empKey  = record.employeeId.toUpperCase();
    const empRows = empRowMap.get(empKey);
    if (!empRows) { notFound.push(record.employeeId); continue; }

    let touched = false;

    for (const day of record.days) {
      if (!day.symbol) continue; // skip empty days

      // Mode filter:
      //  "wfh"   → only write WFH symbols
      //  "leave" → only write A / HD symbols
      //  "all"   → write everything
      if (mode === "wfh"   && day.symbol !== "WFH") continue;
      if (mode === "leave" && day.symbol !== "A" && day.symbol !== "HD") continue;

      const colIdx = dayNumToColIdx.get(day.dayNumber);
      if (colIdx === undefined) continue; // date not in this sheet tab

      const col = colIndexToLetter(colIdx);

      // Status
      data.push({ range: `${tabName}!${col}${empRows.status}`, values: [[day.symbol]] });

      // Clock data: only for "all" and "wfh" modes (leave has no clock data)
      if (isNewFmt && mode !== "leave") {
        if (empRows.clockIn  > 0 && day.clockIn)     data.push({ range: `${tabName}!${col}${empRows.clockIn}`,  values: [[day.clockIn]] });
        if (empRows.clockOut > 0 && day.clockOut)    data.push({ range: `${tabName}!${col}${empRows.clockOut}`, values: [[day.clockOut]] });
        if (empRows.hours    > 0 && day.hoursWorked) data.push({ range: `${tabName}!${col}${empRows.hours}`,    values: [[day.hoursWorked]] });
      }

      touched = true;
    }

    if (touched) employeesUpdated++;
  }

  if (!data.length) {
    return { employeesUpdated: 0, cellsWritten: 0, notFound };
  }

  // 6. Batch-write all cells in one API call
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: {
      valueInputOption: "RAW",
      data,
    },
  });

  return { employeesUpdated, cellsWritten: data.length, notFound };
}

// ── Mark an employee inactive (exit) ─────────────────────────────────────────
//
// Destructive. Given the employee's exit "from" date:
//   1. In the from-date's month tab, every day from `from.day` to the end of the
//      month gets Status = "Inactive" and its Clock In / Clock Out / Total WK
//      cells cleared.
//   2. In every LATER month tab (from.month + 1 … Dec) the employee's rows
//      (Status row + its sub-rows) are deleted from the sheet entirely.
//
// Employee info columns in the from-date month are left untouched.
const SUB_ROW_LABELS = new Set([
  "clock in", "clock-in", "clock out", "clock-out",
  "total wk", "total work", "hours", "total hours",
]);

// Locate every row block (0-based [start, end) row indices) that belongs to
// `empKey`. In the new format a block is the Status row plus the consecutive
// sub-rows (empty column A + a known sub-row label) that follow it.
function findEmployeeBlocks(
  rows: string[][],
  empKey: string,
  isNewFmt: boolean,
  typeCol: number,
): { start: number; end: number; clockIn: number; clockOut: number; hours: number }[] {
  const blocks: { start: number; end: number; clockIn: number; clockOut: number; hours: number }[] = [];
  const idCol = detectIdentityCols(rows[0] ?? [], typeCol + 1).id;
  for (let r = 1; r < rows.length; r++) {
    const id = cell(rows[r], idCol).toUpperCase();
    if (id !== empKey) continue;
    const block = { start: r, end: r + 1, clockIn: -1, clockOut: -1, hours: -1 };
    if (isNewFmt) {
      let j = r + 1;
      while (j < rows.length && !cell(rows[j], idCol)) {
        const sub = (rows[j][typeCol] ?? "").trim().toLowerCase();
        if (!SUB_ROW_LABELS.has(sub)) break;
        if (sub === "clock in" || sub === "clock-in")        block.clockIn  = j;
        else if (sub === "clock out" || sub === "clock-out") block.clockOut = j;
        else                                                 block.hours    = j;
        j++;
      }
      block.end = j;
    }
    blocks.push(block);
  }
  return blocks;
}

export async function markEmployeeInactive(
  employeeId: string,
  from: { year: number; month: number; day: number },
): Promise<{
  found: boolean;
  daysMarked: number;
  monthsDeleted: string[];   // tab names the employee was removed from
}> {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error("GOOGLE_SHEET_ID not set");

  const sheets = getSheetsClient();
  const empKey = employeeId.trim().toUpperCase();

  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const tabIds = new Map<string, number>();
  for (const sh of meta.data.sheets ?? []) {
    const title = sh.properties?.title;
    const gid   = sh.properties?.sheetId;
    if (title && gid !== undefined && gid !== null) tabIds.set(title, gid);
  }

  let found = false;

  // ── 1. Exit month: write "Inactive" from `from.day` to month end ──────────
  const exitTab = MONTH_TAB_NAMES[from.month];
  const valueUpdates: { range: string; values: string[][] }[] = [];
  let daysMarked = 0;

  if (tabIds.has(exitTab)) {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: exitTab });
    const rows = (res.data.values ?? []) as string[][];
    if (rows.length) {
      const { dayColStart, hasSubRows: isNewFmt, typeCol } = detectFormat(rows);
      const header = rows[0];
      const dayCols: { day: number; col: number }[] = [];
      for (let i = dayColStart; i < header.length; i++) {
        const h = (header[i] ?? "").trim();
        if (!isDayHeader(h)) break;
        const n = parseInt(h.split(/[\s-]/)[0], 10);
        if (!isNaN(n) && n >= from.day) dayCols.push({ day: n, col: i });
      }

      const blocks = findEmployeeBlocks(rows, empKey, isNewFmt, typeCol);
      if (blocks.length) found = true;

      for (const b of blocks) {
        for (const { col } of dayCols) {
          const letter = colIndexToLetter(col);
          valueUpdates.push({ range: `${exitTab}!${letter}${b.start + 1}`, values: [["Inactive"]] });
          for (const sub of [b.clockIn, b.clockOut, b.hours]) {
            if (sub >= 0) valueUpdates.push({ range: `${exitTab}!${letter}${sub + 1}`, values: [[""]] });
          }
        }
      }
      if (blocks.length) daysMarked = dayCols.length;
    }
  }

  // ── 2. Later months: delete the employee's rows entirely ──────────────────
  const deleteRequests: { deleteDimension: { range: { sheetId: number; dimension: "ROWS"; startIndex: number; endIndex: number } } }[] = [];
  const monthsDeleted: string[] = [];

  for (let m = from.month + 1; m < 12; m++) {
    const tab = MONTH_TAB_NAMES[m];
    const gid = tabIds.get(tab);
    if (gid === undefined) continue;

    const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: tab });
    const rows = (res.data.values ?? []) as string[][];
    if (!rows.length) continue;

    const { hasSubRows: isNewFmt, typeCol } = detectFormat(rows);
    const blocks = findEmployeeBlocks(rows, empKey, isNewFmt, typeCol);
    if (!blocks.length) continue;

    found = true;
    monthsDeleted.push(tab);
    // Delete bottom-up so earlier indices stay valid within the same tab
    for (const b of [...blocks].sort((a, z) => z.start - a.start)) {
      deleteRequests.push({
        deleteDimension: {
          range: { sheetId: gid, dimension: "ROWS", startIndex: b.start, endIndex: b.end },
        },
      });
    }
  }

  // Write values first (row indices in the exit tab are unaffected by deletes
  // in other tabs, but keep the order deterministic anyway).
  if (valueUpdates.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: { valueInputOption: "RAW", data: valueUpdates },
    });
  }
  if (deleteRequests.length) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: { requests: deleteRequests },
    });
  }

  return { found, daysMarked, monthsDeleted };
}


// ── Full sync from the Monthly Attendance Report ─────────────────────────────
//
// Makes the month tab contain EXACTLY the employees in the uploaded report:
//   • ID in report AND sheet  → attendance cells updated (updateAttendanceFromCsv
//                               rules: empty cells skipped, info columns untouched)
//   • ID in report, not sheet → new block appended at the bottom in the tab's
//                               layout; identity fields the report lacks stay blank
//   • ID in sheet, not report → the employee's rows (Status + sub-rows) deleted
//
// Before any write a backup copy of the tab is created ("Nov backup …").
// With dryRun the sheet is only read and the planned changes are returned.
export interface SyncEmployeeRef { employeeId: string; name: string }
export interface SyncPlan {
  tab: string;
  csvEmployees: number;
  sheetEmployees: number;
  toUpdate: number;
  toAdd: SyncEmployeeRef[];
  toRemove: SyncEmployeeRef[];
}

export async function syncAttendanceFromCsv(
  monthIndex: number,
  csvRows: string[][],
  opts: { dryRun: boolean },
): Promise<{
  plan: SyncPlan;
  backupTab?: string;
  employeesUpdated?: number;
  cellsWritten?: number;
}> {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error("GOOGLE_SHEET_ID not set");

  const tabName     = MONTH_TAB_NAMES[monthIndex];
  const displayName = MONTH_DISPLAY_NAMES[monthIndex];
  const sheets      = getSheetsClient();

  // 1. Uploaded report → one record per employee ID (first occurrence wins)
  const csvData = parseMonthData(csvRows, displayName, monthIndex, new Date().getFullYear());
  if (!csvData.records.length) throw new Error("No employee records found in the uploaded file");
  const csvById = new Map<string, EmployeeMonthRecord>();
  for (const r of csvData.records) {
    const key = r.employeeId.trim().toUpperCase();
    if (key && !csvById.has(key)) csvById.set(key, r);
  }

  // The report carries "Department" instead of "Team" — use it as the team
  // for newly added employees when the report has no Team column.
  const csvFmt = detectFormat(csvRows);
  const csvIc  = detectIdentityCols(csvRows[0], csvFmt.dayColStart);
  const deptCol = (csvRows[0] ?? [])
    .slice(0, csvFmt.dayColStart)
    .findIndex(h => (h ?? "").trim().toLowerCase().includes("department"));
  const deptById = new Map<string, string>();
  if (deptCol >= 0) {
    for (const row of csvRows.slice(1)) {
      const id = cell(row, csvIc.id).toUpperCase();
      if (id && !deptById.has(id)) deptById.set(id, cell(row, deptCol));
    }
  }

  // 2. Current sheet tab + its row blocks per employee
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const tabMeta = (meta.data.sheets ?? []).find(sh => sh.properties?.title === tabName);
  const gid = tabMeta?.properties?.sheetId;
  if (gid === undefined || gid === null) throw new Error(`Sheet tab "${tabName}" does not exist`);

  const sheetRes  = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: tabName });
  const sheetRows = (sheetRes.data.values ?? []) as string[][];
  if (!sheetRows.length) throw new Error(`Sheet tab "${tabName}" is empty`);

  const header = sheetRows[0];
  const { dayColStart, hasSubRows: isNewFmt, typeCol } = detectFormat(sheetRows);
  const ic = detectIdentityCols(header, dayColStart);
  const idHeader = cell(header, ic.id).toUpperCase();

  type Block = { id: string; name: string; start: number; end: number };
  const blocks: Block[] = [];
  for (let r = 1; r < sheetRows.length; r++) {
    const id = cell(sheetRows[r], ic.id).toUpperCase();
    if (!id || id === idHeader) continue;
    let end = r + 1;
    if (isNewFmt) {
      while (
        end < sheetRows.length &&
        !cell(sheetRows[end], ic.id) &&
        SUB_ROW_LABELS.has((sheetRows[end][typeCol] ?? "").trim().toLowerCase())
      ) end++;
    }
    blocks.push({ id, name: cell(sheetRows[r], ic.name), start: r, end });
  }
  const sheetIds = new Set(blocks.map(b => b.id));

  const removeBlocks = blocks.filter(b => !csvById.has(b.id));
  const addRecords   = [...csvById.entries()].filter(([id]) => !sheetIds.has(id)).map(([, r]) => r);

  const removedSeen = new Set<string>();
  const plan: SyncPlan = {
    tab: tabName,
    csvEmployees: csvById.size,
    sheetEmployees: sheetIds.size,
    toUpdate: csvById.size - addRecords.length,
    toAdd: addRecords.map(r => ({ employeeId: r.employeeId, name: r.name })),
    toRemove: removeBlocks
      .filter(b => (removedSeen.has(b.id) ? false : (removedSeen.add(b.id), true)))
      .map(b => ({ employeeId: b.id, name: b.name })),
  };
  if (opts.dryRun) return { plan };

  // 3. Backup copy of the tab before anything is written
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ").replace(":", "");
  const backupTab = `${tabName} backup ${stamp}`;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: {
      requests: [{
        duplicateSheet: {
          sourceSheetId: gid,
          newSheetName: backupTab,
          insertSheetIndex: (meta.data.sheets ?? []).length,
        },
      }],
    },
  });

  // 4. Update employees present in both (row numbers unchanged by this step)
  const updated = await updateAttendanceFromCsv(monthIndex, csvRows, "all");
  let cellsWritten = updated.cellsWritten;

  // 5. Append new employees below the last used row
  if (addRecords.length) {
    const dayNumToColIdx = new Map<number, number>();
    for (let i = dayColStart; i < header.length; i++) {
      const h = (header[i] ?? "").trim();
      if (!isDayHeader(h)) break;
      const n = parseInt(h.split(/[\s-]/)[0], 10);
      if (!isNaN(n)) dayNumToColIdx.set(n, i);
    }

    const out: string[][] = [];
    for (const r of addRecords) {
      const key = r.employeeId.trim().toUpperCase();
      const { rows, hasSubRows } = buildEmployeeBlock(sheetRows, {
        employeeId:     r.employeeId,
        name:           r.name,
        team:           r.team || deptById.get(key) || "",
        buLead:         r.buLead,
        designation:    r.designation,
        employmentType: r.employmentType,
      });
      const set = (rowIdx: number, col: number, v: string | undefined) => {
        if (!v || rowIdx >= rows.length) return;
        while (rows[rowIdx].length <= col) rows[rowIdx].push("");
        rows[rowIdx][col] = v;
        cellsWritten++;
      };
      for (const d of r.days) {
        const col = dayNumToColIdx.get(d.dayNumber);
        if (col === undefined) continue;
        set(0, col, d.symbol || undefined);
        if (hasSubRows) {
          set(1, col, d.clockIn);
          set(2, col, d.clockOut);
          set(3, col, d.hoursWorked);
        }
      }
      out.push(...rows);
    }
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${tabName}!A${sheetRows.length + 1}`,
      valueInputOption: "RAW",
      requestBody: { values: out },
    });
  }

  // 6. Delete removed employees bottom-up so earlier row indices stay valid.
  // Appended rows sit below every deleted block, so they just shift up.
  if (removeBlocks.length) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: {
        requests: [...removeBlocks]
          .sort((a, z) => z.start - a.start)
          .map(b => ({
            deleteDimension: {
              range: { sheetId: gid, dimension: "ROWS" as const, startIndex: b.start, endIndex: b.end },
            },
          })),
      },
    });
  }

  return {
    plan,
    backupTab,
    employeesUpdated: updated.employeesUpdated + addRecords.length,
    cellsWritten,
  };
}


// ── Update WFH data from HR Excel export ──────────────────────────────────────
//
// Accepts the raw file buffer of the "Attendance Working Remotely requests" XLSX
// exported from the HR system.  Looks for columns:
//   "Employee Number" | "Request Type" | "Request Status" | "From Date" | "To Date"
//
// Only rows where Request Type == "WFH" AND Request Status == "Approved" are
// processed.  For each approved WFH, every calendar day in [From Date, To Date]
// is written to the corresponding month tab:
//   Status → "WFH"  |  Clock In → "10:00"  |  Clock Out → "19:00"  |  Total WK → "09:00"
//
export async function updateWFHFromExcel(
  fileBuffer: Buffer,
  targetMonth?: number,   // 0-indexed; when provided, only this month's entries are written
): Promise<{
  rowsProcessed: number;
  cellsWritten:  number;
  skipped:       string[];
  errors:        string[];
  monthsInFile:  number[];
}> {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error("GOOGLE_SHEET_ID not set");

  // 1. Parse the Excel file
  const wb = XLSX.read(fileBuffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<(string | number)[]>(ws, {
    header: 1,
    defval: "",
    raw: true,          // keep numeric date serials as numbers
  }) as (string | number)[][];

  if (rawRows.length < 2) throw new Error("Excel file appears to be empty");

  // 2. Locate required columns by header name (case-insensitive, flexible order)
  const hdr = rawRows[0].map(h => String(h).trim().toLowerCase());
  const ci = {
    empId:    hdr.indexOf("employee number"),
    reqType:  hdr.indexOf("request type"),
    status:   hdr.indexOf("request status"),
    fromDate: hdr.indexOf("from date"),
    toDate:   hdr.indexOf("to date"),
  };
  const missing = Object.entries(ci)
    .filter(([, v]) => v < 0)
    .map(([k]) => k);
  if (missing.length) {
    throw new Error(`Missing required columns in Excel: ${missing.join(", ")}`);
  }

  // Excel serial → UTC Date
  // Serial 25569 == Unix epoch (1970-01-01)
  const serialToDate = (serial: number): Date =>
    new Date((serial - 25569) * 86400 * 1000);

  // Request Type → attendance symbol.
  //  • "WFH" (work from home)     → "WFH"
  //  • "On Duty" (official duty)  → "WFH"
  // Any other request type is reported in `skipped` so nothing is silently lost.
  const REQUEST_SYMBOL: Record<string, AttendanceSymbol> = {
    "wfh":            "WFH",
    "work from home": "WFH",
    "on duty":        "WFH",
    "onduty":         "WFH",
  };

  // 3. Parse approved rows → group individual dates by month (0-indexed)
  type DateEntry = { employeeId: string; date: Date; symbol: AttendanceSymbol };
  const byMonth = new Map<number, DateEntry[]>();  // monthIndex → entries
  const skipped: string[] = [];
  let rowsProcessed = 0;

  for (let r = 1; r < rawRows.length; r++) {
    const row        = rawRows[r];
    const empId      = String(row[ci.empId]   ?? "").trim();
    const reqTypeRaw = String(row[ci.reqType]  ?? "").trim();
    // Normalise "On-Duty", "On  Duty", "ON DUTY" etc. → "on duty"
    const reqType    = reqTypeRaw.toLowerCase().replace(/[^a-z]+/g, " ").trim();
    const status     = String(row[ci.status]   ?? "").trim().toLowerCase();

    if (!empId) continue;
    if (status !== "approved") {
      skipped.push(`${empId}: ${status || "no status"}`);
      continue;
    }

    // Map the request type to a symbol; skip (but report) unknown types.
    const symbol = REQUEST_SYMBOL[reqType];
    if (!symbol) {
      skipped.push(`${empId}: unsupported request type "${reqTypeRaw}"`);
      continue;
    }

    const fromSerial = Number(row[ci.fromDate]);
    const toSerial   = Number(row[ci.toDate]);
    if (isNaN(fromSerial) || isNaN(toSerial)) {
      skipped.push(`${empId}: invalid dates`);
      continue;
    }

    const fromDate = serialToDate(fromSerial);
    const toDate   = serialToDate(toSerial);

    // Expand date range day by day
    const cur = new Date(fromDate);
    while (cur <= toDate) {
      const mIdx = cur.getUTCMonth();   // 0-11
      if (!byMonth.has(mIdx)) byMonth.set(mIdx, []);
      byMonth.get(mIdx)!.push({ employeeId: empId, date: new Date(cur), symbol });
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    rowsProcessed++;
  }

  // Which months does the file actually contain (before any target filter)?
  const monthsInFile = [...byMonth.keys()].sort((a, b) => a - b);

  if (!rowsProcessed) {
    return { rowsProcessed: 0, cellsWritten: 0, skipped, errors: [], monthsInFile };
  }

  // If a target month was chosen, only write that month; drop the rest.
  if (typeof targetMonth === "number") {
    for (const m of monthsInFile) {
      if (m !== targetMonth) byMonth.delete(m);
    }
  }

  // 4. Update each affected month tab
  const sheets = getSheetsClient();
  let totalCells = 0;
  const errors: string[] = [];

  for (const [mIdx, entries] of byMonth) {
    const tabName = MONTH_TAB_NAMES[mIdx];

    // Read the sheet tab
    let sheetRows: string[][];
    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: tabName,
      });
      sheetRows = (res.data.values ?? []) as string[][];
    } catch {
      errors.push(`Could not read tab "${tabName}" — it may not exist yet`);
      continue;
    }
    if (!sheetRows.length) { errors.push(`Tab "${tabName}" is empty`); continue; }

    // Detect format + build day-number → column index map
    const sheetHdr = sheetRows[0];
    const { dayColStart, hasSubRows: isNewFmt, typeCol } = detectFormat(sheetRows);
    const idCol = detectIdentityCols(sheetHdr, dayColStart).id;

    const dayNumToColIdx = new Map<number, number>();
    for (let i = dayColStart; i < sheetHdr.length; i++) {
      const h = (sheetHdr[i] ?? "").trim();
      if (!isDayHeader(h)) break;
      const n = parseInt(h.split(/[\s-]/)[0], 10);
      if (!isNaN(n)) dayNumToColIdx.set(n, i);
    }

    // Build employee ID → row indices (1-indexed for Sheets API)
    type EmpRows = { status: number; clockIn: number; clockOut: number; hours: number };
    const empRowMap = new Map<string, EmpRows>();
    let ri = 1;
    while (ri < sheetRows.length) {
      const row = sheetRows[ri];
      const id  = cell(row, idCol).toUpperCase();
      if (!id) { ri++; continue; }

      const entry: EmpRows = { status: ri + 1, clockIn: -1, clockOut: -1, hours: -1 };
      if (isNewFmt) {
        let j = ri + 1;
        while (j < sheetRows.length && !cell(sheetRows[j], idCol)) {
          const sub = (sheetRows[j][typeCol] ?? "").trim().toLowerCase();
          if (sub === "clock in" || sub === "clock-in")       entry.clockIn  = j + 1;
          else if (sub === "clock out" || sub === "clock-out") entry.clockOut = j + 1;
          else if (sub === "total wk" || sub === "total work" || sub === "hours")  entry.hours    = j + 1;
          j++;
        }
        empRowMap.set(id, entry);
        ri = j;
      } else {
        empRowMap.set(id, entry);
        ri++;
      }
    }

    // Build batch update ranges
    const data: { range: string; values: string[][] }[] = [];
    for (const e of entries) {
      const empKey  = e.employeeId.toUpperCase();
      const empRows = empRowMap.get(empKey);
      if (!empRows) continue;                               // not in this tab

      const dayOfMonth = e.date.getUTCDate();               // 1-31
      const colIdx2    = dayNumToColIdx.get(dayOfMonth);
      if (colIdx2 === undefined) continue;

      const col = colIndexToLetter(colIdx2);
      data.push({ range: `${tabName}!${col}${empRows.status}`, values: [[e.symbol]] });
      if (isNewFmt) {
        // Both WFH and On Duty are full working days → standard 10:00–19:00 (9h).
        if (empRows.clockIn  > 0) data.push({ range: `${tabName}!${col}${empRows.clockIn}`,  values: [["10:00"]] });
        if (empRows.clockOut > 0) data.push({ range: `${tabName}!${col}${empRows.clockOut}`, values: [["19:00"]] });
        if (empRows.hours    > 0) data.push({ range: `${tabName}!${col}${empRows.hours}`,    values: [["09:00"]] });
      }
    }

    if (!data.length) continue;

    try {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: { valueInputOption: "RAW", data },
      });
      totalCells += data.length;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to write to tab "${tabName}": ${msg}`);
    }
  }

  return { rowsProcessed, cellsWritten: totalCells, skipped, errors, monthsInFile };
}

// ── Update attendance from Attendance Regularization export ──────────────────
//
// Accepts the "Attendance Regularization Requests" XLSX export (title rows
// before the header are fine — the header row is found by "Employee Number").
//
//   Employee Number → employee ID
//   Requested Date  → the day being regularized (marked Present)
//   Request Status  → only "Approved" rows are applied
//
// Every approved day is set to "P", whatever it currently holds (blank, A, HD,
// WO, leave, WFH, …); days already "P" are skipped. When the day
// has no clocked hours, the standard 10:00–19:00 (09:00) is filled in so the
// day counts towards Hours %, matching WFH uploads.
export async function updateRegularizationFromExcel(
  fileBuffer: Buffer,
  targetMonth?: number,   // 0-indexed; when provided, only this month's entries are written
): Promise<{
  rowsProcessed: number;
  cellsWritten:  number;
  daysMarked:    number;
  skipped:       string[];
  errors:        string[];
  monthsInFile:  number[];
}> {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error("GOOGLE_SHEET_ID not set");

  // 1. Parse the Excel file
  const wb = XLSX.read(fileBuffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<(string | number)[]>(ws, {
    header: 1, defval: "", raw: true,
  }) as (string | number)[][];

  const hdrIdx = rawRows.findIndex(row =>
    row.some(c => String(c ?? "").trim().toLowerCase() === "employee number"),
  );
  if (hdrIdx < 0) throw new Error('Could not find the "Employee Number" header row in the file');

  const hdr = rawRows[hdrIdx].map(h => String(h ?? "").trim().toLowerCase());
  const ci = {
    empId:   hdr.indexOf("employee number"),
    reqDate: hdr.indexOf("requested date"),
    status:  hdr.indexOf("request status"),
  };
  const missing = Object.entries(ci).filter(([, v]) => v < 0).map(([k]) => k);
  if (missing.length) throw new Error(`Missing required columns in Excel: ${missing.join(", ")}`);

  // 2. Approved rows → (employee, day) grouped by month
  type Entry = { employeeId: string; day: number };
  const byMonth = new Map<number, Entry[]>();
  const skipped: string[] = [];
  let rowsProcessed = 0;

  for (let r = hdrIdx + 1; r < rawRows.length; r++) {
    const row    = rawRows[r];
    const empId  = String(row[ci.empId] ?? "").trim();
    if (!empId) continue;
    const status = String(row[ci.status] ?? "").trim().toLowerCase();
    if (status !== "approved") {
      skipped.push(`${empId}: ${status || "no status"}`);
      continue;
    }
    const iso = parseHolidayDate(row[ci.reqDate]);
    if (!iso) {
      skipped.push(`${empId}: invalid requested date "${String(row[ci.reqDate] ?? "")}"`);
      continue;
    }
    const [, mo, d] = iso.split("-").map(Number);
    const mIdx = mo - 1;
    if (!byMonth.has(mIdx)) byMonth.set(mIdx, []);
    byMonth.get(mIdx)!.push({ employeeId: empId, day: d });
    rowsProcessed++;
  }

  const monthsInFile = [...byMonth.keys()].sort((a, b) => a - b);
  if (!rowsProcessed) {
    return { rowsProcessed: 0, cellsWritten: 0, daysMarked: 0, skipped, errors: [], monthsInFile };
  }
  if (typeof targetMonth === "number") {
    for (const m of monthsInFile) if (m !== targetMonth) byMonth.delete(m);
  }

  // 3. Update each affected month tab
  const sheets = getSheetsClient();
  let totalCells = 0;
  let daysMarked = 0;
  const errors: string[] = [];

  for (const [mIdx, entries] of byMonth) {
    const tabName = MONTH_TAB_NAMES[mIdx];

    let sheetRows: string[][];
    try {
      const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: tabName });
      sheetRows = (res.data.values ?? []) as string[][];
    } catch {
      errors.push(`Could not read tab "${tabName}" — it may not exist yet`);
      continue;
    }
    if (!sheetRows.length) { errors.push(`Tab "${tabName}" is empty`); continue; }

    const sheetHdr = sheetRows[0];
    const { dayColStart, hasSubRows: isNewFmt, typeCol } = detectFormat(sheetRows);
    const idCol = detectIdentityCols(sheetHdr, dayColStart).id;

    const dayNumToColIdx = new Map<number, number>();
    for (let i = dayColStart; i < sheetHdr.length; i++) {
      const h = (sheetHdr[i] ?? "").trim();
      if (!isDayHeader(h)) break;
      const n = parseInt(h.split(/[\s-]/)[0], 10);
      if (!isNaN(n)) dayNumToColIdx.set(n, i);
    }

    // Employee ID → 0-based row indices of the Status row and its sub-rows
    type EmpRows = { status: number; clockIn: number; clockOut: number; hours: number };
    const empRowMap = new Map<string, EmpRows>();
    let ri = 1;
    while (ri < sheetRows.length) {
      const id = cell(sheetRows[ri], idCol).toUpperCase();
      if (!id) { ri++; continue; }
      const entry: EmpRows = { status: ri, clockIn: -1, clockOut: -1, hours: -1 };
      let j = ri + 1;
      if (isNewFmt) {
        while (j < sheetRows.length && !cell(sheetRows[j], idCol)) {
          const sub = (sheetRows[j][typeCol] ?? "").trim().toLowerCase();
          if (sub === "clock in" || sub === "clock-in")        entry.clockIn  = j;
          else if (sub === "clock out" || sub === "clock-out") entry.clockOut = j;
          else if (sub === "total wk" || sub === "total work" || sub === "hours" || sub === "total hours") entry.hours = j;
          j++;
        }
      }
      if (!empRowMap.has(id)) empRowMap.set(id, entry);
      ri = j;
    }

    const data: { range: string; values: string[][] }[] = [];
    const seen = new Set<string>();
    let tabDays = 0;
    for (const e of entries) {
      const empKey = e.employeeId.toUpperCase();
      const key = `${empKey}:${e.day}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const rows = empRowMap.get(empKey);
      if (!rows) {
        const msg = `${e.employeeId}: not found in ${tabName} tab`;
        if (!skipped.includes(msg)) skipped.push(msg);
        continue;
      }
      const colIdx = dayNumToColIdx.get(e.day);
      if (colIdx === undefined) continue;

      // Approved regularization always wins — any existing value (A, HD, WO,
      // leave, WFH, …) is replaced with P. Only days already P are left as-is.
      const current = (sheetRows[rows.status]?.[colIdx] ?? "").trim();
      if (parseSymbol(current) === "P") {
        skipped.push(`${e.employeeId}: ${e.day} ${tabName} already "P"`);
        continue;
      }

      const col = colIndexToLetter(colIdx);
      data.push({ range: `${tabName}!${col}${rows.status + 1}`, values: [["P"]] });
      tabDays++;

      if (isNewFmt) {
        const hoursNow = rows.hours >= 0 ? (sheetRows[rows.hours]?.[colIdx] ?? "").trim() : "";
        if (!parseHHMM(hoursNow)) {
          if (rows.clockIn  >= 0) data.push({ range: `${tabName}!${col}${rows.clockIn  + 1}`, values: [["10:00"]] });
          if (rows.clockOut >= 0) data.push({ range: `${tabName}!${col}${rows.clockOut + 1}`, values: [["19:00"]] });
          if (rows.hours    >= 0) data.push({ range: `${tabName}!${col}${rows.hours    + 1}`, values: [["09:00"]] });
        }
      }
    }

    if (!data.length) continue;
    try {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: { valueInputOption: "RAW", data },
      });
      totalCells += data.length;
      daysMarked += tabDays;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to write to tab "${tabName}": ${msg}`);
    }
  }

  return { rowsProcessed, cellsWritten: totalCells, daysMarked, skipped, errors, monthsInFile };
}

// ── Update leave data from HR Excel export ────────────────────────────────────
//
// Accepts the "Employees Leave Requests" XLSX export.
// The file has 2 title rows before the column header, so the header is auto-detected
// by scanning for the row that contains "Employee Number".
//
// Leave type → symbol written to sheet:
//   "Menstrual Leave" → "ML"
//   "Sick Leave"      → "SL"
//   "Paid Leave"      → "PL"
//   (other)           → "A"
//
// Duration == 0.5 (half-day) → "HD" regardless of leave type.
// WO / NHD cells in the sheet are NEVER overwritten.
// No clock data is written for leave entries.
//
export async function updateLeaveFromExcel(
  fileBuffer: Buffer,
  targetMonth?: number,   // 0-indexed; when provided, only this month's entries are written
): Promise<{
  rowsProcessed: number;
  cellsWritten:  number;
  skipped:       string[];
  errors:        string[];
  monthsInFile:  number[];
}> {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error("GOOGLE_SHEET_ID not set");

  // 1. Parse Excel
  const wb = XLSX.read(fileBuffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<(string | number)[]>(ws, {
    header: 1, defval: "", raw: true,
  }) as (string | number)[][];

  if (rawRows.length < 2) throw new Error("Excel file appears to be empty");

  // 2. Find header row (flexible — could be row 0, 2, or elsewhere)
  const hdrIdx = rawRows.findIndex(row =>
    String(row[0] ?? "").trim().toLowerCase() === "employee number"
  );
  if (hdrIdx < 0) throw new Error("Could not find \"Employee Number\" header row in the file");

  const hdr = rawRows[hdrIdx].map(h => String(h).trim().toLowerCase());
  const ci = {
    empId:    hdr.indexOf("employee number"),
    leaveType:hdr.indexOf("leave types"),
    fromDate: hdr.indexOf("from date"),
    fromSess: hdr.indexOf("from session"),
    toDate:   hdr.indexOf("to date"),
    toSess:   hdr.indexOf("to session"),
    duration: hdr.indexOf("total duration"),
    status:   hdr.indexOf("status"),
  };
  const missing = Object.entries(ci).filter(([, v]) => v < 0).map(([k]) => k);
  if (missing.length) throw new Error(`Missing required columns: ${missing.join(", ")}`);

  // Leave type → attendance symbol
  const LEAVE_SYMBOL: Record<string, AttendanceSymbol> = {
    "menstrual leave": "ML",
    "sick leave":      "SL",
    "paid leave":      "PL",
  };

  const serialToDate = (n: number) => new Date((n - 25569) * 86400 * 1000);

  // 3. Parse approved leave rows → group by month
  type LeaveEntry = { employeeId: string; date: Date; symbol: AttendanceSymbol };
  const byMonth = new Map<number, LeaveEntry[]>();
  const skipped: string[] = [];
  let rowsProcessed = 0;

  for (let r = hdrIdx + 1; r < rawRows.length; r++) {
    const row    = rawRows[r];
    const empId  = String(row[ci.empId]  ?? "").trim();
    const status = String(row[ci.status] ?? "").trim().toLowerCase();

    if (!empId) continue;
    if (status !== "approved") { skipped.push(`${empId}: ${status || "no status"}`); continue; }

    const duration   = Number(row[ci.duration]);
    const fromSerial = Number(row[ci.fromDate]);
    const toSerial   = Number(row[ci.toDate]);
    if (isNaN(fromSerial) || isNaN(toSerial)) { skipped.push(`${empId}: invalid dates`); continue; }

    const leaveTypKey = String(row[ci.leaveType] ?? "").trim().toLowerCase();
    const fullDaySymbol: AttendanceSymbol = LEAVE_SYMBOL[leaveTypKey] ?? "A";

    // 0.5-day leave → HD for that one day
    if (Math.abs(duration - 0.5) < 0.01) {
      const date   = serialToDate(fromSerial);
      const mIdx   = date.getUTCMonth();
      if (!byMonth.has(mIdx)) byMonth.set(mIdx, []);
      byMonth.get(mIdx)!.push({ employeeId: empId, date, symbol: "HD" });
      rowsProcessed++;
      continue;
    }

    // Full-day (possibly multi-day) leave
    const fromDate = serialToDate(fromSerial);
    const toDate   = serialToDate(toSerial);
    const cur      = new Date(fromDate);
    while (cur <= toDate) {
      const mIdx = cur.getUTCMonth();
      if (!byMonth.has(mIdx)) byMonth.set(mIdx, []);
      byMonth.get(mIdx)!.push({ employeeId: empId, date: new Date(cur), symbol: fullDaySymbol });
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    rowsProcessed++;
  }

  // Which months does the file actually contain (before any target filter)?
  const monthsInFile = [...byMonth.keys()].sort((a, b) => a - b);

  if (!rowsProcessed) return { rowsProcessed: 0, cellsWritten: 0, skipped, errors: [], monthsInFile };

  // If a target month was chosen, only write that month; drop the rest.
  if (typeof targetMonth === "number") {
    for (const m of monthsInFile) {
      if (m !== targetMonth) byMonth.delete(m);
    }
  }

  // 4. Update each affected month tab
  const sheets  = getSheetsClient();
  let totalCells = 0;
  const errors: string[] = [];

  for (const [mIdx, entries] of byMonth) {
    const tabName = MONTH_TAB_NAMES[mIdx];

    let sheetRows: string[][];
    try {
      const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: tabName });
      sheetRows = (res.data.values ?? []) as string[][];
    } catch {
      errors.push(`Could not read tab "${tabName}"`);
      continue;
    }
    if (!sheetRows.length) { errors.push(`Tab "${tabName}" is empty`); continue; }

    // Detect format + build day-number → column index map
    const sheetHdr = sheetRows[0];
    const { dayColStart, hasSubRows: isNewFmt } = detectFormat(sheetRows);
    const idCol = detectIdentityCols(sheetHdr, dayColStart).id;

    const dayNumToColIdx = new Map<number, number>();
    for (let i = dayColStart; i < sheetHdr.length; i++) {
      const h = (sheetHdr[i] ?? "").trim();
      if (!isDayHeader(h)) break;
      const n = parseInt(h.split(/[\s-]/)[0], 10);
      if (!isNaN(n)) dayNumToColIdx.set(n, i);
    }

    // Build employee ID → row indices
    type EmpRows = { status: number };
    const empRowMap = new Map<string, EmpRows>();
    let ri = 1;
    while (ri < sheetRows.length) {
      const row = sheetRows[ri];
      const id  = cell(row, idCol).toUpperCase();
      if (!id) { ri++; continue; }
      empRowMap.set(id, { status: ri + 1 });
      if (isNewFmt) {
        let j = ri + 1;
        while (j < sheetRows.length && !cell(sheetRows[j], idCol)) j++;
        ri = j;
      } else { ri++; }
    }

    // Build batch update — skip WO / NHD cells
    const data: { range: string; values: string[][] }[] = [];
    for (const e of entries) {
      const empKey  = e.employeeId.toUpperCase();
      const empRows = empRowMap.get(empKey);
      if (!empRows) continue;

      const dayOfMonth = e.date.getUTCDate();
      const colIdx2    = dayNumToColIdx.get(dayOfMonth);
      if (colIdx2 === undefined) continue;

      // Skip week-off / national-holiday cells
      const existing = ((sheetRows[empRows.status - 1]?.[colIdx2]) ?? "").trim().toUpperCase();
      if (existing === "WO" || existing === "WOP" || existing === "NHD") continue;

      const col = colIndexToLetter(colIdx2);
      data.push({ range: `${tabName}!${col}${empRows.status}`, values: [[e.symbol]] });
    }

    if (!data.length) continue;

    try {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: { valueInputOption: "RAW", data },
      });
      totalCells += data.length;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to write to tab "${tabName}": ${msg}`);
    }
  }

  return { rowsProcessed, cellsWritten: totalCells, skipped, errors, monthsInFile };
}

// ── Employee reference details (Employee_Reference tab) ─────────────────────
//
// Reads per-employee profile fields from the "Employee_Reference" tab.
// Columns are located by header name (case-insensitive, any order), so new
// columns like "Date of Joining" / "Date of Leaving" are picked up as soon as
// they are added to the sheet. Missing columns simply yield empty strings.
export interface EmployeeReference {
  employeeId:     string;
  designation:    string;
  employmentType: string; // "FTE" / "Intern" (Employee Entity Status)
  dateOfJoining:  string;
  dateOfLeaving:  string;
}

const REFERENCE_TAB = "Employee_Reference";

export async function getEmployeeReferences(): Promise<Record<string, EmployeeReference>> {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error("GOOGLE_SHEET_ID is not set");

  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${REFERENCE_TAB}!A:Z`,
  });
  const rows = (res.data.values ?? []) as string[][];
  if (rows.length < 2) return {};

  const hdr = rows[0].map(h => (h ?? "").trim().toLowerCase());
  const find = (...candidates: string[]) =>
    hdr.findIndex(h => candidates.some(c => h === c || h.includes(c)));

  const col = {
    empId:       find("employee id", "emp id", "employee number"),
    designation: find("designation"),
    type:        find("employee entity status", "entity status", "employment type", "fte/intern"),
    doj:         find("date of joining", "joining date", "doj"),
    dol:         find("date of leaving", "date of exit", "leaving date", "last working", "exit date", "dol"),
  };
  if (col.empId === -1) return {};

  const get = (row: string[], idx: number) => (idx === -1 ? "" : (row[idx] ?? "").trim());

  const out: Record<string, EmployeeReference> = {};
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const employeeId = get(row, col.empId);
    if (!employeeId) continue;
    out[employeeId.toUpperCase()] = {
      employeeId,
      designation:    get(row, col.designation),
      employmentType: get(row, col.type),
      dateOfJoining:  get(row, col.doj),
      dateOfLeaving:  get(row, col.dol),
    };
  }
  return out;
}
