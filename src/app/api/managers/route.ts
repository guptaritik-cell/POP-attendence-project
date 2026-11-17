import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { getManagersCollection } from "@/lib/mongodb";
import type { ManagerPublic } from "@/types/manager";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const managers = await getManagersCollection();
    const docs = await managers
      .find({}, { projection: { passwordHash: 0 } })
      .sort({ createdAt: -1 })
      .toArray();

    const list: ManagerPublic[] = docs.map(d => ({
      email: d.email,
      name: d.name,
      team: d.team,
    }));

    return NextResponse.json({ success: true, managers: list });
  } catch (err) {
    console.error("[api/managers][GET]", String(err));
    return NextResponse.json(
      { success: false, message: "Failed to load managers", detail: String(err) },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: { email?: string; originalEmail?: string; name?: string; team?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const originalEmail = (body.originalEmail ?? "").trim().toLowerCase() || null;
  const name = (body.name ?? "").trim();
  const team = (body.team ?? "").trim();

  if (!email || !name || !team) {
    return NextResponse.json(
      { success: false, message: "email, name, and team are all required" },
      { status: 422 },
    );
  }

  try {
    const managers = await getManagersCollection();
    // Editing looks up the manager by their ORIGINAL email (which may now be
    // changing); creating a new manager looks up by the email itself.
    const lookupEmail = originalEmail ?? email;

    // Renaming to an email already used by a different manager isn't allowed.
    if (email !== lookupEmail) {
      const collision = await managers.findOne({ email });
      if (collision) {
        return NextResponse.json(
          { success: false, message: "A manager with that email already exists" },
          { status: 409 },
        );
      }
    }

    const now = new Date();
    // Managers sign in with Google only — no password is stored.
    const setFields: Record<string, unknown> = { email, name, team, updatedAt: now };

    await managers.updateOne(
      { email: lookupEmail },
      {
        $set: setFields,
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );

    return NextResponse.json({ success: true, manager: { email, name, team } });
  } catch (err) {
    console.error("[api/managers][POST]", String(err));
    return NextResponse.json(
      { success: false, message: "Failed to save manager", detail: String(err) },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const url = new URL(req.url);
  const email = (url.searchParams.get("email") ?? "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ success: false, message: "email is required" }, { status: 422 });
  }

  try {
    const managers = await getManagersCollection();
    const result = await managers.deleteOne({ email });
    if (result.deletedCount === 0) {
      return NextResponse.json({ success: false, message: "Manager not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[api/managers][DELETE]", String(err));
    return NextResponse.json(
      { success: false, message: "Failed to delete manager", detail: String(err) },
      { status: 500 },
    );
  }
}
