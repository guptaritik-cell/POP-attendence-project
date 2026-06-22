import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { updateAttendanceFromCsv, type AttendanceUploadMode } from "@/lib/sheets";
import { parseCsvText } from "@/lib/csvUtils";

// ── Multi-sheet Excel preprocessor ───────────────────────────────────────────
//
// Handles the "Monthly Status Report (Work Duration)" Excel export which has:
//   • N sheets (one per department)
//   • 6 metadata rows per sheet before the actual header
//   • 3-col prefix: [Employee ID, First Name, Type\Date, day1, day2, …]
//
// Also handles any single-sheet Excel that already uses the standard 4- or
// 5-col prefix — in that case rows pass through unchanged.
//
// Output: combined rows array with a single header row followed by all
// employee rows from every sheet, normalised to the 5-col new format:
//   [ID, Name, Team(empty), BuLead(empty), TypeLabel, day1, day2, …]
//
function prepareExcelRows(wb: XLSX.WorkBook): string[][] {
  const combined: string[][] = [];
  let headerEmitted = false;

  for (const sheetName of wb.SheetNames) {
    const ws      = wb.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<string[]>(ws, {
      header: 1,
      defval: "",
      raw:    false,
    }) as string[][];

    if (rawRows.length === 0) continue;

    // Find the actual header row: first row where col[0] normalises to
    // "employee id" (case-insensitive, any surrounding whitespace).
    let hdrIdx = -1;
    for (let r = 0; r < rawRows.length; r++) {
      if ((rawRows[r][0] ?? "").trim().toLowerCase() === "employee id") {
        hdrIdx = r;
        break;
      }
    }

    // If we never found the header, skip this sheet.
    if (hdrIdx === -1) continue;

    const dataRows = rawRows.slice(hdrIdx); // [headerRow, emp rows…]
    if (dataRows.length < 2) continue;

    // ── Detect prefix width ───────────────────────────────────────────────
    // Find index of first day column — the first col after col 0 whose
    // header starts with a digit (day number).
    const hdr        = dataRows[0];
    let dayStartCol  = -1;
    for (let c = 1; c < hdr.length; c++) {
      if (/^\d/.test((hdr[c] ?? "").trim())) {
        dayStartCol = c;
        break;
      }
    }

    // Can't detect structure — skip sheet.
    if (dayStartCol === -1) continue;

    // ── Normalise to 5-col prefix ─────────────────────────────────────────
    // Standard new-format has dayStartCol === 5 (cols 0-4 are metadata).
    // Standard old-format has dayStartCol === 4.
    // Monthly Status Report has dayStartCol === 3 → insert 2 padding cols.
    const insertCount = Math.max(0, 5 - dayStartCol);

    function padRow(row: string[]): string[] {
      if (insertCount === 0) return row;
      // Insert `insertCount` empty strings before the day-label column
      // (i.e. between col dayStartCol-1 and col dayStartCol).
      return [
        ...row.slice(0, dayStartCol - 1),   // up to (but not including) the type label
        "",                                   // padding cols
        ...(insertCount > 1 ? Array(insertCount - 1).fill("") : []),
        ...row.slice(dayStartCol - 1),        // type label + day data
      ];
    }

    if (!headerEmitted) {
      combined.push(padRow(dataRows[0]));
      headerEmitted = true;
    }

    // Add data rows (skip header row for this sheet)
    for (let r = 1; r < dataRows.length; r++) {
      combined.push(padRow(dataRows[r]));
    }
  }

  return combined;
}

// ── Month detector ────────────────────────────────────────────────────────────
//
// Tries to read the month embedded in the workbook by searching three sources
// in priority order:
//   1. Metadata rows above the "Employee ID" header (e.g. "May 2025")
//   2. Sheet names (e.g. "HR - May", "Sales May 2025")
//   3. Day-column headers in "1-Jan (Thu)" format
//
// Returns 0-indexed month (0 = January … 11 = December), or -1 if not found.
//
const MONTH_NAMES_FULL = [
  "january","february","march","april","may","june",
  "july","august","september","october","november","december",
];
const MONTH_NAMES_ABBR = [
  "jan","feb","mar","apr","may","jun",
  "jul","aug","sep","oct","nov","dec",
];

