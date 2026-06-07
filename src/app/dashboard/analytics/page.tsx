"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp, CalendarDays, UserCheck, Clock, UserX, Star,
  ArrowUp, Trophy, AlertTriangle,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, LabelList,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { useAttendanceStore } from "@/lib/store";
import { getWeekRanges } from "@/lib/attendanceUtils";
import { FilterBar } from "@/components/FilterBar";
import { LeaderboardCard } from "@/components/analytics/LeaderboardCard";
import { TeamBarChart } from "@/components/analytics/TeamBarChart";
import type { TeamBarDatum } from "@/components/analytics/TeamBarChart";
import { DailyTrendChart } from "@/components/analytics/DailyTrendChart";
import type { DailyTrendPoint } from "@/components/analytics/DailyTrendChart";
import { HeatmapChart } from "@/components/analytics/HeatmapChart";
import type { HeatmapCell } from "@/components/analytics/HeatmapChart";
import { InsightCard } from "@/components/analytics/InsightCard";
import type { EmployeeMonthRecord } from "@/types/attendance";

// ── Constants ────────────────────────────────────────────────────────────────
const TEAM_COLORS: Record<string, string> = {
  "Founder":     "#FF4D00",
  "Credit Card": "#FF7A35",
  "Marketplace": "#06b6d4",
  "Design":      "#f59e0b",
  "Analytics":   "#10b981",
  "HR":          "#ef4444",
  "CX":          "#8b5cf6",
  "Finance":     "#f97316",
};
const TEAM_COLOR_LIST = [
  "#FF4D00","#FF7A35","#06b6d4","#f59e0b","#10b981","#ef4444","#8b5cf6","#f97316",
];

const TOOLTIP_STYLE = {
  background: "#222222",
  border: "1px solid rgba(255,77,0,0.3)",
  borderRadius: 8,
  color: "#F5F5F5",
  fontSize: 12,
};

// ── Stagger variants ─────────────────────────────────────────────────────────
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.4, 0, 0.2, 1] as const } },
};

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl p-5 ${className}`}
      style={{ background: "#181818", border: "1px solid rgba(255,77,0,0.2)" }}
    >
      <div className="mb-4">
        <p className="text-base font-medium text-[#F5F5F5]">{title}</p>
        {subtitle && (
          <p className="text-xs text-[#888888] mt-0.5">{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Key metric stat card ──────────────────────────────────────────────────────
interface StatMeta {
  label: string;
  value: string;
  icon: React.ReactNode;
  iconBg: string;
  color?: string;
}

function MetricCard({ label, value, icon, iconBg, color }: StatMeta) {
  return (
    <motion.div
      variants={fadeUp}
      className="rounded-xl p-5 flex items-center gap-4"
      style={{
        background: "#181818",
        border: "1px solid rgba(255,77,0,0.15)",
        height: 100,
      }}
    >
      <div
        className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
        style={{ background: iconBg }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[28px] font-semibold leading-none" style={{ color: color ?? "#F5F5F5" }}>
          {value}
        </p>
        <p className="text-[12px] text-[#888888] mt-1.5 leading-snug">{label}</p>
      </div>
    </motion.div>
  );
}

// ── WFH / Absence horizontal bar card ────────────────────────────────────────
function HorizBarCard({
  title,
  subtitle,
  data,
  dataKey,
  unit,
  barColor,
  isLoading,
}: {
  title: string;
  subtitle?: string;
  data: { name: string; value: number; id: string }[];
  dataKey: string;
  unit: string;
  barColor: string;
  isLoading?: boolean;
}) {
  return (
    <Section title={title} subtitle={subtitle}>
      {isLoading ? (
        <Skeleton className="h-52 rounded-lg bg-[#222222]" />
      ) : (
        <div className="relative">
          <svg width={0} height={0} style={{ position: "absolute" }}>
            <defs>
              <linearGradient id={`horizGrad-${dataKey}`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%"   stopColor={barColor} />
                <stop offset="100%" stopColor="#FF7A35" />
              </linearGradient>
            </defs>
          </svg>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={data}
              layout="vertical"
              barSize={18}
              margin={{ left: 0, right: 52, top: 4, bottom: 4 }}
            >
              <XAxis
                type="number"
                tick={{ fill: "#888888", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fill: "#D4D4D4", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={120}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                cursor={{ fill: "rgba(255,77,0,0.06)" }}
                formatter={(v: unknown) => [`${v} ${unit}`, title]}
              />
              <Bar
                dataKey="value"
                radius={[0, 4, 4, 0]}
                background={{ fill: "rgba(255,77,0,0.06)", radius: 4 }}
                isAnimationActive
                animationDuration={800}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={`url(#horizGrad-${dataKey})`} />
                ))}
                <LabelList
                  dataKey="value"
                  position="right"
                  formatter={(v: unknown) => `${v} ${unit}`}
                  style={{ fill: "#888888", fontSize: 11 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Section>
  );
}

