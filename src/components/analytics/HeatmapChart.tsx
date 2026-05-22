"use client";

import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";

export interface HeatmapCell {
  team: string;
  week: number;    // 1-based
  rate: number;    // 0–1 absence rate
}

interface Props {
  cells: HeatmapCell[];
  teams: string[];
  weekCount: number;
  isLoading?: boolean;
}

function rateToColor(rate: number): string {
  const r = Math.min(1, Math.max(0, rate));
  if (r === 0) return "rgba(255,255,255,0.04)";
  return `rgba(239,68,68,${0.12 + r * 0.76})`;
}

function rateLabel(rate: number): string {
  if (rate === 0) return "0%";
  return `${Math.round(rate * 100)}%`;
}

export function HeatmapChart({ cells, teams, weekCount, isLoading }: Props) {
  if (isLoading) {
    return <Skeleton className="h-40 rounded-lg bg-[#22222F]" />;
  }
  if (!teams.length) {
    return <p className="text-sm text-[#555] py-4 text-center">No data</p>;
  }

  const weeks = Array.from({ length: weekCount }, (_, i) => i + 1);

  function getCell(team: string, week: number) {
    return cells.find(c => c.team === team && c.week === week);
  }

  return (
    <div>
      {/* Column headers */}
      <div
        className="grid text-[10px] text-[#8B8A9B] mb-1"
        style={{ gridTemplateColumns: `110px repeat(${weekCount}, 1fr)` }}
      >
        <div />
        {weeks.map(w => (
          <div key={w} className="text-center">W{w}</div>
        ))}
      </div>

      {/* Rows */}
      <div className="space-y-1">
        {teams.map((team, ti) => (
          <motion.div
            key={team}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: ti * 0.05, duration: 0.25 }}
            className="grid items-center"
            style={{ gridTemplateColumns: `110px repeat(${weekCount}, 1fr)` }}
          >
            {/* Team label */}
            <span className="text-[11px] text-[#8B8A9B] truncate pr-2">{team}</span>

            {/* Week cells */}
            {weeks.map(w => {
              const cell = getCell(team, w);
              const rate = cell?.rate ?? 0;
              return (
                <div
                  key={w}
                  title={`${team} W${w}: ${rateLabel(rate)} absence`}
                  className="mx-0.5 h-7 rounded flex items-center justify-center text-[10px] font-medium transition-colors"
                  style={{
                    background: rateToColor(rate),
                    color: rate > 0.4 ? "#fca5a5" : "#888",
                  }}
                >
                  {rate > 0 ? rateLabel(rate) : ""}
                </div>
              );
            })}
          </motion.div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 mt-4">
        <span className="text-[10px] text-[#555]">Absence rate:</span>
        <div className="flex gap-1">
          {[0, 0.25, 0.5, 0.75, 1].map(v => (
            <div
              key={v}
              className="w-6 h-3 rounded-sm"
              style={{ background: rateToColor(v) }}
              title={`${Math.round(v * 100)}%`}
            />
          ))}
        </div>
        <span className="text-[10px] text-[#555]">Low → High</span>
      </div>
    </div>
  );
}
