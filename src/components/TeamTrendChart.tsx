"use client";

import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Tooltip, Legend,
} from "recharts";
import type { EmployeeMonthRecord, WeekRange } from "@/types/attendance";

// Consistent palette for multi-team lines
const TEAM_COLORS = [
  "#FF4D00","#FF7A35","#06b6d4","#10b981",
  "#f59e0b","#ef4444","#8b5cf6","#f97316",
];

interface Props {
  records: EmployeeMonthRecord[];
  weekRanges: WeekRange[];
  selectedTeam: string;   // "" = All Teams
  allTeams: string[];
}

function weekAvg(recs: EmployeeMonthRecord[], wr: WeekRange): number {
  let total = 0, count = 0;
  for (const r of recs) {
    for (const h of wr.columnHeaders) {
      const day = r.days.find(d => d.date === h);
      if (!day || day.symbol === "WO" || day.symbol === "NHD" || day.symbol === "") continue;
      count++;
      if (day.symbol === "P" || day.symbol === "WFH") total += 1;
      else if (day.symbol === "HD") total += 0.5;
    }
  }
  return count > 0 ? Math.round((total / count) * 100) : 0;
}

export function TeamTrendChart({ records, weekRanges, selectedTeam, allTeams }: Props) {
  if (weekRanges.length === 0) return null;

  // ── Single team → AreaChart ───────────────────────────────────────────────
  if (selectedTeam !== "") {
    const data = weekRanges.map(wr => ({
      week: `W${wr.weekNumber}`,
      percent: weekAvg(records, wr),
    }));

    return (
      <div className="relative">
        <svg width={0} height={0} style={{ position: "absolute" }}>
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#FF4D00" stopOpacity={0.28} />
              <stop offset="95%" stopColor="#FF4D00" stopOpacity={0.02} />
            </linearGradient>
          </defs>
        </svg>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
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
            <Tooltip
              contentStyle={{
                background: "#222222",
                border: "1px solid rgba(255,77,0,0.3)",
                borderRadius: 8,
                color: "#F5F5F5",
                fontSize: 12,
              }}
              formatter={(v) => [`${v}%`, "Avg Attendance"]}
            />
            <Area
              type="monotone"
              dataKey="percent"
              stroke="#FF4D00"
              strokeWidth={2}
              fill="url(#trendFill)"
              dot={{ fill: "#FF4D00", r: 4, strokeWidth: 0 }}
              activeDot={{ r: 6, fill: "#FF4D00", strokeWidth: 0 }}
              isAnimationActive
              animationDuration={700}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // ── All Teams → multi-line LineChart ──────────────────────────────────────
  const data = weekRanges.map(wr => {
    const entry: Record<string, string | number> = { week: `W${wr.weekNumber}` };
    for (const team of allTeams) {
      const teamRecs = records.filter(r => r.team === team);
      entry[team] = weekAvg(teamRecs, wr);
    }
    return entry;
  });

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
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
        <Tooltip
          contentStyle={{
            background: "#222222",
            border: "1px solid rgba(255,77,0,0.3)",
            borderRadius: 8,
            color: "#F5F5F5",
            fontSize: 12,
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, color: "#888888", paddingTop: 8 }}
        />
        {allTeams.map((team, i) => (
          <Line
            key={team}
            type="monotone"
            dataKey={team}
            stroke={TEAM_COLORS[i % TEAM_COLORS.length]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5, strokeWidth: 0 }}
            isAnimationActive
            animationDuration={700}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
