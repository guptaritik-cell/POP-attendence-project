import type {
  AttendanceSymbol,
  DayRecord,
  EmployeeMonthRecord,
  MonthData,
} from "@/types/attendance";
import { OTHER_LEAVE_CODES, emptyOtherLeaves } from "@/lib/attendanceSymbols";

// ── March 2025 column headers ────────────────────────────────────────────────
const DAYS_OF_WEEK = ["Sat","Sun","Mon","Tue","Wed","Thu","Fri"];
const COL_HEADERS: string[] = Array.from({ length: 31 }, (_, i) => {
  const dayNum = i + 1;
  // March 1, 2025 is a Saturday (day-of-week index 0)
  const dow = DAYS_OF_WEEK[(i) % 7];
  return `${dayNum}-Mar (${dow})`;
});

// ── Which 0-indexed positions are weekends or NHD ───────────────────────────
// Sat: 0,7,14,21,28  Sun: 1,8,15,22,29  NHD(Holi): 3
const WEEKEND_IDX = new Set([0, 1, 7, 8, 14, 15, 21, 22, 28, 29]);
const NHD_IDX = new Set([3]); // Mar 4

// Working day positions (0-indexed), in order: 20 total
// 2,4,5,6,9,10,11,12,13,16,17,18,19,20,23,24,25,26,27,30
const WORKING_POSITIONS = [2,4,5,6,9,10,11,12,13,16,17,18,19,20,23,24,25,26,27,30];

// ── Build DayRecord[] from a 20-symbol working-day pattern ──────────────────
function buildDays(pattern: AttendanceSymbol[]): DayRecord[] {
  let pi = 0;
  return COL_HEADERS.map((header, i) => {
    let symbol: AttendanceSymbol;
    if (WEEKEND_IDX.has(i)) symbol = "WO";
    else if (NHD_IDX.has(i)) symbol = "NHD";
    else symbol = pattern[pi++] ?? "P";
    return { date: header, dayNumber: i + 1, symbol };
  });
}

// ── Compute all totals from days array ──────────────────────────────────────
function computeTotals(days: DayRecord[]) {
  let totalPresent = 0, totalWFH = 0, totalAbsent = 0, totalHalfDay = 0, workingDays = 0;
  let totalML = 0, totalSL = 0, totalPL = 0;
  const otherLeaves = emptyOtherLeaves();
  for (const d of days) {
    if (d.symbol === "WO" || d.symbol === "NHD" || d.symbol === "") continue;
    workingDays++;
    if      (d.symbol === "P")   { totalPresent += 1; }
    else if (d.symbol === "WFH") { totalPresent += 1; totalWFH++; }
    else if (d.symbol === "HD")  { totalPresent += 0.5; totalHalfDay++; }
    else if (d.symbol === "A")   { totalAbsent++; }
    else if (d.symbol === "ML")  { totalML++; }
    else if (d.symbol === "SL")  { totalSL++; }
    else if (d.symbol === "PL")  { totalPL++; }
    else if (OTHER_LEAVE_CODES.includes(d.symbol)) { otherLeaves[d.symbol]++; }
  }
  const attendancePercent = workingDays > 0 ? (totalPresent / workingDays) * 100 : 0;
  const wfhPercent        = workingDays > 0 ? (totalWFH / workingDays) * 100 : 0;
  const totalHours        = totalPresent * 8;
  const hoursPercent      = workingDays > 0 ? (totalHours / (workingDays * 8)) * 100 : 0;
  return { totalPresent, totalWFH, totalAbsent, totalHalfDay, totalML, totalSL, totalPL, otherLeaves, workingDays, attendancePercent, wfhPercent, totalHours, hoursPercent };
}

function makeRecord(
  employeeId: string, name: string, team: string, buLead: string,
  pattern: AttendanceSymbol[]
): EmployeeMonthRecord {
  const days = buildDays(pattern);
  return { employeeId, name, team, buLead, days, ...computeTotals(days) };
}

// ── Employee data ────────────────────────────────────────────────────────────
// Pattern: 20 symbols for working days (Mon–Fri excl. NHD/WO)
// P=Present  A=Absent  WFH=WFH  HD=HalfDay

