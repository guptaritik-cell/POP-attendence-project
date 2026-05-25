"use client";

import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

export interface PieDatum {
  name: string;
  value: number;
  color: string;
}

interface Props {
  data: PieDatum[];
  total: number;
  isLoading?: boolean;
}

const TOOLTIP_STYLE = {
  background: "#222222",
  border: "1px solid rgba(255,77,0,0.3)",
  borderRadius: 8,
  color: "#F5F5F5",
  fontSize: 12,
};

// Center label rendered via a custom active shape or absolute positioned div
const CenterLabel = ({ total }: { total: number }) => (
  <div
    className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
    style={{ top: 0 }}
  >
    <span className="text-xl font-bold text-[#F5F5F5]">{total}</span>
    <span className="text-[10px] text-[#888888]">Employees</span>
  </div>
);

export function TeamPieChart({ data, total, isLoading }: Props) {
  if (isLoading) {
    return <Skeleton className="h-64 rounded-lg bg-[#222222]" />;
  }
  if (!data.length) {
    return <p className="text-sm text-[#555] py-8 text-center">No data</p>;
  }

  return (
    <div className="flex items-center gap-8">
      {/* Donut chart */}
      <div className="relative flex-shrink-0" style={{ width: 200, height: 200 }}>
        <CenterLabel total={total} />
        <ResponsiveContainer width={200} height={200}>
          <PieChart>
            <Pie
              data={data}
              cx={95}
              cy={95}
              innerRadius={58}
              outerRadius={90}
              paddingAngle={2}
              dataKey="value"
              isAnimationActive
              animationDuration={800}
              animationBegin={0}
            >
              {data.map((d, i) => (
                <Cell key={i} fill={d.color} stroke="transparent" />
              ))}
            </Pie>
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v: unknown, name: unknown) => [
                `${v} members`,
                String(name),
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-col gap-2 min-w-0">
        {data.map(d => (
          <div key={d.name} className="flex items-center gap-2">
            <div
              className="flex-shrink-0 w-2.5 h-2.5 rounded-full"
              style={{ background: d.color }}
            />
            <span className="text-xs text-[#D4D4D4] min-w-[90px]">{d.name}</span>
            <span
              className="text-xs font-semibold ml-auto"
              style={{ color: d.color }}
            >
              {d.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