function monthIndexFromText(text: string): number {
  const t = text.trim().toLowerCase();
  // Full name match (word boundary)
  for (let i = 0; i < MONTH_NAMES_FULL.length; i++) {
    const re = new RegExp(`\\b${MONTH_NAMES_FULL[i]}\\b`);
    if (re.test(t)) return i;
  }
  // 3-letter abbreviation match (word boundary, but not inside a longer word)
  for (let i = 0; i < MONTH_NAMES_ABBR.length; i++) {
    const re = new RegExp(`\\b${MONTH_NAMES_ABBR[i]}\\b`);
    if (re.test(t)) return i;
  }
  return -1;
}

function detectMonthFromWorkbook(wb: XLSX.WorkBook): number {
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<string[]>(ws, {
      header: 1,
      defval: "",
      raw: false,
    }) as string[][];

    if (rawRows.length === 0) continue;

    // Find the "Employee ID" header row
    let hdrIdx = -1;
    for (let r = 0; r < rawRows.length; r++) {
      if ((rawRows[r][0] ?? "").trim().toLowerCase() === "employee id") {
        hdrIdx = r;
        break;
      }
    }
    if (hdrIdx === -1) continue;

    // ── Source 1: metadata rows above the header ─────────────────────────────
    for (let r = 0; r < hdrIdx; r++) {
      for (const cell of rawRows[r]) {
        const m = monthIndexFromText(String(cell));
        if (m !== -1) return m;
      }
    }

    // ── Source 3: day-column headers in "1-Jan (Thu)" format ─────────────────
    const hdrRow = rawRows[hdrIdx];
    for (let c = 1; c < hdrRow.length; c++) {
      const cell = String(hdrRow[c] ?? "").trim();
      // Matches "1-Jan (Thu)" or "15-Mar (Mon)" etc.
      const match = cell.match(/^\d+[-–]([A-Za-z]{3})\b/);
      if (match) {
        const m = monthIndexFromText(match[1]);
        if (m !== -1) return m;
      }
    }
  }

  // ── Source 2: sheet names ─────────────────────────────────────────────────
  for (const sheetName of wb.SheetNames) {
    const m = monthIndexFromText(sheetName);
    if (m !== -1) return m;
  }

  return -1; // couldn't detect — skip month validation
}

// ── Wrong-file-type detector ──────────────────────────────────────────────────
//
// Scans every sheet in the workbook (or the first row of a CSV) looking for
// column names that belong exclusively to the WFH or Leave reports.
// Returns a human-readable error string, or null if the file looks fine.
//
function detectWrongFileType(wb: XLSX.WorkBook): string | null {
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<string[]>(ws, {
      header: 1,
      defval: "",
      raw: false,
    }) as string[][];

    // Find any row that looks like a header (contains "employee number" OR
    // contains common WFH/Leave column names).
    for (const row of rawRows) {
      const cols = row.map(c => String(c).trim().toLowerCase());

      // WFH report signature: has "request type" column
      if (cols.includes("request type")) {
        return "Wrong file uploaded. This looks like a WFH request report. Please upload the Monthly Status Report (attendance) instead.";
      }

      // Leave report signature: has "leave types" column
      if (cols.includes("leave types")) {
        return "Wrong file uploaded. This looks like a Leave report. Please upload the Monthly Status Report (attendance) instead.";
      }

      // Generic HR-request file: has "employee number" but NOT "employee id"
      // (attendance files use "employee id" as the first column)
      if (
        cols.includes("employee number") &&
        !cols.includes("employee id")
      ) {
        return "Wrong file uploaded. The attendance section only accepts the Monthly Status Report. Please upload the correct file.";
      }
    }
  }
  return null;
}