// ── Main analytics page ───────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const { monthData, isLoading, viewMode, selectedWeek } = useAttendanceStore();
  const [localSearch, setLocalSearch] = useState("");
  const [showTopBtn, setShowTopBtn] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);

  // ── Back-to-top: listen on parent <main> scroll ───────────────────────────
  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    const onScroll = () => setShowTopBtn(main.scrollTop > 400);
    main.addEventListener("scroll", onScroll, { passive: true });
    return () => main.removeEventListener("scroll", onScroll);
  }, []);

  function scrollToTop() {
    document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ── Week ranges ───────────────────────────────────────────────────────────
  const weekRanges = useMemo(
    () => (monthData ? getWeekRanges(monthData.columnHeaders) : []),
    [monthData]
  );
  const activeWeekRange = useMemo(
    () => weekRanges.find(wr => wr.weekNumber === selectedWeek) ?? weekRanges[0],
    [weekRanges, selectedWeek]
  );

  // Records to analyse: apply weekly filter if in weekly mode
  const records = useMemo<EmployeeMonthRecord[]>(() => {
    if (!monthData) return [];
    return monthData.records;
  }, [monthData]);

  const allTeams = useMemo(() => [...new Set(records.map(r => r.team))].sort(), [records]);

  // ── Section 1: Key metrics ────────────────────────────────────────────────
  const metrics = useMemo((): StatMeta[] => {
    if (!records.length) return [];
    const n        = records.length;
    const avgAtt   = records.reduce((s, r) => s + r.attendancePercent, 0) / n;
    // All records carry the same company working days (computed from calendar in sheets.ts)
    const workDays = records[0]?.workingDays ?? 0;
    const totalP   = records.reduce((s, r) => s + r.totalPresent, 0);
    const totalA   = records.reduce((s, r) => s + r.totalAbsent, 0);
    // Perfect attendance: zero absences AND zero half-days
    const perfect  = records.filter(r => r.totalAbsent === 0 && r.totalHalfDay === 0).length;

    // Total working hours across all employees
    const rawHours = records.reduce((s, r) => s + r.totalHours, 0);
    // Average hours % — hoursPercent per record already uses the correct denominator
    // (A + P + WFH + HD) × 9, covering both current and completed months automatically
    const avgHoursPct = records.reduce((s, r) => s + r.hoursPercent, 0) / n;

    const attColor   = avgAtt    >= 90 ? "#4ade80" : avgAtt    >= 75 ? "#fbbf24" : "#f87171";
    const hoursColor = avgHoursPct >= 90 ? "#4ade80" : avgHoursPct >= 75 ? "#fbbf24" : "#f87171";

    return [
      {
        label: "Company-wide Avg Attendance",
        value: `${avgAtt.toFixed(1)}%`,
        icon: <TrendingUp size={18} className="text-white" />,
        iconBg: "linear-gradient(135deg,#FF4D00,#FF7A35)",
        color: attColor,
      },
      {
        label: "Working Days This Month",
        value: String(workDays),
        icon: <CalendarDays size={18} className="text-white" />,
        iconBg: "linear-gradient(135deg,#FF7A35,#fbbf24)",
      },
      {
        label: "Total Present Days (sum)",
        value: totalP.toFixed(0),
        icon: <UserCheck size={18} className="text-white" />,
        iconBg: "linear-gradient(135deg,#10b981,#34d399)",
        color: "#4ade80",
      },
      {
        label: "Total Working Hours",
        value: `${Math.round(rawHours).toLocaleString()}h`,
        icon: <Clock size={18} className="text-white" />,
        iconBg: "linear-gradient(135deg,#06b6d4,#0ea5e9)",
        color: hoursColor,
      },
      {
        label: "Total Absences",
        value: String(totalA),
        icon: <UserX size={18} className="text-white" />,
        iconBg: "linear-gradient(135deg,#ef4444,#dc2626)",
        color: totalA > 0 ? "#f87171" : "#4ade80",
      },
      {
        label: "Employees with Perfect Attendance",
        value: String(perfect),
        icon: <Star size={18} className="text-white" />,
        iconBg: "linear-gradient(135deg,#F59E0B,#f97316)",
        color: "#fbbf24",
      },
    ];
  }, [records]);

  // ── Section 2: Leaderboard ────────────────────────────────────────────────
  const { topPerformers, bottomPerformers } = useMemo(() => {
    const sorted = [...records].sort((a, b) => b.attendancePercent - a.attendancePercent);
    return {
      topPerformers:    sorted.slice(0, 5),
      bottomPerformers: [...sorted].reverse().slice(0, 5),
    };
  }, [records]);

  // ── Section 3: Team distribution ─────────────────────────────────────────
  const teamBarData = useMemo((): TeamBarDatum[] => {
    return allTeams.map(team => {
      const tr = records.filter(r => r.team === team);
      if (!tr.length) return { team, present: 0, wfh: 0, absent: 0 };
      const n       = tr.length;
      const present = tr.reduce((s, r) => s + r.attendancePercent, 0) / n;
      const wfh     = tr.reduce((s, r) => s + r.wfhPercent, 0) / n;
      const absent  = tr.reduce((s, r) => s + (r.totalAbsent / (r.workingDays || 1)) * 100, 0) / n;
      return {
        team,
        present: Math.round(present * 10) / 10,
        wfh:     Math.round(wfh * 10) / 10,
        absent:  Math.round(absent * 10) / 10,
      };
    });
  }, [records, allTeams]);

  // ── Section 4: WFH leaders ────────────────────────────────────────────────
  const wfhLeaders = useMemo(() => {
    return [...records]
      .sort((a, b) => b.totalWFH - a.totalWFH)
      .slice(0, 5)
      .map(r => ({ name: r.name, value: r.totalWFH, id: r.employeeId }));
  }, [records]);

  // ── Section 5: Absence analysis ───────────────────────────────────────────
  const absenceLeaders = useMemo(() => {
    return [...records]
      .sort((a, b) => b.totalAbsent - a.totalAbsent)
      .slice(0, 5)
      .map(r => ({ name: r.name, value: r.totalAbsent, id: r.employeeId }));
  }, [records]);

  const heatmapCells = useMemo((): HeatmapCell[] => {
    if (!weekRanges.length || !records.length) return [];
    const cells: HeatmapCell[] = [];
    for (const team of allTeams) {
      const tr = records.filter(r => r.team === team);
      for (const wr of weekRanges) {
        let absCount = 0, workCount = 0;
        for (const r of tr) {
          for (const h of wr.columnHeaders) {
            const day = r.days.find(d => d.date === h);
            if (!day || day.symbol === "WO" || day.symbol === "NHD" || day.symbol === "") continue;
            workCount++;
            if (day.symbol === "A") absCount++;
          }
        }
        cells.push({ team, week: wr.weekNumber, rate: workCount > 0 ? absCount / workCount : 0 });
      }
    }
    return cells;
  }, [records, allTeams, weekRanges]);

  // ── Section 6: Daily trend ────────────────────────────────────────────────
  const dailyTrendData = useMemo((): DailyTrendPoint[] => {
    if (!monthData || !records.length) return [];
    return monthData.columnHeaders.map((h, i) => {
      const dayNum = i + 1;
      let present = 0, workingCount = 0;

      for (const r of records) {
        const d = r.days.find(dd => dd.date === h);
        // Skip non-working days and missing entries
        if (!d || d.symbol === "WO" || d.symbol === "NHD" || d.symbol === "") continue;
        workingCount++;
        if (d.symbol === "P" || d.symbol === "WFH") present += 1;
        else if (d.symbol === "HD") present += 0.5;
        // "A" adds 0 — counted as working day but not present
      }

      // If nobody had this as a working day, it's a weekend/holiday for all → skip
      if (workingCount === 0) {
        return { day: dayNum, label: String(dayNum), value: null };
      }

      // Attendance % = present employees / employees for whom it was a working day
      return {
        day: dayNum,
        label: String(dayNum),
        value: Math.round((present / workingCount) * 1000) / 10,
      };
    });
  }, [records, monthData]);

  // ── Section 7: Monthly insights ──────────────────────────────────────────
  const insights = useMemo(() => {
    if (!allTeams.length || !records.length) return [];

    // Best team
    const teamAvgAtt = allTeams.map(team => {
      const tr = records.filter(r => r.team === team);
      const avg = tr.reduce((s, r) => s + r.attendancePercent, 0) / (tr.length || 1);
      return { team, avg };
    });
    const best  = [...teamAvgAtt].sort((a, b) => b.avg - a.avg)[0];
    const worst = [...teamAvgAtt].sort((a, b) => a.avg - b.avg)[0];

    // Perfect attendance: zero absences AND zero half-days (consistent with Key Metrics card)
    const perfectCount = records.filter(r => r.totalAbsent === 0 && r.totalHalfDay === 0).length;

    return [
      {
        icon: <Trophy size={18} color="#FF4D00" />,
        title: `Best Team: ${best?.team}`,
        body: `${best?.team} leads with ${best?.avg.toFixed(1)}% average attendance this month.`,
        accentColor: "#FF4D00",
      },
      {
        icon: <TrendingUp size={18} color="#10b981" />,
        title: "Perfect Attendance Heroes",
        body: `${perfectCount} employee${perfectCount !== 1 ? "s" : ""} had zero absences and zero half-days — showing up fully every single working day.`,
        accentColor: "#10b981",
      },
      {
        icon: <AlertTriangle size={18} color="#f59e0b" />,
        title: `Watch List: ${worst?.team}`,
        body: `${worst?.team} averaged only ${worst?.avg.toFixed(1)}% this month. Consider a quick check-in with the team.`,
        accentColor: "#f59e0b",
      },
    ];
  }, [records, allTeams]);

  // Filtered records passed to FilterBar (for CSV export count)
  const filteredForBar = records;

  return (
    <div ref={pageRef} className="flex flex-col min-h-full pb-16">

      {/* FilterBar */}
      <FilterBar
        monthData={monthData}
        weekRanges={weekRanges}
        localSearch={localSearch}
        onLocalSearchChange={setLocalSearch}
        filteredRecords={filteredForBar}
        hideTeamFilter
      />

      <div className="px-6 pt-6 pb-4 space-y-6">

        {/* ── Section 1: Key Metrics ── */}
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-3 gap-4"
        >
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl bg-[#222222]" />
              ))
            : metrics.map(m => (
                <MetricCard key={m.label} {...m} />
              ))
          }
        </motion.div>

        {/* ── Section 2: Leaderboard ── */}
        <div className="grid grid-cols-2 gap-4">
          <LeaderboardCard
            title="Top Performers"
            icon={<Trophy size={16} className="text-white" />}
            records={topPerformers}
            type="top"
            isLoading={isLoading}
          />
          <LeaderboardCard
            title="Needs Attention"
            icon={<AlertTriangle size={16} className="text-white" />}
            records={bottomPerformers}
            type="bottom"
            isLoading={isLoading}
          />
        </div>

        {/* ── Section 3: Team distribution ── */}
        <Section
          title="Attendance Distribution by Team"
          subtitle="Avg Attendance %, WFH %, and Absence % per team"
        >
          <TeamBarChart data={teamBarData} isLoading={isLoading} />
        </Section>

        {/* ── Section 4: WFH leaders ── */}
        <HorizBarCard
          title="WFH Leaders"
          subtitle="Top 5 employees by WFH day count"
          data={wfhLeaders}
          dataKey="wfh"
          unit="days"
          barColor="#FF4D00"
          isLoading={isLoading}
        />

        {/* ── Section 5: Leave & Absence analysis ── */}
        <div className="grid grid-cols-2 gap-4">
          <HorizBarCard
            title="Most Absences"
            subtitle="Top 5 by absent day count"
            data={absenceLeaders}
            dataKey="abs"
            unit="days"
            barColor="#ef4444"
            isLoading={isLoading}
          />
          <Section title="Absence Heatmap by Team" subtitle="Absence rate per team per week">
            <HeatmapChart
              cells={heatmapCells}
              teams={allTeams}
              weekCount={weekRanges.length}
              isLoading={isLoading}
            />
          </Section>
        </div>

        {/* ── Section 6: Daily trend ── */}
        <Section
          title="Daily Attendance Trend"
          subtitle="% of employees present each working day — dashed line = 80% target"
        >
          <DailyTrendChart data={dailyTrendData} isLoading={isLoading} />
        </Section>

        {/* ── Section 7: Monthly insights ── */}
        <div>
          <p className="text-base font-medium text-[#F5F5F5] mb-4">Monthly Insights</p>
          {isLoading ? (
            <div className="grid grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl bg-[#222222]" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {insights.map((ins, i) => (
                <InsightCard key={ins.title} {...ins} index={i} />
              ))}
            </div>
          )}
        </div>

      </div>

      {/* ── Back-to-top button ── */}
      <AnimatePresence>
        {showTopBtn && (
          <motion.button
            key="back-top"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2 }}
            onClick={scrollToTop}
            className="fixed bottom-6 right-6 z-50 w-10 h-10 rounded-full flex items-center justify-center shadow-lg"
            style={{ background: "linear-gradient(135deg,#FF4D00,#FF7A35)" }}
            aria-label="Back to top"
          >
            <ArrowUp size={16} className="text-white" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
