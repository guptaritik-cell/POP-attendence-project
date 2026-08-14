import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";

// The spreadsheet only holds data for the current year (same policy as the
// summary / [month] routes). Months outside SHEET_YEAR contribute nothing.
const SHEET_YEAR = new Date().getFullYear();

// Parse "YYYY-MM-DD" → { year, month (0-idx), day } or null
function parseISODate(s: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const year  = parseInt(m[1], 10);
  const month = parseInt(m[2], 10) - 1;
  const day   = parseInt(m[3], 10);
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  return { year, month, day };
}

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: { employeeId?: string; from?: string; to?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body" }, { status: 400 });
  }

  const employeeId = (body.employeeId ?? "").trim();
  const fromStr    = (body.from ?? "").trim();
  const toStr      = (body.to ?? "").trim();

  // ── Validation ──────────────────────────────────────────────────────────────
  if (!employeeId) {
    return NextResponse.json({ success: false, message: "employeeId is required" }, { status: 422 });
  }
  const from = parseISODate(fromStr);
  const to   = parseISODate(toStr);
  if (!from || !to) {
    return NextResponse.json({ success: false, message: "from and to must be valid YYYY-MM-DD dates" }, { status: 422 });
  }

  const fromSerial = new Date(from.year, from.month, from.day).getTime();
  const toSerial   = new Date(to.year,   to.month,   to.day).getTime();
  if (toSerial < fromSerial) {
    return NextResponse.json({ success: false, message: "The 'to' date cannot be earlier than the 'from' date" }, { status: 422 });
  }

  if (from.year !== SHEET_YEAR || to.year !== SHEET_YEAR) {
    return NextResponse.json(
      { success: false, message: `Only ${SHEET_YEAR} data can be cleared — the spreadsheet holds records for ${SHEET_YEAR} only.` },
      { status: 422, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const { clearAttendanceRange } = await import("@/lib/sheets");
    const result = await clearAttendanceRange(employeeId, from, to);

    if (!result.found) {
      return NextResponse.json(
        { success: false, message: `No records found for employee "${employeeId}" in the selected date range.` },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: `Cleared attendance for ${employeeId} across ${result.daysCleared} day(s) in ${result.monthsTouched} month(s).`,
        daysCleared:   result.daysCleared,
        cellsCleared:  result.cellsCleared,
        monthsTouched: result.monthsTouched,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[attendance/remove]", String(err));
    return NextResponse.json(
      { success: false, message: "Failed to clear attendance", detail: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