const records: EmployeeMonthRecord[] = [
  /* ── Founder ── */
  makeRecord("PTG001","Bhargav Kumar Errangi","Founder","Bhargav",
    ["P","P","WFH","P","P","WFH","P","P","WFH","P","P","WFH","P","P","WFH","P","P","WFH","P","P"]),
  makeRecord("PTG002","Ritika Sharma","Founder","Bhargav",
    ["P","P","WFH","P","A","P","WFH","P","P","WFH","P","P","A","P","P","WFH","P","A","P","P"]),

  /* ── Credit Card ── */
  makeRecord("PTG003","Aditya Nair","Credit Card","Rajat",
    ["P","P","P","WFH","P","WFH","P","P","WFH","P","P","WFH","A","P","P","WFH","P","P","WFH","P"]),
  makeRecord("PTG004","Priya Mehta","Credit Card","Rajat",
    ["P","P","HD","P","P","P","A","A","WFH","P","P","P","A","A","P","WFH","P","A","P","P"]),
  makeRecord("PTG005","Saurabh Gupta","Credit Card","Rajat",
    ["P","P","P","P","WFH","P","P","P","WFH","P","P","P","WFH","P","P","P","WFH","P","P","P"]),
  makeRecord("INT026","Deepak Jain","Credit Card","Rajat",
    ["P","P","WFH","P","P","WFH","P","A","P","WFH","P","P","A","A","P","WFH","P","A","A","P"]),

  /* ── Marketplace ── */
  makeRecord("PTG006","Neha Joshi","Marketplace","Gautam",
    ["P","P","WFH","P","P","WFH","P","P","P","WFH","P","P","P","WFH","P","P","P","WFH","P","P"]),
  makeRecord("PTG007","Vivek Iyer","Marketplace","Gautam",
    ["P","A","P","WFH","P","WFH","P","A","P","WFH","P","A","P","WFH","P","A","P","WFH","P","A"]),
  makeRecord("PTG008","Smita Rao","Marketplace","Gautam",
    ["P","P","WFH","P","P","P","WFH","P","P","P","WFH","P","P","P","A","A","WFH","P","P","P"]),
  makeRecord("INT027","Tarun Saxena","Marketplace","Gautam",
    ["P","P","P","WFH","P","A","A","P","WFH","P","P","P","WFH","P","A","A","P","WFH","P","P"]),

  /* ── Design ── */
  makeRecord("PTG009","Karan Malhotra","Design","Arpit",
    ["WFH","P","P","P","WFH","P","P","P","WFH","P","P","P","WFH","P","P","P","WFH","P","P","P"]),
  makeRecord("PTG010","Divya Pillai","Design","Arpit",
    ["P","P","P","WFH","P","P","HD","P","WFH","P","P","P","WFH","P","P","HD","P","WFH","P","P"]),

  /* ── Analytics ── */
  makeRecord("INT028","Aryan Seth","Analytics","Raunak",
    ["A","P","WFH","P","WFH","P","A","P","WFH","P","WFH","P","A","P","WFH","P","WFH","P","A","P"]),
  makeRecord("PTG011","Pooja Verma","Analytics","Raunak",
    ["P","P","WFH","P","P","P","WFH","P","P","P","WFH","P","P","P","WFH","P","P","P","WFH","P"]),
  makeRecord("PTG012","Rohan Das","Analytics","Raunak",
    ["P","WFH","P","WFH","P","WFH","P","A","P","WFH","P","WFH","P","A","P","WFH","P","WFH","P","A"]),

  /* ── HR ── */
  makeRecord("PTG013","Meena Krishnan","HR","Chandni",
    ["P","P","P","P","WFH","P","P","P","WFH","P","P","P","WFH","P","P","P","WFH","P","P","P"]),
  makeRecord("PTG014","Siddharth Patil","HR","Chandni",
    ["P","A","P","P","A","P","A","A","WFH","P","P","P","A","A","A","WFH","P","P","P","A"]),

  /* ── CX ── */
  makeRecord("PTG015","Ananya Bose","CX","Kishore",
    ["P","P","WFH","P","P","WFH","P","P","P","WFH","P","P","P","WFH","P","P","P","WFH","P","P"]),
  makeRecord("PTG016","Rahul Chandra","CX","Kishore",
    ["P","P","HD","WFH","P","P","P","WFH","P","P","HD","WFH","P","P","P","WFH","HD","P","P","P"]),
  makeRecord("PTG017","Lakshmi Menon","CX","Kishore",
    ["P","P","WFH","P","P","A","A","P","WFH","P","P","P","WFH","P","P","P","WFH","P","P","P"]),

  /* ── Finance ── */
  makeRecord("PTG018","Nikhil Agarwal","Finance","VR",
    ["P","P","WFH","P","P","P","WFH","P","P","P","WFH","P","P","P","WFH","P","P","P","WFH","P"]),
  makeRecord("PTG019","Shreya Kapoor","Finance","VR",
    ["P","P","HD","WFH","P","P","P","WFH","P","HD","P","WFH","P","P","P","WFH","P","P","HD","WFH"]),
];

// ── Exported MonthData ───────────────────────────────────────────────────────
export const marchMockData: MonthData = {
  month: "March",
  monthIndex: 2,
  year: 2025,
  records,
  columnHeaders: COL_HEADERS,
};

// ── Generate mock data for any month (fallback for network errors) ──────────
export function getMockMonthData(monthIndex: number, year: number): MonthData {
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const monthName = monthNames[monthIndex] || "Unknown";
  
  console.log(`[MockData] Generating mock data for ${monthName} ${year}`);
  
  return {
    month: monthName,
    monthIndex,
    year,
    records: records.map(r => ({ ...r })), // Return copies of mock records
    columnHeaders: COL_HEADERS,
  };
}
