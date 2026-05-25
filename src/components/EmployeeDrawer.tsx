"use client";

import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer,
  Tooltip as RechartTooltip, Cell,
} from "recharts";
import type { EmployeeMonthRecord, WeekRange } from "@/types/attendance";

// ── Circular SVG progress ring ───────────────────────────────────────────────
function RingProgress({
  value, label, color,
}: { value: number; label: string; color: string }) {
  const R   = 28;
  const circ = 2 * Math.PI * R;
  const pct  = Math.min(Math.max(value, 0), 100);
  const off  = circ - (pct / 100) * circ;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-16 h-16">
        <svg width={64} height={64} viewBox="0 0 64 64">
          <circle cx={32} cy={32} r={R} fill="none" stroke="#222222" strokeWidth={5} />
          <circle
            cx={32} cy={32} r={R} fill="none"
            stroke={color} strokeWidth={5}
            strokeDasharray={circ} strokeDashoffset={off}
            strokeLinecap="round"
            transform="rotate(-90 32 32)"
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[11px] font-bold text-[#F5F5F5]">
            {pct.toFixed(0)}%
          </span>
        </div>
      </div>
      <span className="text-[10px] text-[#888888]">{label}</span>
    </div>
  );
}

// ── Compute week-by-week attendance % ───────────────────────────────────────
function weeklyChartData(record: EmployeeMonthRecord, weekRanges: WeekRange[]) {
  return weekRanges.map(wr => {
    const days = record.days.filter(d => wr.columnHeaders.includes(d.date));
    let workingDays = 0, present = 0;
    for (const d of days) {
      if (d.symbol === "WO" || d.symbol === "NHD" || d.symbol === "") continue;
      workingDays++;
      if      (d.symbol === "P")   present += 1;
      else if (d.symbol === "WFH") present += 1;
      else if (d.symbol === "HD")  present += 0.5;
    }
    return {
      week: `W${wr.weekNumber}`,
      percent: workingDays > 0 ? Math.round((present / workingDays) * 100) : 0,
    };
  });
}

// ── Stat pill ────────────────────────────────────────────────────────────────
function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-0.5 px-3 py-2 rounded-lg" style={{ background: "#222222" }}>
      <span className="text-[10px] text-[#888888]">{label}</span>
      <span className="text-sm font-semibold text-[#F5F5F5]">{value}</span>
    </div>
  );
}

// ── Main drawer ──────────────────────────────────────────────────────────────
interface EmployeeDrawerProps {
  record: EmployeeMonthRecord | null;
  weekRanges: WeekRange[];
  onClose: () => void;
}

export function EmployeeDrawer({ record, weekRanges, onClose }: EmployeeDrawerProps) {
  const chartData = record ? weeklyChartData(record, weekRanges) : [];

  return (
    <Sheet open={!!record} onOpenChange={open => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-[480px] border-l border-[rgba(255,77,0,0.2)] p-0 overflow-y-auto"
        style={{ background: "#181818" }}
      >
        {record && (
          <>
            {/* Header */}
            <SheetHeader className="px-6 pt-6 pb-4">
              <div className="flex items-center gap-4">
                {/* Avatar */}
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-base flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, #FF4D00, #FF7A35)" }}
                >
                  {record.name.split(" ").slice(0, 2).map(p => p[0]).join("")}
                </div>
                <div className="min-w-0">
                  <SheetTitle className="text-base font-semibold text-[#F5F5F5] leading-tight">
                    {record.name}
                  </SheetTitle>
                  <p className="text-xs text-[#888888] mt-0.5">{record.employeeId}</p>
                </div>
              </div>
            </SheetHeader>

            <Separator style={{ background: "rgba(255,77,0,0.15)" }} />

            <div className="px-6 py-5 space-y-6">
              {/* Details */}
              <div className="grid grid-cols-2 gap-3">
                <StatPill label="Team"         value={record.team} />
                <StatPill label="BU Lead"      value={record.buLead} />
                <StatPill label="Working Days" value={record.workingDays} />
                <StatPill label="Absent Days"  value={record.totalAbsent} />
              </div>

              <Separator style={{ background: "rgba(255,77,0,0.15)" }} />

              {/* Circular progress rings */}
              <div>
                <p className="text-xs font-medium text-[#888888] mb-4">Attendance Overview</p>
                <div className="flex items-center justify-around">
                  <RingProgress
                    value={record.attendancePercent}
                    label="Attendance"
                    color="#FF4D00"
                  />
                  <RingProgress
                    value={record.wfhPercent}
                    label="WFH"
                    color="#FF7A35"
                  />
                  <RingProgress
                    value={record.hoursPercent}
                    label="Hours"
                    color="#06b6d4"
                  />
                </div>
              </div>

              <Separator style={{ background: "rgba(255,77,0,0.15)" }} />

              {/* Quick stats row */}
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: "Present",    value: record.totalPresent },
                  { label: "WFH Days",  value: record.totalWFH },
                  { label: "Total Hrs", value: record.totalHours },
                ].map(s => (
                  <div key={s.label} className="rounded-lg py-2" style={{ background: "#222222" }}>
                    <p className="text-base font-bold text-[#F5F5F5]">{s.value}</p>
                    <p className="text-[10px] text-[#888888]">{s.label}</p>
                  </div>
                ))}
              </div>

              <Separator style={{ background: "rgba(255,77,0,0.15)" }} />

              {/* Weekly bar chart */}
              <div>
                <p className="text-xs font-medium text-[#888888] mb-3">Week-by-Week Attendance</p>
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={chartData} barSize={24}>
                    <XAxis
                      dataKey="week"
                      tick={{ fill: "#888888", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fill: "#888888", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={v => `${v}%`}
                      width={36}
                    />
                    <RechartTooltip
                      contentStyle={{
                        background: "#222222",
                        border: "1px solid rgba(255,77,0,0.3)",
                        borderRadius: 8,
                        color: "#F5F5F5",
                        fontSize: 12,
                      }}
                      formatter={(v) => [`${v}%`, "Attendance"]}
                    />
                    <Bar dataKey="percent" radius={[4, 4, 0, 0]}>
                      {chartData.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={
                            entry.percent >= 90
                              ? "#FF4D00"
                              : entry.percent >= 75
                              ? "#d97706"
                              : "#ef4444"
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
