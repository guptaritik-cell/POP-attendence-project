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

// ── Symbol parser ────────────────────────────────────────────────────────────
function parseSymbol(raw: string): AttendanceSymbol {
  const s = raw.trim().toUpperCase();
  if (s === "P")   return "P";
  if (s === "A")   return "A";
  if (s === "HD")  return "HD";
  if (s === "WFH") return "WFH";
  if (s === "NHD") return "NHD";
  if (s === "WO")  return "WO";
  return "";
}

// ── Compute all derived totals ────────────────────────────────────────────────
function computeRecord(
  employeeId: string,
  name: string,
  team: string,
  buLead: string,
  days: DayRecord[]
): EmployeeMonthRecord {
  let totalPresent = 0, totalWFH = 0, totalAbsent = 0, totalHalfDay = 0, workingDays = 0;

  for (const day of days) {
    const s = day.symbol;
    if (s === "NHD" || s === "WO" || s === "") continue;
    workingDays++;
    if      (s === "P")   { totalPresent += 1; }
    else if (s === "WFH") { totalPresent += 1; totalWFH += 1; }
    else if (s === "HD")  { totalPresent += 0.5; totalHalfDay += 1; }
    else if (s === "A")   { totalAbsent += 1; }
  }

  const attendancePercent = workingDays > 0 ? (totalPresent / workingDays) * 100 : 0;
  const wfhPercent        = workingDays > 0 ? (totalWFH / workingDays) * 100 : 0;
  const totalHours        = totalPresent * 9;
  const hoursPercent      = workingDays > 0 ? (totalHours / (workingDays * 9)) * 100 : 0;

  return {
    employeeId, name, team, buLead, days,
    totalPresent, totalWFH, totalAbsent, totalHalfDay, workingDays,
    attendancePercent, wfhPercent, totalHours, hoursPercent,
  };
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
  const dayColIndices: number[] = [];
  const columnHeaders: string[] = [];

  // Day columns start at col 4; stop at any "Total…" column or empty header
  for (let i = 4; i < headerRow.length; i++) {
    const h = (headerRow[i] ?? "").trim();
    if (!h || h.toLowerCase().startsWith("total")) break;
    dayColIndices.push(i);
    columnHeaders.push(h);
  }

  const records: EmployeeMonthRecord[] = [];

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
      const dayNum = parseInt(header.split("-")[0], 10) || i + 1;
      return { date: header, dayNumber: dayNum, symbol: parseSymbol(raw) };
    });

    records.push(computeRecord(employeeId, name, team, buLead, days));
  }

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

export async function addEmployee(employee: Employee): Promise<void> {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error("GOOGLE_SHEET_ID is not set");

  const sheets = getSheetsClient();
  const row    = [employee.employeeId, employee.name, employee.team, employee.buLead];

  for (const tabName of MONTH_NAMES) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId, range: `${tabName}!A:D`,
      valueInputOption: "RAW", requestBody: { values: [row] },
    });
  }
}
