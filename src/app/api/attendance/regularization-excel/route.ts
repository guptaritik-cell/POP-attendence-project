import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { updateRegularizationFromExcel } from "@/lib/sheets";
import { requireAdmin } from "@/lib/requireAdmin";

export const maxDuration = 30;

const MONTH_LABELS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

interface RegularizationBody {
  fileBase64: string;  // ArrayBuffer → base64 string
  month?: number;      // 0-indexed target month (only entries in this month are written)
}

// Header row (the one containing "Employee Number") in lowercase.
function peekHeaders(buffer: Buffer): string[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "", raw: false }) as string[][];
  const hdr = rows.find(r => r.some(c => String(c).trim().toLowerCase() === "employee number"));
  return hdr ? hdr.map(h => String(h).trim().toLowerCase()) : [];
}

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: RegularizationBody;
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
    const headers = peekHeaders(buffer);
    if (headers.includes("leave types") || headers.includes("from session")) {
      return NextResponse.json(
        { success: false, message: "Wrong file uploaded. This looks like a Leave report. Please upload the Attendance Regularization report instead." },
        { status: 422 },
      );
    }
    if (headers.includes("from date") && !headers.includes("requested date")) {
      return NextResponse.json(
        { success: false, message: "Wrong file uploaded. This looks like a WFH report. Please upload the Attendance Regularization report instead." },
        { status: 422 },
      );
    }
    if (!headers.includes("requested date") || !headers.includes("request status")) {
      return NextResponse.json(
        { success: false, message: "Unrecognised file format. Please upload the Attendance Regularization report exported from the HR system." },
        { status: 422 },
      );
    }

    const targetMonth = typeof body.month === "number" ? body.month : undefined;
    if (targetMonth !== undefined && (targetMonth < 0 || targetMonth > 11)) {
      return NextResponse.json({ success: false, message: "Invalid target month" }, { status: 422 });
    }

    const result = await updateRegularizationFromExcel(buffer, targetMonth);

    let message: string;
    if (targetMonth !== undefined && result.daysMarked === 0) {
      const inFile = result.monthsInFile.map(m => MONTH_LABELS[m]).join(", ");
      message = result.monthsInFile.includes(targetMonth)
        ? `No days were marked Present for ${MONTH_LABELS[targetMonth]} (days may already be filled, or employees not in that sheet).`
        : `No approved regularization requests for ${MONTH_LABELS[targetMonth]} found in the file.` +
          (inFile ? ` The file contains data for: ${inFile}.` : "");
    } else if (result.daysMarked === 0) {
      message = "No approved regularization requests could be applied.";
    } else {
      const scope = targetMonth !== undefined ? ` for ${MONTH_LABELS[targetMonth]}` : "";
      message = `Regularization synced${scope} — ${result.daysMarked} day(s) marked Present.`;
    }

    return NextResponse.json({ success: true, message, stats: result });
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[attendance/regularization-excel]", detail);
    return NextResponse.json({ success: false, message: detail }, { status: 500 });
  }
}
