import { NextResponse } from "next/server";

const MONTH_NAMES = [
  "january","february","march","april","may","june",
  "july","august","september","october","november","december",
];

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ month: string }> }
) {
  const { month } = await params;
  const monthIndex = MONTH_NAMES.indexOf(month.toLowerCase());

  if (monthIndex === -1) {
    return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  }

  try {
    const { getMonthData } = await import("@/lib/sheets");
    const data = await getMonthData(monthIndex);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error(`[API] Sheets error:`, String(err));
    return NextResponse.json(
      { error: "Failed to fetch attendance data", detail: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
