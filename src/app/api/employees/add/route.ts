import { NextResponse } from "next/server";

interface AddEmployeeBody {
  employeeId: string;
  name: string;
  team: string;
  buLead: string;
  designation?: string;
}

export async function POST(req: Request) {
  let body: AddEmployeeBody;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body" }, { status: 400 });
  }

  const { employeeId, name, team, buLead } = body;

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

  // In production, write to Google Sheets
  if (process.env.NODE_ENV === "production") {
    try {
      const { addEmployee } = await import("@/lib/sheets");
      await addEmployee({ employeeId: employeeId.trim(), name: name.trim(), team: team.trim(), buLead: buLead.trim() });
    } catch (err) {
      console.error("addEmployee sheets error:", err);
      return NextResponse.json({ success: false, message: "Failed to write to spreadsheet" }, { status: 500 });
    }
  } else {
    // Dev: mock — just log
    console.log("[dev] addEmployee:", { employeeId, name, team, buLead, designation: body.designation });
  }

  return NextResponse.json({
    success: true,
    message: `${name.trim()} (${employeeId.trim()}) has been added to all 12 monthly sheets.`,
  });
}
