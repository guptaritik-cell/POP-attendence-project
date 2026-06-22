import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { updateLeaveFromExcel } from "@/lib/sheets";

export const maxDuration = 30;

interface LeaveExcelBody {
  fileBase64: string;
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

    const result = await updateLeaveFromExcel(buffer);

    const message =
      result.cellsWritten === 0
        ? "No approved leave requests found in the file."
        : `Leave data synced — ${result.rowsProcessed} approved request${result.rowsProcessed !== 1 ? "s" : ""} processed, ${result.cellsWritten} cells written.`;

    return NextResponse.json({ success: true, message, stats: result });
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[attendance/leave-excel]", detail);
    return NextResponse.json({ success: false, message: detail }, { status: 500 });
  }
}
