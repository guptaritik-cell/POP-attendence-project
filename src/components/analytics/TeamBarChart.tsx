"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Legend, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

export interface TeamBarDatum {
  team: string;
  present: number;   // avg attendance % (incl WFH)
  wfh: number;       // avg WFH %
  absent: number;    // avg absence %
}

interface Props {
  data: TeamBarDatum[];
  isLoading?: boolean;
}

const TOOLTIP_STYLE = {
  background: "#222222",
  border: "1px solid rgba(255,77,0,0.3)",
  borderRadius: 8,
  color: "#F5F5F5",
  fontSize: 12,
};

export function TeamBarChart({ data, isLoading }: Props) {
  if (isLoading) {
    return <Skeleton className="h-64 rounded-lg bg-[#222222]" />;
  }
  if (!data.length) {
    return <p className="text-sm text-[#555] py-8 text-center">No data</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart
        data={data}
        barGap={2}
        barCategoryGap="28%"
        margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
      >
        <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis
          dataKey="team"
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
          contentStyle={TOOLTIP_STYLE}
          cursor={{ fill: "rgba(255,77,0,0.06)" }}
          formatter={(v: unknown, name: unknown) => [
            `${(v as number).toFixed(1)}%`,
            String(name),
          ]}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, color: "#888888", paddingTop: 12 }}
        />
        <Bar
          dataKey="present"
          name="Attendance %"
          fill="#22c55e"
          radius={[3, 3, 0, 0]}
          isAnimationActive
          animationDuration={800}
        />
        <Bar
          dataKey="wfh"
          name="WFH %"
          fill="#FF4D00"
          radius={[3, 3, 0, 0]}
          isAnimationActive
          animationDuration={800}
          animationBegin={100}
        />
        <Bar
          dataKey="absent"
          name="Absence %"
          fill="#ef4444"
          radius={[3, 3, 0, 0]}
          isAnimationActive
          animationDuration={800}
          animationBegin={200}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
