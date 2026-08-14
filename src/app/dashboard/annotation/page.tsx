"use client";

import { SYMBOL_LIST, type SymbolCategory } from "@/lib/attendanceSymbols";

const CATEGORY_LABELS: Record<SymbolCategory, string> = {
  present: "Present",
  absent:  "Absent",
  leave:   "Leave",
  off:     "Off Day",
};

const CATEGORY_ORDER: SymbolCategory[] = ["present", "absent", "leave", "off"];

export default function AnnotationPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[#F5F5F5]">Annotation</h1>
        <p className="text-sm text-[#888888] mt-1">
          Full form of every short code used across the attendance sheet.
        </p>
      </div>

      {CATEGORY_ORDER.map(category => {
        const items = SYMBOL_LIST.filter(m => m.category === category);
        if (!items.length) return null;
        return (
          <div
            key={category}
            className="rounded-xl p-5"
            style={{ background: "#181818", border: "1px solid rgba(255,77,0,0.15)" }}
          >
            <p className="text-sm font-medium text-[#888888] mb-4">{CATEGORY_LABELS[category]}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map(m => (
                <div
                  key={m.code}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg"
                  style={{ background: "#222222", border: `1px solid ${m.color}33` }}
                >
                  <span
                    className="flex-shrink-0 inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
                    style={{ background: m.bg, color: m.color }}
                  >
                    {m.code}
                  </span>
                  <span className="text-sm text-[#F5F5F5]">{m.fullName}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
