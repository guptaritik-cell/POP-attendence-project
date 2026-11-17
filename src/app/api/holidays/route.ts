import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { getHolidaysCollection } from "@/lib/mongodb";
import { parseHolidayDate } from "@/lib/holidays";
import type { HolidayPublic } from "@/types/holiday";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const col = await getHolidaysCollection();
    const docs = await col.find({}).sort({ date: 1 }).toArray();
    const holidays: HolidayPublic[] = docs.map(d => ({
      date: d.date,
      name: d.name,
      ...(d.description ? { description: d.description } : {}),
    }));
    return NextResponse.json({ success: true, holidays }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[api/holidays][GET]", String(err));
    return NextResponse.json(
      { success: false, message: "Failed to load holidays", detail: String(err) },
      { status: 500 },
    );
  }
}

// Create or update a single holiday. `originalDate` is sent when editing so the
// date itself can be changed.
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: { date?: string; originalDate?: string; name?: string; description?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body" }, { status: 400 });
  }

  const date = parseHolidayDate(body.date);
  const originalDate = body.originalDate ? parseHolidayDate(body.originalDate) : null;
  const name = (body.name ?? "").trim();
  const description = (body.description ?? "").trim();

  if (!date) {
    return NextResponse.json({ success: false, message: "A valid date is required" }, { status: 422 });
  }
  if (!name) {
    return NextResponse.json({ success: false, message: "Holiday name is required" }, { status: 422 });
  }

  try {
    const col = await getHolidaysCollection();
    const lookupDate = originalDate ?? date;

    if (date !== lookupDate) {
      const collision = await col.findOne({ date });
      if (collision) {
        return NextResponse.json(
          { success: false, message: `A holiday already exists on that date (${collision.name})` },
          { status: 409 },
        );
      }
    }

    const now = new Date();
    await col.updateOne(
      { date: lookupDate },
      {
        $set: { date, name, description, updatedAt: now },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );

    return NextResponse.json({ success: true, holiday: { date, name, description } });
  } catch (err) {
    console.error("[api/holidays][POST]", String(err));
    return NextResponse.json(
      { success: false, message: "Failed to save holiday", detail: String(err) },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const url = new URL(req.url);
  const date = parseHolidayDate(url.searchParams.get("date"));
  if (!date) {
    return NextResponse.json({ success: false, message: "A valid date is required" }, { status: 422 });
  }

  try {
    const col = await getHolidaysCollection();
    const result = await col.deleteOne({ date });
    if (result.deletedCount === 0) {
      return NextResponse.json({ success: false, message: "Holiday not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[api/holidays][DELETE]", String(err));
    return NextResponse.json(
      { success: false, message: "Failed to delete holiday", detail: String(err) },
      { status: 500 },
    );
  }
}
