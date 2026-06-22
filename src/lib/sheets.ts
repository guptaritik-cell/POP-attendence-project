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
  if (s === "NHD") return "NHD";
  if (s === "WO" || s === "WOP") return "WO";   // WOP = Week Off + Public holiday
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

// Extract the start row number from a Sheets A1 range string
// e.g. "Jun!A100:E103" → 100,  "Sheet1!B5" → 5
function startRowFromRange(range: string): number {
  const m = range.match(/[A-Z]+(\d+)/);
  return m ? parseInt(m[1], 10) : -1;
}

export async function addEmployee(
  employee: Employee,
  joinMonth: number,   // 0-indexed: 0 = January … 11 = December
  joinYear:  number,
  joinDate:  number = 1,   // 1-indexed day of the joining month (1–31). Defaults to 1
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

  const dayColStart = isNewFormat ? 5 : 4;

  // ── 5. Append — skip tabs that don't exist yet, collect any errors ───────
  const writeErrors: string[] = [];
  for (const tabName of tabsToWrite) {
    if (!existingTabs.has(tabName)) continue;
    try {
      const appendRes = await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: `${tabName}!${range}`,
        valueInputOption: "RAW",
        requestBody: { values: rowsToAppend },
      });

      // ── Mark 'P' on the joining date — only for the joining month tab ───
      if (tabName === MONTH_NAMES[joinMonth] && joinDate >= 1) {
        try {
          // Read header row to find the column for joinDate
          const hdrRes = await sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: `${tabName}!1:1`,
          });
          const headers = hdrRes.data.values?.[0] ?? [];

          // Scan day columns for the one whose day-number matches joinDate
          let dayColAbsIdx = -1;
          for (let i = dayColStart; i < headers.length; i++) {
            const h = (headers[i] ?? "").trim();
            if (!h || h.toLowerCase().startsWith("total")) break;
            // Headers look like "1 Th" or "1-Jan Thu" — day number is always first token
            const dayNum = parseInt(h.split(/[\s-]/)[0], 10);
            if (dayNum === joinDate) { dayColAbsIdx = i; break; }
          }

          if (dayColAbsIdx >= 0) {
            // Derive the row of the Status row from the append response
            const updatedRange = appendRes.data.updates?.updatedRange ?? "";
            const statusRow = startRowFromRange(updatedRange);

            if (statusRow > 0) {
              const colLetter = colIndexToLetter(dayColAbsIdx);
              await sheets.spreadsheets.values.update({
                spreadsheetId: sheetId,
                range: `${tabName}!${colLetter}${statusRow}`,
                valueInputOption: "RAW",
                requestBody: { values: [["P"]] },
              });
            }
          }
        } catch (markErr) {
          // Non-fatal — log but don't fail the whole operation
          console.warn(`[addEmployee] Could not mark joining date P in "${tabName}":`, markErr);
        }
      }
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
  const col4        = (sheetHeader[4] ?? "").trim();
  const isNewFmt    = col4 !== "" && isNaN(parseInt(col4, 10));
  const dayColStart = isNewFmt ? 5 : 4;

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
        const sub = (sheetRows[j][4] ?? "").trim().toLowerCase();
        if (sub === "clock in")       entry.clockIn  = j + 1;
        else if (sub === "clock out") entry.clockOut = j + 1;
        else if (sub === "total wk")  entry.hours    = j + 1;
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
): Promise<{
  rowsProcessed: number;
  cellsWritten:  number;
  skipped:       string[];
  errors:        string[];
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

  // 3. Parse approved WFH rows → group individual dates by month (0-indexed)
  type DateEntry = { employeeId: string; date: Date };
  const byMonth = new Map<number, DateEntry[]>();  // monthIndex → entries
  const skipped: string[] = [];
  let rowsProcessed = 0;

  for (let r = 1; r < rawRows.length; r++) {
    const row     = rawRows[r];
    const empId   = String(row[ci.empId]   ?? "").trim();
    const reqType = String(row[ci.reqType]  ?? "").trim().toLowerCase();
    const status  = String(row[ci.status]   ?? "").trim().toLowerCase();

    if (!empId) continue;
    if (reqType !== "wfh") continue;                         // skip On Duty, etc.
    if (status  !== "approved") {
      skipped.push(`${empId}: ${status}`);
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
      byMonth.get(mIdx)!.push({ employeeId: empId, date: new Date(cur) });
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    rowsProcessed++;
  }

  if (!rowsProcessed) {
    return { rowsProcessed: 0, cellsWritten: 0, skipped, errors: [] };
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
    const sheetHdr    = sheetRows[0];
    const col4        = (sheetHdr[4] ?? "").trim();
    const isNewFmt    = col4 !== "" && isNaN(parseInt(col4, 10));
    const dayColStart = isNewFmt ? 5 : 4;

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
          const sub = (sheetRows[j][4] ?? "").trim().toLowerCase();
          if (sub === "clock in")       entry.clockIn  = j + 1;
          else if (sub === "clock out") entry.clockOut = j + 1;
          else if (sub === "total wk")  entry.hours    = j + 1;
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
      data.push({ range: `${tabName}!${col}${empRows.status}`, values: [["WFH"]] });
      if (isNewFmt) {
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

  return { rowsProcessed, cellsWritten: totalCells, skipped, errors };
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
): Promise<{
  rowsProcessed: number;
  cellsWritten:  number;
  skipped:       string[];
  errors:        string[];
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

  if (!rowsProcessed) return { rowsProcessed: 0, cellsWritten: 0, skipped, errors: [] };

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
    const sheetHdr    = sheetRows[0];
    const col4        = (sheetHdr[4] ?? "").trim();
    const isNewFmt    = col4 !== "" && isNaN(parseInt(col4, 10));
    const dayColStart = isNewFmt ? 5 : 4;

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

  return { rowsProcessed, cellsWritten: totalCells, skipped, errors };
}
