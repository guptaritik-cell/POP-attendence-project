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
  if (s === "ML") return "ML";   // Menstrual Leave
  if (s === "SL") return "SL";   // Sick Leave
  if (s === "PL") return "PL";   // Paid Leave
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
  let totalML = 0, totalSL = 0, totalPL = 0;
  let daysWithData = 0; // A/ML/SL/PL + P + WFH + HD
  let totalMinutes = 0;

  for (const day of days) {
    const s = day.symbol;
    if (s === "NHD" || s === "WO" || s === "") continue;
    daysWithData++;
    if      (s === "P")   { totalPresent += 1; }
    else if (s === "WFH") { totalPresent += 1; totalWFH += 1; }
    else if (s === "HD")  { totalPresent += 0.5; totalHalfDay += 1; }
    else if (s === "A")   { totalAbsent += 1; }
    // Leave types — each counts as 1 absent day
    else if (s === "ML")  { totalAbsent += 1; totalML += 1; }
    else if (s === "SL")  { totalAbsent += 1; totalSL += 1; }
    else if (s === "PL")  { totalAbsent += 1; totalPL += 1; }
    totalMinutes += day.hoursMinutes ?? 0;
  }

  const workingDays       = companyWorkingDays;
  const attendancePercent = workingDays > 0 ? (totalPresent / workingDays) * 100 : 0;
  const wfhPercent        = workingDays > 0 ? (totalWFH     / workingDays) * 100 : 0;

  // Actual clocked hours when available; fall back to 9 h per present day
  const totalHours   = totalMinutes > 0
    ? Math.round((totalMinutes / 60) * 10) / 10
    : Math.round(totalPresent * 9  * 10) / 10;

  // (A/ML/SL/PL + P + WFH + HD) × 9 — correct for both current and completed months
  const hoursPercent = daysWithData > 0 ? (totalHours / (daysWithData * 9)) * 100 : 0;

  return {
    employeeId, name, team, buLead, days,
    totalPresent, totalWFH, totalAbsent, totalHalfDay,
    totalML, totalSL, totalPL,
    workingDays, attendancePercent, wfhPercent, totalHours, hoursPercent,
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
      if (!(row[0] ?? "").trim()) {
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

  // ── Identify day column indices + headers ─────────────────────────────────
  const dayColIndices: number[] = [];
  const columnHeaders: string[] = [];

  for (let i = dayColStart; i < headerRow.length; i++) {
    const h = (headerRow[i] ?? "").trim();
    if (!h || h.toLowerCase().startsWith("total")) break;
    dayColIndices.push(i);
    columnHeaders.push(h);
  }

  // Helper: column header ("1 Th" or "1-Jan (Thu)" or "1 M") → day number
  function dayNumFromHeader(header: string, fallback: number): number {
    return parseInt(header.split(/[\s-]/)[0], 10) || fallback;
  }

  // ── Phase 1: build days arrays for every employee ─────────────────────────
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
      const team   = typeCol >= 2 ? (row[2] ?? "").trim() : "";
      const buLead = typeCol >= 4 ? (row[3] ?? "").trim() : "";
      const statusRow = dayColIndices.map(ci => (row[ci] ?? "").trim());

      let clockInRow:  string[] = [];
      let clockOutRow: string[] = [];
      let hoursRow:    string[] = [];

      i++;
      while (i < rows.length && !(rows[i][0] ?? "").trim()) {
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

  // ── 3. Detect sheet format from the first eligible existing tab ──────────
  let isNewFormat = false;
  for (const tabName of tabsToWrite) {
    if (!existingTabs.has(tabName)) continue;
    try {
      const hdr = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: `${tabName}!1:100`,
      });
      const curRows = (hdr.data.values ?? []) as string[][];
      if (curRows.length > 0) {
        const fmt = detectFormat(curRows);
        isNewFormat = fmt.hasSubRows;
        break;
      }
    } catch { /* fallback */ }
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

  const dayColStart = isNewFormat ? 5 : 4;

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

      // Clone the block so we can inject the joining-day "P" into the Status row.
      const rows = rowsToAppend.map(r => [...r]);

      // ── Mark 'P' on the joining date — only for the joining month tab ───
      if (tabName === MONTH_NAMES[joinMonth] && joinDate >= 1) {
        const headers = curRows[0] ?? [];
        let dayColAbsIdx = -1;
        for (let i = dayColStart; i < headers.length; i++) {
          const h = (headers[i] ?? "").trim();
          if (!h || h.toLowerCase().startsWith("total")) break;
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

  // Map: 1-based day number (1–31) → 0-based column index in the sheet row
  const dayNumToColIdx = new Map<number, number>();
  for (let i = dayColStart; i < sheetHeader.length; i++) {
    const h = (sheetHeader[i] ?? "").trim();
    if (!h || h.toLowerCase().startsWith("total")) break;
    const n = parseInt(h.split(/[\s-]/)[0], 10);
    if (!isNaN(n)) dayNumToColIdx.set(n, i);
  }

  // 4. Build employee ID → sheet row numbers (1-indexed for Sheets API)
  type EmpRows = { status: number; clockIn: number; clockOut: number; hours: number };
  const empRowMap = new Map<string, EmpRows>();

  let ri = 1;
  while (ri < sheetRows.length) {
    const row = sheetRows[ri];
    const id  = (row[0] ?? "").trim().toUpperCase();
    if (!id) { ri++; continue; }

    const entry: EmpRows = { status: ri + 1, clockIn: -1, clockOut: -1, hours: -1 };

    if (isNewFmt) {
      let j = ri + 1;
      while (j < sheetRows.length && !(sheetRows[j][0] ?? "").trim()) {
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

// ── Clear an employee's attendance across a date range ────────────────────────
//
// Destructive: for the given employee, blanks out the status cell (and, in the
// new format, the Clock In / Clock Out / Total WK sub-rows) for every day that
// falls inside [from, to].  Employee info columns (ID / Name / Team / BU Lead)
// are left untouched.  Iterates every month tab covered by the range.
//
// `from` / `to` are { year, month (0-idx), day }.
export async function clearAttendanceRange(
  employeeId: string,
  from: { year: number; month: number; day: number },
  to:   { year: number; month: number; day: number },
): Promise<{ found: boolean; monthsTouched: number; cellsCleared: number; daysCleared: number }> {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error("GOOGLE_SHEET_ID not set");

  const sheets = getSheetsClient();
  const empKey = employeeId.trim().toUpperCase();

  const fromAbs = from.year * 12 + from.month;
  const toAbs   = to.year   * 12 + to.month;

  const data: { range: string; values: string[][] }[] = [];
  let found = false;
  let monthsTouched = 0;
  let daysCleared = 0;

  for (let abs = fromAbs; abs <= toAbs; abs++) {
    const year  = Math.floor(abs / 12);
    const month = abs % 12;
    const tabName = MONTH_TAB_NAMES[month];

    // Day window inside this month
    const dayFrom = abs === fromAbs ? from.day : 1;
    const dayTo   = abs === toAbs   ? to.day   : daysInMonthLocal(year, month);

    let sheetRows: string[][];
    try {
      const sheetRes = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: tabName,
      });
      sheetRows = (sheetRes.data.values ?? []) as string[][];
    } catch {
      continue; // tab doesn't exist for this month
    }
    if (!sheetRows.length) continue;

    // Detect format, build day-number → column index map
    const sheetHeader = sheetRows[0];
    const { dayColStart, hasSubRows: isNewFmt, typeCol } = detectFormat(sheetRows);

    const dayNumToColIdx = new Map<number, number>();
    for (let i = dayColStart; i < sheetHeader.length; i++) {
      const h = (sheetHeader[i] ?? "").trim();
      if (!h || h.toLowerCase().startsWith("total")) break;
      const n = parseInt(h.split(/[\s-]/)[0], 10);
      if (!isNaN(n)) dayNumToColIdx.set(n, i);
    }

    // Locate the employee's rows
    type EmpRows = { status: number; clockIn: number; clockOut: number; hours: number };
    let empRows: EmpRows | null = null;

    let ri = 1;
    while (ri < sheetRows.length) {
      const row = sheetRows[ri];
      const id  = (row[0] ?? "").trim().toUpperCase();
      if (!id) { ri++; continue; }

      const entry: EmpRows = { status: ri + 1, clockIn: -1, clockOut: -1, hours: -1 };
      if (isNewFmt) {
        let j = ri + 1;
        while (j < sheetRows.length && !(sheetRows[j][0] ?? "").trim()) {
          const sub = (sheetRows[j][typeCol] ?? "").trim().toLowerCase();
          if (sub === "clock in" || sub === "clock-in")       entry.clockIn  = j + 1;
          else if (sub === "clock out" || sub === "clock-out") entry.clockOut = j + 1;
          else if (sub === "total wk" || sub === "total work" || sub === "hours")  entry.hours    = j + 1;
          j++;
        }
        if (id === empKey) { empRows = entry; break; }
        ri = j;
      } else {
        if (id === empKey) { empRows = entry; break; }
        ri++;
      }
    }

    if (!empRows) continue; // employee not in this month tab
    found = true;
    monthsTouched++;

    for (let d = dayFrom; d <= dayTo; d++) {
      const colIdx = dayNumToColIdx.get(d);
      if (colIdx === undefined) continue;
      const col = colIndexToLetter(colIdx);

      data.push({ range: `${tabName}!${col}${empRows.status}`, values: [[""]] });
      if (isNewFmt) {
        if (empRows.clockIn  > 0) data.push({ range: `${tabName}!${col}${empRows.clockIn}`,  values: [[""]] });
        if (empRows.clockOut > 0) data.push({ range: `${tabName}!${col}${empRows.clockOut}`, values: [[""]] });
        if (empRows.hours    > 0) data.push({ range: `${tabName}!${col}${empRows.hours}`,    values: [[""]] });
      }
      daysCleared++;
    }
  }

  if (data.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: { valueInputOption: "RAW", data },
    });
  }

  return { found, monthsTouched, cellsCleared: data.length, daysCleared };
}

// Days in a given month (monthIndex 0-11) — local helper for range clearing
function daysInMonthLocal(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
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
    const reqType    = reqTypeRaw.toLowerCase();
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

    const dayNumToColIdx = new Map<number, number>();
    for (let i = dayColStart; i < sheetHdr.length; i++) {
      const h = (sheetHdr[i] ?? "").trim();
      if (!h || h.toLowerCase().startsWith("total")) break;
      const n = parseInt(h.split(/[\s-]/)[0], 10);
      if (!isNaN(n)) dayNumToColIdx.set(n, i);
    }

    // Build employee ID → row indices (1-indexed for Sheets API)
    type EmpRows = { status: number; clockIn: number; clockOut: number; hours: number };
    const empRowMap = new Map<string, EmpRows>();
    let ri = 1;
    while (ri < sheetRows.length) {
      const row = sheetRows[ri];
      const id  = (row[0] ?? "").trim().toUpperCase();
      if (!id) { ri++; continue; }

      const entry: EmpRows = { status: ri + 1, clockIn: -1, clockOut: -1, hours: -1 };
      if (isNewFmt) {
        let j = ri + 1;
        while (j < sheetRows.length && !(sheetRows[j][0] ?? "").trim()) {
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

    const dayNumToColIdx = new Map<number, number>();
    for (let i = dayColStart; i < sheetHdr.length; i++) {
      const h = (sheetHdr[i] ?? "").trim();
      if (!h || h.toLowerCase().startsWith("total")) break;
      const n = parseInt(h.split(/[\s-]/)[0], 10);
      if (!isNaN(n)) dayNumToColIdx.set(n, i);
    }

    // Build employee ID → row indices
    type EmpRows = { status: number };
    const empRowMap = new Map<string, EmpRows>();
    let ri = 1;
    while (ri < sheetRows.length) {
      const row = sheetRows[ri];
      const id  = (row[0] ?? "").trim().toUpperCase();
      if (!id) { ri++; continue; }
      empRowMap.set(id, { status: ri + 1 });
      if (isNewFmt) {
        let j = ri + 1;
        while (j < sheetRows.length && !(sheetRows[j][0] ?? "").trim()) j++;
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
