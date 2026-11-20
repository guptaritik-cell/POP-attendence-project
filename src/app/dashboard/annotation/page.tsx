"use client";

import { SYMBOL_LIST, type SymbolCategory } from "@/lib/attendanceSymbols";

const CATEGORY_LABELS: Record<SymbolCategory, string> = {
  present: "Present",
  absent:  "Absent",
  leave:   "Leave",
  off:     "Off Day",
};

const CATEGORY_ORDER: SymbolCategory[] = ["present", "absent", "leave", "off"];

// Formulas exactly as implemented in code. Keep in sync when logic changes.
// Sources: lib/sheets.ts (computeRecord, parseMonthData), lib/summary.ts,
// toWeeklyRecord in all-employees / team-view, analytics / employee-profile pages.
type Formula = [metric: string, formula: string];

const FORMULA_SECTIONS: { title: string; note?: string; items: Formula[] }[] = [
  {
    title: "Base (monthly record — used by All Employees, Analytics, Employee Profile, Team View)",
    items: [
      ["Present (credit)", "P + WFH + 0.5 × HD"],
      ["Working Days", "Days in sheet − company WO days (≥50% employees WO) − NHD days − employee's IN days on working days"],
      ["Absent", "Working Days − (all leaves + WFH + NHD + HD + P) — so A, blank and unrecognised marks on working days count; blank days after today don't"],
      ["Absent %", "[Working Days − (all leaves + WFH + NHD + HD + P)] ÷ Working Days × 100"],
      ["Attendance %", "(P + WFH + 0.5 × HD) ÷ Working Days × 100"],
      ["WFH %", "WFH ÷ Working Days × 100"],
      ["Total Hours", "Sum of clocked hours; if none, Present credit × 9"],
      ["Hours %", "Total Hours ÷ ((P + WFH + HD + A + leaves) × 9) × 100"],
      ["Colour", "≥ 90% green · ≥ 75% amber · < 75% red"],
    ],
  },
  {
    title: "Weekly mode (All Employees, Team View)",
    items: [
      ["Working Days", "P + WFH + HD + A + leaves in that week (WO, NHD, IN, blank skipped)"],
      ["Attendance %", "(P + WFH + 0.5 × HD) ÷ week Working Days × 100"],
      ["WFH %", "WFH ÷ week Working Days × 100"],
      ["Absent", "week Working Days − (all leaves + WFH + NHD + HD + P)"],
      ["Absent %", "Absent ÷ week Working Days × 100"],
      ["Total Hours", "Present credit × 9"],
    ],
  },
  {
    title: "All Employees",
    items: [
      ["Avg Attendance", "Σ employee Attendance % ÷ employee count"],
      ["Working Days", "First employee's Working Days"],
      ["Below 75%", "Count of employees with Attendance % < 75"],
    ],
  },
  {
    title: "Analytics",
    items: [
      ["Company Avg Attendance", "Σ employee Attendance % ÷ employee count"],
      ["Total Present Days", "Σ Present credit"],
      ["Total Absent Days", "Σ employee Absent"],
      ["Avg Absent %", "Σ employee Absent % ÷ employee count"],
      ["Total Working Hours", "Σ Total Hours"],
      ["Avg Hours %", "Σ Hours % ÷ employee count"],
      ["Perfect Attendance", "Employees with A + leaves = 0 and HD = 0"],
      ["Leaderboard", "Top / bottom 5 by Attendance %"],
      ["Team Present / WFH %", "Avg of members' Attendance % / WFH %"],
      ["Team Absent %", "Avg of members' Absent %"],
      ["WFH / Absence leaders", "Top 5 by WFH count / Absent count"],
      ["Heatmap (team × week)", "A count ÷ working-day entries (WO, NHD, IN, blank skipped)"],
      ["Daily Trend %", "(P + WFH + 0.5 × HD) ÷ employees working that day × 100"],
      ["Best / Worst team", "Highest / lowest team avg Attendance %"],
    ],
  },
  {
    title: "Employee Profile",
    items: [
      ["Attendance / WFH / Hours ring", "Base Attendance %, WFH %, Hours %"],
      ["Present", "Present credit ÷ Working Days"],
      ["Weekly bar %", "(P + WFH + 0.5 × HD) ÷ week working entries × 100 (rounded)"],
      ["Daily chart", "P / WFH = 100 · HD = 50 · others = 0 (WO, NHD, blank hidden)"],
    ],
  },
  {
    title: "Employee Summary (Single / Team / Master, date range)",
    note: "Calculated from the selected date range only; blank and future days are not counted.",
    items: [
      ["Working Days", "P + WFH + HD + A + leaves (WO, NHD, IN, blank excluded)"],
      ["Absent", "Working Days − (all leaves + WFH + NHD + HD + P) (NHD already outside Working Days)"],
      ["Absent %", "Absent ÷ Working Days × 100"],
      ["Attendance %", "(P + WFH + 0.5 × HD) ÷ Working Days × 100"],
      ["WFH %", "WFH ÷ Working Days × 100"],
      ["Total Hours", "Σ Total WK hours on P / WFH / HD days"],
      ["Avg Hours / Day", "Total Hours ÷ days with hours"],
      ["Avg Clock-In / Out", "Mean of clock-in / clock-out times"],
      ["Late Arrival", "Clock-in after 10:00"],
      ["Early Departure", "Clock-out before 19:00"],
      ["Punctuality %", "(Clock-ins − Late) ÷ Clock-ins × 100"],
      ["Overtime", "Σ max(0, day hours − 9h)"],
      ["Team / Master totals", "All members' days added, then same formulas"],
    ],
  },
  {
    title: "Team View",
    items: [
      ["Avg Attendance %", "Σ member Attendance % ÷ member count"],
      ["Working Days", "First member's Working Days"],
      ["Total Absent Days", "Σ member Absent"],
      ["Avg Absent %", "Σ member Absent % ÷ member count"],
      ["Sparkline (daily)", "(P + WFH + 0.5 × HD) ÷ members working that day × 100"],
    ],
  },
];

