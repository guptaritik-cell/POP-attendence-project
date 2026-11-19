import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Date-range attendance summary.
//
//   ?scope=employee&employeeId=PTG001&from=YYYY-MM-DD&to=YYYY-MM-DD   (default scope)
//   ?scope=team&team=Design&from=…&to=…
//   ?scope=master&from=…&to=…
//
// Managers can only summarise their own team: team scope is forced to it,
// master scope is restricted to it, and other teams' employees are 403.
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const url        = new URL(req.url);
  const scope      = (url.searchParams.get("scope") ?? "employee").trim().toLowerCase();
  const employeeId = (url.searchParams.get("employeeId") ?? "").trim();
  const teamParam  = (url.searchParams.get("team") ?? "").trim();
  const fromStr    = (url.searchParams.get("from") ?? "").trim();
  const toStr      = (url.searchParams.get("to") ?? "").trim();

  const {
    parseISODate, rangeLabel, collectRange, emptyAcc, mergeAcc, toSummary, toTimeMetrics,
  } = await import("@/lib/summary");
  const { sameTeam } = await import("@/lib/sheets");

  if (!["employee", "team", "master"].includes(scope)) {
    return NextResponse.json({ success: false, message: "scope must be employee, team or master" }, { status: 422 });
  }
  const from = parseISODate(fromStr);
  const to   = parseISODate(toStr);
  if (!from || !to) {
    return NextResponse.json({ success: false, message: "from and to must be valid YYYY-MM-DD dates" }, { status: 422 });
  }
  if (new Date(to.year, to.month, to.day) < new Date(from.year, from.month, from.day)) {
    return NextResponse.json({ success: false, message: "The 'to' date cannot be earlier than the 'from' date" }, { status: 422 });
  }

  const isManager   = session.user.role === "manager";
  const managerTeam = session.user.team ?? "";
  const range = { from: fromStr, to: toStr, label: rangeLabel(from, to) };

  try {
    // ── Single employee ─────────────────────────────────────────────────────
    if (scope === "employee") {
      if (!employeeId) {
        return NextResponse.json({ success: false, message: "employeeId is required" }, { status: 422 });
      }
      const key = employeeId.toUpperCase();
      const map = await collectRange(from, to, r => r.employeeId.trim().toUpperCase() === key, true);
      const entry = map.get(key);
      if (!entry) {
        return NextResponse.json(
          { success: false, message: `No records found for employee "${employeeId}" in the selected date range.` },
          { status: 404, headers: NO_STORE },
        );
      }
      if (isManager && !sameTeam(entry.employee.team, managerTeam)) {
        return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403, headers: NO_STORE });
      }
      return NextResponse.json(
        {
          success: true,
          scope,
          employee: entry.employee,
          range,
          summary: toSummary(entry.acc),
          timeMetrics: toTimeMetrics(entry.acc),
          days: entry.days,
        },
        { headers: NO_STORE },
      );
    }

    // ── Team / Master ───────────────────────────────────────────────────────
    let team = "";
    if (scope === "team") {
      team = isManager ? managerTeam : teamParam;
      if (!team) {
        return NextResponse.json({ success: false, message: "team is required" }, { status: 422 });
      }
    } else if (isManager) {
      team = managerTeam; // managers' master summary is limited to their team
    }

    const map = await collectRange(from, to, r => !team || sameTeam(r.team, team));
    if (map.size === 0) {
      return NextResponse.json(
        {
          success: false,
          message: team
            ? `No records found for team "${team}" in the selected date range.`
            : "No records found in the selected date range.",
        },
        { status: 404, headers: NO_STORE },
      );
    }

    const total = emptyAcc();
    const byTeam = new Map<string, { team: string; acc: ReturnType<typeof emptyAcc>; count: number }>();
    const employees = [...map.values()]
      .map(e => {
        mergeAcc(total, e.acc);
        const t = e.employee.team || "—";
        const tk = t.trim().toLowerCase();
        if (!byTeam.has(tk)) byTeam.set(tk, { team: t, acc: emptyAcc(), count: 0 });
        const g = byTeam.get(tk)!;
        mergeAcc(g.acc, e.acc);
        g.count++;
        const tm = toTimeMetrics(e.acc);
        return {
          employee: e.employee,
          summary: toSummary(e.acc),
          totalMinutes: tm?.totalMinutes ?? 0,
          totalHours: tm?.totalHours ?? null,
          avgHoursPerDay: tm?.avgHoursPerDay ?? null,
          lateArrivals: tm?.lateArrivals ?? 0,
        };
      })
      .sort((a, b) => a.employee.team.localeCompare(b.employee.team) || a.employee.name.localeCompare(b.employee.name));

    const teams = [...byTeam.values()]
      .map(g => ({ team: g.team, employeeCount: g.count, summary: toSummary(g.acc), timeMetrics: toTimeMetrics(g.acc) }))
      .sort((a, b) => a.team.localeCompare(b.team));

    return NextResponse.json(
      {
        success: true,
        scope,
        team: team || null,
        range,
        employeeCount: map.size,
        summary: toSummary(total),
        timeMetrics: toTimeMetrics(total),
        teams,
        employees,
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error("[attendance/summary]", String(err));
    return NextResponse.json(
      { success: false, message: "Failed to build summary", detail: String(err) },
      { status: 500, headers: NO_STORE },
    );
  }
}
