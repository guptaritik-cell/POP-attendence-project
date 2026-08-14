export type AttendanceSymbol =
  | "P" | "A" | "HD" | "WFH" | "NHD" | "WO" | "ML" | "SL" | "PL"
  | "ADL" | "BEL" | "COL" | "MRL" | "MAL" | "MIL" | "UNL"
  | "";

export interface DayRecord {
  date: string;          // "1-Mar (Sun)" or "1 Th"
  dayNumber: number;     // 1
  symbol: AttendanceSymbol;
  clockIn?: string;      // "10:00"
  clockOut?: string;     // "19:05"
  hoursWorked?: string;  // "08:55" (raw string from sheet)
  hoursMinutes?: number; // 535 (parsed minutes, for computation)
}

export interface Employee {
  employeeId: string;
  name: string;
  team: string;
  buLead: string;
}

export interface EmployeeMonthRecord extends Employee {
  days: DayRecord[];
  totalPresent: number;       // computed
  totalWFH: number;           // computed
  totalAbsent: number;        // computed (A only)
  totalHalfDay: number;       // computed
  totalML: number;            // Menstrual Leave days
  totalSL: number;            // Sick Leave days
  totalPL: number;            // Paid Leave days
  otherLeaves: Record<string, number>; // Adoption/Bereavement/CompOff/Marriage/Maternity/Miscarriage/Unpaid — keyed by code
  workingDays: number;        // computed (excludes WO, NHD)
  attendancePercent: number;  // computed
  wfhPercent: number;         // computed
  totalHours: number;         // computed
  hoursPercent: number;       // computed
}

export interface MonthData {
  month: string;       // "March"
  monthIndex: number;  // 0-11
  year: number;
  records: EmployeeMonthRecord[];
  columnHeaders: string[]; // ["1-Mar (Sun)", "2-Mar (Mon)", ...]
}

export interface WeekRange {
  weekNumber: number;  // 1-5
  label: string;       // "Week 1 (Mar 1–7)"
  startDay: number;
  endDay: number;
  columnHeaders: string[];
}