function detectWrongFileTypeFromRows(rows: string[][]): string | null {
  if (rows.length === 0) return null;
  const cols = rows[0].map(c => String(c).trim().toLowerCase());

  if (cols.includes("request type")) {
    return "Wrong file uploaded. This looks like a WFH request report. Please upload the Monthly Status Report (attendance) instead.";
  }
  if (cols.includes("leave types")) {
    return "Wrong file uploaded. This looks like a Leave report. Please upload the Monthly Status Report (attendance) instead.";
  }
  if (cols.includes("employee number") && !cols.includes("employee id")) {
    return "Wrong file uploaded. The attendance section only accepts the Monthly Status Report. Please upload the correct file.";
  }
  return null;
}

const MONTH_LABELS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const MODE_LABELS: Record<AttendanceUploadMode, string> = {
  all:   "attendance",
  wfh:   "WFH",
  leave: "leave",
};

interface UploadBody {
  month: number;                  // 0-indexed
  mode?: AttendanceUploadMode;    // default "all"
  csvText?: string;               // CSV file content (plain text)
  fileBase64?: string;            // Excel file content (base64-encoded ArrayBuffer)
}

export async function POST(req: Request) {
  let body: UploadBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body" }, { status: 400 });
  }

  const { month, mode = "all", csvText, fileBase64 } = body;

  if (typeof month !== "number" || month < 0 || month > 11) {
    return NextResponse.json({ success: false, message: "Invalid month (must be 0–11)" }, { status: 422 });
  }
  if (!["all", "wfh", "leave"].includes(mode)) {
    return NextResponse.json({ success: false, message: "Invalid mode" }, { status: 422 });
  }
  if (!csvText?.trim() && !fileBase64?.trim()) {
    return NextResponse.json({ success: false, message: "File data is required (csvText or fileBase64)" }, { status: 422 });
  }

  try {
    let csvRows: string[][];

    if (fileBase64) {
      // Excel file → parse with XLSX library (multi-sheet + metadata aware)
      const buffer = Buffer.from(fileBase64, "base64");
      const wb     = XLSX.read(buffer, { type: "buffer" });

      // ── File-type guard (Excel) ───────────────────────────────────────────
      const typeErr = detectWrongFileType(wb);
      if (typeErr) {
        return NextResponse.json({ success: false, message: typeErr }, { status: 422 });
      }
      // ─────────────────────────────────────────────────────────────────────

      // ── Month mismatch guard (Excel) ──────────────────────────────────────
      const fileMonth = detectMonthFromWorkbook(wb);
      if (fileMonth !== -1 && fileMonth !== month) {
        return NextResponse.json(
          {
            success: false,
            message: `Month mismatch — you selected ${MONTH_LABELS[month]} but the uploaded file contains ${MONTH_LABELS[fileMonth]} data. Please select the correct month or upload the correct file.`,
          },
          { status: 422 },
        );
      }
      // ─────────────────────────────────────────────────────────────────────

      csvRows = prepareExcelRows(wb);
    } else {
      // CSV text → parse with our CSV parser
      csvRows = parseCsvText(csvText!);

      // ── File-type guard (CSV) ─────────────────────────────────────────────
      const typeErr = detectWrongFileTypeFromRows(csvRows);
      if (typeErr) {
        return NextResponse.json({ success: false, message: typeErr }, { status: 422 });
      }
      // ─────────────────────────────────────────────────────────────────────
    }

    if (csvRows.length < 2) {
      return NextResponse.json({ success: false, message: "File appears to be empty" }, { status: 422 });
    }

    const result = await updateAttendanceFromCsv(month, csvRows, mode);

    const monthLabel = MONTH_LABELS[month];
    const modeLabel  = MODE_LABELS[mode];
    const message =
      result.cellsWritten === 0
        ? `No ${modeLabel} data found in the file for ${monthLabel}. Make sure the correct month is selected.`
        : `${monthLabel} ${modeLabel} data synced — ${result.employeesUpdated} employee${result.employeesUpdated !== 1 ? "s" : ""} updated, ${result.cellsWritten} cells written.`;

    return NextResponse.json({ success: true, message, stats: result });
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[attendance/upload][${mode}]`, detail);
    return NextResponse.json({ success: false, message: detail }, { status: 500 });
  }
}
