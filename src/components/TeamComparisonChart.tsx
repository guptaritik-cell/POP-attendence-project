"use client";

import {
  BarChart, Bar, XAxis, YAxis, Cell, LabelList,
  ResponsiveContainer, Tooltip,
} from "recharts";
import type { EmployeeMonthRecord } from "@/types/attendance";

interface Props {
  records: EmployeeMonthRecord[];
}

export function TeamComparisonChart({ records }: Props) {
  // Group by team → avg attendance
  const teamMap = new Map<string, number[]>();
  for (const r of records) {
    if (!teamMap.has(r.team)) teamMap.set(r.team, []);
    teamMap.get(r.team)!.push(r.attendancePercent);
  }

  const data = Array.from(teamMap.entries())
    .map(([team, pcts]) => ({
      team,
      percent: Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length),
    }))
    .sort((a, b) => b.percent - a.percent);

  const barColor = (pct: number) =>
    pct >= 90 ? "#4ade80" : pct >= 75 ? "#fbbf24" : "#f87171";

  return (
    <div className="relative">
      {/* Hidden SVG to define gradient usable inside Recharts SVG */}
      <svg width={0} height={0} style={{ position: "absolute" }}>
        <defs>
          <linearGradient id="teamBarGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#FF4D00" />
            <stop offset="100%" stopColor="#FF7A35" />
          </linearGradient>
        </defs>
      </svg>

      <ResponsiveContainer width="100%" height={data.length * 44 + 24}>
        <BarChart
          data={data}
          layout="vertical"
          barSize={20}
          margin={{ left: 8, right: 56, top: 4, bottom: 4 }}
        >
          <XAxis
            type="number"
            domain={[0, 100]}
            tick={{ fill: "#888888", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={v => `${v}%`}
          />
          <YAxis
            type="category"
            dataKey="team"
            tick={{ fill: "#D4D4D4", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={96}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,77,0,0.06)" }}
            contentStyle={{
              background: "#222222",
              border: "1px solid rgba(255,77,0,0.3)",
              borderRadius: 8,
              color: "#F5F5F5",
              fontSize: 12,
            }}
            formatter={(v) => [`${v}%`, "Avg Attendance"]}
          />
          <Bar
            dataKey="percent"
            radius={[0, 4, 4, 0]}
            background={{ fill: "rgba(255,77,0,0.06)", radius: 4 }}
            isAnimationActive
            animationDuration={800}
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={barColor(entry.percent)} />
            ))}
            <LabelList
              dataKey="percent"
              position="right"
              formatter={(v: unknown) => `${v}%`}
              style={{ fill: "#888888", fontSize: 11 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
