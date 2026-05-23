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

  // Log which env vars are present (helps debug Vercel missing-var issues)
  console.log("[API] Env check:", {
    GOOGLE_SHEET_ID:            !!process.env.GOOGLE_SHEET_ID,
    GOOGLE_OAUTH_CLIENT_ID:     !!process.env.GOOGLE_OAUTH_CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET: !!process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    GOOGLE_OAUTH_REFRESH_TOKEN: !!process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
  });

  try {
    const { getMonthData } = await import("@/lib/sheets");
    const data = await getMonthData(monthIndex);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const detail = String(err);
    console.error(`[API] Sheets error:`, detail);
    return NextResponse.json(
      { error: "Failed to fetch attendance data", detail },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
