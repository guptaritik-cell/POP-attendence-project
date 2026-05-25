"use client";

import { motion } from "framer-motion";

interface InsightCardProps {
  icon: React.ReactNode;
  title: string;
  body: string;
  accentColor: string;   // left border + icon bg
  index?: number;        // stagger position
}

export function InsightCard({ icon, title, body, accentColor, index = 0 }: InsightCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: index * 0.1,
        duration: 0.35,
        ease: [0.4, 0, 0.2, 1] as const,
      }}
      className="rounded-xl px-5 py-4 flex gap-4"
      style={{
        background: "#181818",
        border: "1px solid rgba(255,77,0,0.15)",
        borderLeft: `3px solid ${accentColor}`,
      }}
    >
      {/* Icon circle */}
      <div
        className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
        style={{ background: `${accentColor}22` }}
      >
        {icon}
      </div>

      <div className="min-w-0">
        <p className="text-sm font-semibold text-[#F5F5F5] leading-snug">{title}</p>
        <p className="text-xs text-[#888888] mt-1 leading-relaxed">{body}</p>
      </div>
    </motion.div>
  );
}
