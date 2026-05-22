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
  background: "#22222F",
  border: "1px solid rgba(124,58,237,0.3)",
  borderRadius: 8,
  color: "#F1F0F5",
  fontSize: 12,
};

export function TeamBarChart({ data, isLoading }: Props) {
  if (isLoading) {
    return <Skeleton className="h-64 rounded-lg bg-[#22222F]" />;
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
          tick={{ fill: "#8B8A9B", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fill: "#8B8A9B", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={v => `${v}%`}
          width={36}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          cursor={{ fill: "rgba(124,58,237,0.06)" }}
          formatter={(v: unknown, name: unknown) => [
            `${(v as number).toFixed(1)}%`,
            String(name),
          ]}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, color: "#8B8A9B", paddingTop: 12 }}
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
          fill="#7C3AED"
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