export default function AnnotationPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[#F5F5F5]">Annotation</h1>
        <p className="text-sm text-[#888888] mt-1">
          Full form of every short code used across the attendance sheet.
        </p>
      </div>

      {CATEGORY_ORDER.map(category => {
        const items = SYMBOL_LIST.filter(m => m.category === category);
        if (!items.length) return null;
        return (
          <div
            key={category}
            className="rounded-xl p-5"
            style={{ background: "#181818", border: "1px solid rgba(255,77,0,0.15)" }}
          >
            <p className="text-sm font-medium text-[#888888] mb-4">{CATEGORY_LABELS[category]}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map(m => (
                <div
                  key={m.code}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg"
                  style={{ background: "#222222", border: `1px solid ${m.color}33` }}
                >
                  <span
                    className="flex-shrink-0 inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
                    style={{ background: m.bg, color: m.color }}
                  >
                    {m.code}
                  </span>
                  <span className="text-sm text-[#F5F5F5]">{m.fullName}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div>
        <h2 className="text-lg font-semibold text-[#F5F5F5]">Formulas</h2>
        <p className="text-sm text-[#888888] mt-1">How every number in the dashboard is calculated.</p>
      </div>

      {FORMULA_SECTIONS.map(section => (
        <div
          key={section.title}
          className="rounded-xl p-5"
          style={{ background: "#181818", border: "1px solid rgba(255,77,0,0.15)" }}
        >
          <p className="text-sm font-medium text-[#F5F5F5]">{section.title}</p>
          {section.note && <p className="text-xs text-[#888888] mt-1">{section.note}</p>}
          <div className="mt-4 divide-y divide-[#2a2a2a]">
            {section.items.map(([metric, formula]) => (
              <div key={metric} className="grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-1 sm:gap-4 py-2">
                <span className="text-sm font-medium text-[#FF7A35]">{metric}</span>
                <span className="text-sm text-[#cccccc] font-mono">{formula}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
