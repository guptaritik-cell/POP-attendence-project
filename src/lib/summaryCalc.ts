// "How it's calculated" rows for summary downloads: each metric with its
// formula, the formula filled in with the actual numbers, and the result.

export interface CalcSummary {
  present: number;
  wfh: number;
  absent: number;
  halfDay: number;
  leaves: { total: number };
  weekOff: number;
  holiday: number;
  workingDays: number;
  attendancePercent: number;
  wfhPercent: number;
}

export interface CalcTime {
  totalHours: string;
  totalMinutes: number;
  avgHoursPerDay: string;
  lateArrivals: number;
  earlyDepartures: number;
  overtimeHours: string;
  punctualityPercent: number;
  daysWithData: number;
}

export type CalcRow = [metric: string, formula: string, calculation: string, result: string];

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 1000) / 10}%` : "0%");

export function calculationRows(s: CalcSummary, t: CalcTime | null): CalcRow[] {
  const wd = s.workingDays;
  const credit = s.present + s.wfh + s.halfDay * 0.5;
  const rows: CalcRow[] = [
    [
      "Working Days",
      "Present + WFH + Half Days + Absent + Leaves  (week offs, holidays, inactive and blank days are not counted)",
      `${s.present} + ${s.wfh} + ${s.halfDay} + ${s.absent} + ${s.leaves.total}`,
      String(wd),
    ],
    [
      "Attended Days",
      "Present + WFH + 0.5 × Half Days",
      `${s.present} + ${s.wfh} + 0.5 × ${s.halfDay}`,
      String(credit),
    ],
    [
      "Attendance %",
      "(Present + WFH + 0.5 × Half Days) ÷ Working Days × 100",
      `${credit} ÷ ${wd} × 100`,
      `${s.attendancePercent}%`,
    ],
    [
      "WFH %",
      "WFH ÷ Working Days × 100",
      `${s.wfh} ÷ ${wd} × 100`,
      `${s.wfhPercent}%`,
    ],
    [
      "Absent %",
      "Absent ÷ Working Days × 100",
      `${s.absent} ÷ ${wd} × 100`,
      pct(s.absent, wd),
    ],
    [
      "Leave %",
      "Leaves ÷ Working Days × 100",
      `${s.leaves.total} ÷ ${wd} × 100`,
      pct(s.leaves.total, wd),
    ],
  ];

  if (t) {
    const onTime = Math.max(0, t.daysWithData - t.lateArrivals);
    rows.push(
      [
        "Total Hours",
        "Sum of Total WK hours on Present / WFH / Half Day days",
        `sum over ${t.daysWithData} clocked day(s)`,
        t.totalHours,
      ],
      [
        "Avg Hours / Day",
        "Total Hours ÷ days with clock data",
        `${t.totalHours} ÷ ${t.daysWithData}`,
        t.avgHoursPerDay,
      ],
      [
        "Late Arrivals",
        "Clocked days with Clock In after 10:00",
        `count of clock-ins after 10:00`,
        String(t.lateArrivals),
      ],
      [
        "Early Departures",
        "Clocked days with Clock Out before 19:00",
        `count of clock-outs before 19:00`,
        String(t.earlyDepartures),
      ],
      [
        "Punctuality %",
        "(Clocked days − Late Arrivals) ÷ Clocked days × 100",
        `(${t.daysWithData} − ${t.lateArrivals}) ÷ ${t.daysWithData} × 100 = ${onTime} ÷ ${t.daysWithData} × 100`,
        `${t.punctualityPercent}%`,
      ],
      [
        "Overtime",
        "Sum of time worked beyond 9h on each clocked day",
        "Σ max(0, day hours − 9h)",
        t.overtimeHours,
      ],
    );
  }
  return rows;
}
