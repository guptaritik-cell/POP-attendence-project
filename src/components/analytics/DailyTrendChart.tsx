"use client";

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

export interface DailyTrendPoint {
  day: number;
  label: string;   // "1 Sat", "2 Sun", etc.
  value: number | null;  // null for WO/NHD
}

interface Props {
  data: DailyTrendPoint[];
  isLoading?: boolean;
}

const TOOLTIP_STYLE = {
  background: "#22222F",
  border: "1px solid rgba(124,58,237,0.3)",
  borderRadius: 8,
  color: "#F1F0F5",
  fontSize: 12,
};

// Custom dot: only render on non-null values
const CustomDot = (props: Record<string, unknown>) => {
  const { cx, cy, payload } = props as { cx: number; cy: number; payload: DailyTrendPoint };
  if (payload.value === null) return null;
  return <circle cx={cx} cy={cy} r={3} fill="#7C3AED" strokeWidth={0} />;
};

export function DailyTrendChart({ data, isLoading }: Props) {
  if (isLoading) {
    return <Skeleton className="h-52 rounded-lg bg-[#22222F]" />;
  }

  return (
    <div className="relative">
      {/* Define area gradient in hidden SVG (type-safe approach) */}
      <svg width={0} height={0} style={{ position: "absolute" }}>
        <defs>
          <linearGradient id="dailyAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#7C3AED" stopOpacity={0.32} />
            <stop offset="95%" stopColor="#7C3AED" stopOpacity={0.01} />
          </linearGradient>
        </defs>
      </svg>

      <ResponsiveContainer width="100%" height={220}>
        <AreaChart
          data={data}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        >
          <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "#8B8A9B", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval={1}
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
            formatter={(v: unknown) => [
              v === null ? "—" : `${(v as number).toFixed(1)}%`,
              "Present",
            ]}
            labelFormatter={label => `Day ${label}`}
          />
          {/* 80% target line */}
          <ReferenceLine
            y={80}
            stroke="#f59e0b"
            strokeDasharray="4 3"
            strokeWidth={1.5}
            label={{
              value: "Target 80%",
              position: "insideTopRight",
              fill: "#f59e0b",
              fontSize: 10,
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#7C3AED"
            strokeWidth={2}
            fill="url(#dailyAreaGrad)"
            connectNulls={false}
            dot={<CustomDot />}
            activeDot={{ r: 6, fill: "#7C3AED", strokeWidth: 0 }}
            isAnimationActive
            animationDuration={900}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
