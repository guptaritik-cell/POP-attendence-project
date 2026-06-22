import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { updateWFHFromExcel } from "@/lib/sheets";

// Max ~10 MB base64 payload
export const maxDuration = 30;

interface WFHExcelBody {
  fileBase64: string;  // ArrayBuffer → base64 string
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
  let body: WFHExcelBody;
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
    // A WFH report must have "request type" column.
    // If the file has "leave types" it is a Leave report, not a WFH report.
    const headers = peekHeaders(buffer);
    if (headers.includes("leave types") || headers.includes("from session")) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Wrong file uploaded. This looks like a Leave report. Please upload the WFH request report instead.",
        },
        { status: 422 },
      );
    }
    if (!headers.includes("request type")) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Unrecognised file format. Please upload the WFH request report exported from the HR system.",
        },
        { status: 422 },
      );
    }
    // ─────────────────────────────────────────────────────────────────────────

    const result = await updateWFHFromExcel(buffer);

    const message =
      result.cellsWritten === 0
        ? "No approved WFH requests found in the file."
        : `WFH data synced — ${result.rowsProcessed} approved request${result.rowsProcessed !== 1 ? "s" : ""} processed, ${result.cellsWritten} cells written.`;

    return NextResponse.json({ success: true, message, stats: result });
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[attendance/wfh-excel]", detail);
    return NextResponse.json({ success: false, message: detail }, { status: 500 });
  }
}
