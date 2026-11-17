import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Returns designation / employment type / joining & leaving dates for every
// employee, keyed by upper-cased employee ID, from the Employee_Reference tab.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { getEmployeeReferences } = await import("@/lib/sheets");
    const refs = await getEmployeeReferences();
    return NextResponse.json(refs, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[employees/reference] failed:", err);
    return NextResponse.json({ error: "Failed to load employee details" }, { status: 500 });
  }
}
