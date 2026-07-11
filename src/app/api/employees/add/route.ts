import { NextResponse } from "next/server";
import { addEmployee } from "@/lib/sheets";

const MONTH_LABELS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

interface AddEmployeeBody {
  employeeId: string;
  name: string;
  team: string;
  buLead: string;
  joinMonth: number;  // 0-indexed (0 = January)
  joinYear: number;
  joinDate?: number;  // 1-indexed day of joining month
  tillMonth?: number; // 0-indexed inclusive end month
  tillYear?: number;
}

export async function POST(req: Request) {
  let body: AddEmployeeBody;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body" }, { status: 400 });
  }

  const { employeeId, name, team, buLead, joinMonth, joinYear, joinDate, tillMonth, tillYear } = body;

  // Validate required fields
  if (!employeeId?.trim()) {
    return NextResponse.json({ success: false, message: "Employee ID is required" }, { status: 422 });
  }
  if (!name?.trim()) {
    return NextResponse.json({ success: false, message: "Employee name is required" }, { status: 422 });
  }
  if (!team?.trim()) {
    return NextResponse.json({ success: false, message: "Team is required" }, { status: 422 });
  }
  if (!buLead?.trim()) {
    return NextResponse.json({ success: false, message: "BU Lead is required" }, { status: 422 });
  }
  if (typeof joinMonth !== "number" || joinMonth < 0 || joinMonth > 11) {
    return NextResponse.json({ success: false, message: "Invalid joining month" }, { status: 422 });
  }
  if (typeof joinYear !== "number" || joinYear < 2020 || joinYear > 2099) {
    return NextResponse.json({ success: false, message: "Invalid joining year" }, { status: 422 });
  }

  // ── "Till" (end) month — defaults to December of the joining year ──────────
  const effTillMonth = typeof tillMonth === "number" ? tillMonth : 11;
  const effTillYear  = typeof tillYear  === "number" ? tillYear  : joinYear;

  if (effTillMonth < 0 || effTillMonth > 11) {
    return NextResponse.json({ success: false, message: "Invalid 'till' month" }, { status: 422 });
  }

  // The spreadsheet spans a single year (one tab per month). The "till" range
  // must not end before the joining month.
  const joinAbs = joinYear     * 12 + joinMonth;
  const tillAbs = effTillYear  * 12 + effTillMonth;
  if (tillAbs < joinAbs) {
    return NextResponse.json(
      { success: false, message: "The 'till' month cannot be earlier than the joining month" },
      { status: 422 },
    );
  }

  // Map the absolute end position onto the single-year month tabs:
  //  • end in a later year  → write through December (index 11)
  //  • end in the same year → write through the selected month
  const endMonth = effTillYear > joinYear ? 11 : effTillMonth;

  try {
    await addEmployee(
      { employeeId: employeeId.trim(), name: name.trim(), team: team.trim(), buLead: buLead.trim() },
      joinMonth,
      joinYear,
      typeof joinDate === "number" ? joinDate : 1,
      endMonth,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("addEmployee sheets error:", message, err);
    return NextResponse.json(
      { success: false, message: "Failed to write to spreadsheet", detail: message },
      { status: 500 }
    );
  }

  const fromLabel = `${MONTH_LABELS[joinMonth]} ${joinYear}`;
  const tillLabel = `${MONTH_LABELS[endMonth]} ${joinYear}`;
  const rangeLabel = joinMonth === endMonth ? fromLabel : `${fromLabel} to ${tillLabel}`;
  return NextResponse.json({
    success: true,
    message: `${name.trim()} (${employeeId.trim()}) has been added to the sheets for ${rangeLabel}.`,
  });
}
