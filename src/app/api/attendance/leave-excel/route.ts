import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { updateLeaveFromExcel } from "@/lib/sheets";

export const maxDuration = 30;

const MONTH_LABELS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

interface LeaveExcelBody {
  fileBase64: string;
  month?: number;   // 0-indexed target month (only entries in this month are written)
}

/**
 * Peek at the first sheet's header row and return all column names in lowercase.
 * Works for both row-0 headers and files with metadata rows before the header.
 */
function peekHeaders(buffer: Buffer): string[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<string[]>(ws, {
    header: 1,
    defval: "",
    raw: false,
  }) as string[][];

  // Find first row that contains "employee number" (the real header row)
  const hdrRow = rawRows.find(row =>
    row.some(cell => String(cell).trim().toLowerCase() === "employee number")
  );
  if (!hdrRow) return [];
  return hdrRow.map(h => String(h).trim().toLowerCase());
}

export async function POST(req: Request) {
  let body: LeaveExcelBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.fileBase64?.trim()) {
    return NextResponse.json({ success: false, message: "File data is required" }, { status: 422 });
  }

  try {
    const buffer = Buffer.from(body.fileBase64, "base64");

    // ── File-type guard ───────────────────────────────────────────────────────
    // A Leave report must have "leave types" column.
    // If the file has "request type" it is a WFH report, not a Leave report.
    const headers = peekHeaders(buffer);
    if (headers.includes("request type")) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Wrong file uploaded. This looks like a WFH request report. Please upload the Leave report instead.",
        },
        { status: 422 },
      );
    }
    if (!headers.includes("leave types")) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Unrecognised file format. Please upload the Leave report exported from the HR system.",
        },
        { status: 422 },
      );
    }
    // ─────────────────────────────────────────────────────────────────────────

    const targetMonth = typeof body.month === "number" ? body.month : undefined;
    if (targetMonth !== undefined && (targetMonth < 0 || targetMonth > 11)) {
      return NextResponse.json({ success: false, message: "Invalid target month" }, { status: 422 });
    }

    const result = await updateLeaveFromExcel(buffer, targetMonth);

    let message: string;
    if (targetMonth !== undefined && result.cellsWritten === 0) {
      const inFile = result.monthsInFile.map(m => MONTH_LABELS[m]).join(", ");
      message = result.monthsInFile.includes(targetMonth)
        ? `No leave cells were written for ${MONTH_LABELS[targetMonth]} (employees may not exist in that sheet, or the days were week-offs/holidays).`
        : `No approved leave requests for ${MONTH_LABELS[targetMonth]} found in the file.` +
          (inFile ? ` The file contains data for: ${inFile}.` : "");
    } else if (result.cellsWritten === 0) {
      message = "No approved leave requests found in the file.";
    } else {
      const scope = targetMonth !== undefined ? ` for ${MONTH_LABELS[targetMonth]}` : "";
      message = `Leave data synced${scope} — ${result.cellsWritten} cells written.`;
    }

    return NextResponse.json({ success: true, message, stats: result });
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[attendance/leave-excel]", detail);
    return NextResponse.json({ success: false, message: detail }, { status: 500 });
  }
}
