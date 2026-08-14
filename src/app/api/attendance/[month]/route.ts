import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const MONTH_NAMES = [
  "january","february","march","april","may","june",
  "july","august","september","october","november","december",
];

// The spreadsheet only contains data for ONE specific year.
// If the client requests a different year we return empty data
// rather than silently showing the wrong year's records.
const SHEET_YEAR = new Date().getFullYear(); // 2026 — matches current Google Sheet

export async function GET(
  req: Request,
  { params }: { params: Promise<{ month: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { month } = await params;
  const monthIndex = MONTH_NAMES.indexOf(month.toLowerCase());

  if (monthIndex === -1) {
    return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  }

  // Read year from query string (sent by DataSync)
  const url  = new URL(req.url);
  const year = parseInt(url.searchParams.get("year") ?? String(SHEET_YEAR), 10);

  // If the requested year doesn't match the spreadsheet's year, return empty data
  if (year !== SHEET_YEAR) {
    return NextResponse.json(
      {
        month: month.charAt(0).toUpperCase() + month.slice(1),
        monthIndex,
        year,
        records: [],
        columnHeaders: [],
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const { getMonthData } = await import("@/lib/sheets");
    const data = await getMonthData(monthIndex, year);

    const scoped = session.user.role === "manager"
      ? { ...data, records: data.records.filter(r => r.team === session.user.team) }
      : data;

    return NextResponse.json(scoped, {
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
