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

  let body: { employeeId?: string; from?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body" }, { status: 400 });
  }

  const employeeId = (body.employeeId ?? "").trim();
  const fromStr    = (body.from ?? "").trim();

  // ── Validation ──────────────────────────────────────────────────────────────
  if (!employeeId) {
    return NextResponse.json({ success: false, message: "employeeId is required" }, { status: 422 });
  }
  const from = parseISODate(fromStr);
  if (!from) {
    return NextResponse.json({ success: false, message: "from must be a valid YYYY-MM-DD date" }, { status: 422 });
  }
  if (from.year !== SHEET_YEAR) {
    return NextResponse.json(
      { success: false, message: `Only ${SHEET_YEAR} dates are supported — the spreadsheet holds records for ${SHEET_YEAR} only.` },
      { status: 422, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Marks the employee "Inactive" from `from` to the end of that month, and
  // deletes their rows from every later month tab.
  try {
    const { markEmployeeInactive } = await import("@/lib/sheets");
    const result = await markEmployeeInactive(employeeId, from);

    if (!result.found) {
      return NextResponse.json(
        { success: false, message: `No records found for employee "${employeeId}" from the selected month onward.` },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: `Marked ${employeeId} inactive for ${result.daysMarked} day(s) and removed them from ${result.monthsDeleted.length} later month(s).`,
        daysMarked:    result.daysMarked,
        monthsDeleted: result.monthsDeleted,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[attendance/remove]", String(err));
    return NextResponse.json(
      { success: false, message: "Failed to mark employee inactive", detail: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
