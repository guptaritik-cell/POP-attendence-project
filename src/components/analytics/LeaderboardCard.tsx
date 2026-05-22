"use client";

import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import type { EmployeeMonthRecord } from "@/types/attendance";

// Per-team avatar colors
const TEAM_COLORS: Record<string, string> = {
  "Founder":      "#7C3AED",
  "Credit Card":  "#EC4899",
  "Marketplace":  "#06b6d4",
  "Design":       "#f59e0b",
  "Analytics":    "#10b981",
  "HR":           "#ef4444",
  "CX":           "#8b5cf6",
  "Finance":      "#f97316",
};
const DEFAULT_COLOR = "#7C3AED";

const RANK_STYLES = [
  { bg: "linear-gradient(135deg,#F59E0B,#D97706)", color: "#fff" },  // 1st — gold
  { bg: "linear-gradient(135deg,#9CA3AF,#6B7280)", color: "#fff" },  // 2nd — silver
  { bg: "linear-gradient(135deg,#D97706,#92400E)", color: "#fff" },  // 3rd — bronze
  { bg: "rgba(124,58,237,0.3)",                    color: "#a78bfa" }, // 4th
  { bg: "rgba(124,58,237,0.3)",                    color: "#a78bfa" }, // 5th
];

interface LeaderboardCardProps {
  title: string;
  records: EmployeeMonthRecord[];  // already sorted, max 5
  type: "top" | "bottom";
  isLoading?: boolean;
}

export function LeaderboardCard({ title, records, type, isLoading }: LeaderboardCardProps) {
  const barColor   = type === "top" ? "#7C3AED" : "#ef4444";
  const valueColor = type === "top" ? "#a78bfa"  : "#f87171";

  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-4"
      style={{ background: "#1A1A24", border: "1px solid rgba(124,58,237,0.15)" }}
    >
      <p className="text-base font-medium text-[#F1F0F5]">{title}</p>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 rounded-lg bg-[#22222F]" />
          ))}
        </div>
      ) : records.length === 0 ? (
        <p className="text-sm text-[#555] py-4 text-center">No data</p>
      ) : (
        <div className="space-y-3">
          {records.map((r, i) => {
            const rank = i + 1;
            const rs = RANK_STYLES[i] ?? RANK_STYLES[4];
            const teamColor = TEAM_COLORS[r.team] ?? DEFAULT_COLOR;
            const initials  = r.name.split(" ").slice(0, 2).map(p => p[0]).join("");
            const pct       = r.attendancePercent;

            return (
              <motion.div
                key={r.employeeId}
                initial={{ opacity: 0, x: type === "top" ? -12 : 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  delay: i * 0.07,
                  duration: 0.28,
                  ease: [0.4, 0, 0.2, 1] as const,
                }}
                className="flex items-center gap-3"
              >
                {/* Rank badge */}
                <div
                  className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
                  style={{ background: rs.bg, color: rs.color }}
                >
                  {rank}
                </div>

                {/* Avatar */}
                <div
                  className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                  style={{ background: teamColor }}
                >
                  {initials}
                </div>

                {/* Name + team + bar */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-[#F1F0F5] truncate max-w-[110px]">
                      {r.name}
                    </span>
                    <span className="text-xs font-semibold ml-2" style={{ color: valueColor }}>
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                  <div
                    className="h-1 rounded-full overflow-hidden"
                    style={{ background: "rgba(255,255,255,0.06)" }}
                  >
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ delay: i * 0.07 + 0.15, duration: 0.5, ease: [0.4, 0, 0.2, 1] as const }}
                      className="h-full rounded-full"
                      style={{ background: barColor }}
                    />
                  </div>
                  <span className="text-[10px] text-[#555]">{r.team}</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
