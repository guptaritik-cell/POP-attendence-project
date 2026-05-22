import { NextResponse } from "next/server";

const MONTH_NAMES = [
  "january","february","march","april","may","june",
  "july","august","september","october","november","december",
];

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ month: string }> }
) {
  console.log("[API] GET /api/attendance/[month] called");
  
  const { month } = await params;
  console.log(`[API] Month parameter: ${month}`);
  
  const monthIndex = MONTH_NAMES.indexOf(month.toLowerCase());
  console.log(`[API] Month index: ${monthIndex}`);

  if (monthIndex === -1) {
    console.warn(`[API] Invalid month: ${month}`);
    return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  }

  try {
    console.log("[API] Importing getMonthData...");
    const { getMonthData } = await import("@/lib/sheets");
    console.log("[API] Calling getMonthData...");
    const data = await getMonthData(monthIndex);
    console.log("[API] Data received successfully, returning JSON");
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },   // always fresh — no caching
    });
  } catch (err) {
    console.error(`[API] Error occurred:`, err);
    console.error(`[API] Error message: ${String(err)}`);
    console.error(`[API] Error stack:`, (err as any)?.stack);
    return NextResponse.json(
      { error: "Failed to fetch attendance data", detail: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
