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
}

export async function POST(req: Request) {
  let body: AddEmployeeBody;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body" }, { status: 400 });
  }

  const { employeeId, name, team, buLead, joinMonth, joinYear } = body;

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

  try {
    await addEmployee(
      { employeeId: employeeId.trim(), name: name.trim(), team: team.trim(), buLead: buLead.trim() },
      joinMonth,
      joinYear,
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
  return NextResponse.json({
    success: true,
    message: `${name.trim()} (${employeeId.trim()}) has been added to all sheets from ${fromLabel} onwards.`,
  });
}
