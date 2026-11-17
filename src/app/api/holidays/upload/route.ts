import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireAdmin } from "@/lib/requireAdmin";
import { getHolidaysCollection } from "@/lib/mongodb";
import { parseHolidayDate } from "@/lib/holidays";

export const maxDuration = 30;

// Bulk holiday import from an uploaded sheet (.xlsx / .xls / .csv).
// Expected layout (first sheet):
//   Column A: Holiday Name
//   Column B: Date (DD-MMM-YYYY, e.g. 01-Jan-2026)
// A header row is optional — any row whose column B isn't a valid date is
// skipped (and reported unless it looks like a header). Existing holidays on
// the same date are updated with the new name.
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: { fileBase64?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.fileBase64?.trim()) {
    return NextResponse.json({ success: false, message: "File data is required" }, { status: 422 });
  }

  let rows: unknown[][];
  try {
    const wb = XLSX.read(Buffer.from(body.fileBase64, "base64"), { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    // raw: true keeps Excel date cells as serial numbers so parsing doesn't
    // depend on the locale-specific display format.
    rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", raw: true }) as unknown[][];
  } catch (err) {
    return NextResponse.json(
      { success: false, message: "Could not read the file. Upload a .xlsx, .xls or .csv sheet.", detail: String(err) },
      { status: 422 },
    );
  }

  const entries = new Map<string, string>(); // date → name (last one in file wins)
  const errors: string[] = [];

  rows.forEach((row, i) => {
    const name = String(row[0] ?? "").trim();
    const rawDate = row[1];
    if (!name && String(rawDate ?? "").trim() === "") return; // blank row

    const date = parseHolidayDate(rawDate);
    if (!date) {
      const isHeader = i === 0 && /holiday|name/i.test(name);
      if (!isHeader) errors.push(`Row ${i + 1}: invalid date "${String(rawDate ?? "")}" (expected DD-MMM-YYYY)`);
      return;
    }
    if (!name) {
      errors.push(`Row ${i + 1}: holiday name is missing`);
      return;
    }
    entries.set(date, name);
  });

  if (entries.size === 0) {
    return NextResponse.json(
      { success: false, message: "No valid holidays found in the file", errors },
      { status: 422 },
    );
  }

  try {
    const col = await getHolidaysCollection();
    const now = new Date();
    const result = await col.bulkWrite(
      [...entries].map(([date, name]) => ({
        updateOne: {
          filter: { date },
          update: {
            $set: { date, name, updatedAt: now },
            $setOnInsert: { description: "", createdAt: now },
          },
          upsert: true,
        },
      })),
    );

    return NextResponse.json({
      success: true,
      added: result.upsertedCount,
      updated: result.matchedCount,
      errors,
    });
  } catch (err) {
    console.error("[api/holidays/upload][POST]", String(err));
    return NextResponse.json(
      { success: false, message: "Failed to save holidays", detail: String(err) },
      { status: 500 },
    );
  }
}
