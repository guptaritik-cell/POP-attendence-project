"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UserPlus, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAttendanceStore } from "@/lib/store";

// ── Types ─────────────────────────────────────────────────────────────────────
interface RecentAddition {
  employeeId: string;
  name: string;
  team: string;
  buLead: string;
  addedAt: string; // ISO string
}

const STORAGE_KEY = "pop_recent_additions";

// ── Team → BU Lead map derived at runtime from monthData ─────────────────────
function getTeamLeadMap(records: { team: string; buLead: string }[]) {
  const map: Record<string, string> = {};
  for (const r of records) {
    if (r.team && r.buLead && !map[r.team]) map[r.team] = r.buLead;
  }
  return map;
}

// ── Inline error message (fade-in) ───────────────────────────────────────────
function FieldError({ msg }: { msg: string | undefined }) {
  return (
    <AnimatePresence>
      {msg && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
          className="text-[11px] text-[#f87171] mt-1"
        >
          {msg}
        </motion.p>
      )}
    </AnimatePresence>
  );
}

// ── Field label ───────────────────────────────────────────────────────────────
function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-medium text-[#888888] mb-1.5">
      {children}
      {required && <span className="text-[#FF4D00] ml-0.5">*</span>}
    </label>
  );
}

// ── Avatar initials ───────────────────────────────────────────────────────────
function Avatar({ name }: { name: string }) {
  const initials = name.split(" ").slice(0, 2).map(p => p[0]).join("").toUpperCase();
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
      style={{ background: "linear-gradient(135deg, #FF4D00, #FF7A35)" }}
    >
      {initials || "?"}
    </div>
  );
}

// ── Custom dark-themed team combobox ─────────────────────────────────────────
function TeamCombobox({
  value,
  onChange,
  options,
  placeholder,
  hasError,
}: {
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder?: string;
  hasError?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep query in sync when value is reset externally (form reset)
  useEffect(() => { setQuery(value); }, [value]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = query
    ? options.filter(o => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  function select(val: string) {
    onChange(val);
    setQuery(val);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        autoComplete="off"
        onChange={e => {
          setQuery(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        className="w-full h-9 text-sm rounded-md px-3 outline-none transition-colors"
        style={{
          background: "#1E1E1E",
          border: `1px solid ${hasError ? "rgba(239,68,68,0.6)" : "rgba(255,77,0,0.25)"}`,
          color: "#F5F5F5",
          boxShadow: "none",
        }}
        onFocusCapture={e => {
          (e.currentTarget as HTMLInputElement).style.border = `1px solid ${hasError ? "rgba(239,68,68,0.6)" : "#FF4D00"}`;
          (e.currentTarget as HTMLInputElement).style.boxShadow = "0 0 0 1px #FF4D00";
        }}
        onBlurCapture={e => {
          (e.currentTarget as HTMLInputElement).style.border = `1px solid ${hasError ? "rgba(239,68,68,0.6)" : "rgba(255,77,0,0.25)"}`;
          (e.currentTarget as HTMLInputElement).style.boxShadow = "none";
        }}
      />
      {/* Dropdown */}
      <AnimatePresence>
        {open && filtered.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.13 }}
            className="absolute left-0 right-0 z-50 mt-1 rounded-lg overflow-auto"
            style={{
              background: "#1E1E1E",
              border: "1px solid rgba(255,77,0,0.3)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
              maxHeight: 200,
            }}
          >
            {filtered.map(opt => (
              <li
                key={opt}
                onMouseDown={() => select(opt)}
                className="px-3 py-2 text-sm cursor-pointer transition-colors"
                style={{ color: opt === value ? "#FF7A35" : "#F5F5F5" }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLLIElement).style.background = "rgba(255,77,0,0.12)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLLIElement).style.background = "transparent";
                }}
              >
                {opt}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Month / Year constants ─────────────────────────────────────────────────────
const MONTH_LABELS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const CURRENT_YEAR  = new Date().getFullYear();
const YEAR_OPTIONS  = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];

function daysInMonth(month: number, year: number): number {
  return new Date(year, month + 1, 0).getDate();
}

// ── Inline select (dark-themed, matches form inputs) ──────────────────────────
function DarkSelect({
  value, onChange, options, hasError,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
  hasError?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        width: "100%",
        height: 36,
        background: "#1E1E1E",
        border: `1px solid ${hasError ? "rgba(239,68,68,0.6)" : "rgba(255,77,0,0.25)"}`,
        borderRadius: 6,
        color: "#F5F5F5",
        fontSize: 14,
        padding: "0 10px",
        outline: "none",
        cursor: "pointer",
        appearance: "none",
        WebkitAppearance: "none",
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 10px center",
        paddingRight: 32,
      }}
    >
      {options.map(o => (
        <option key={o.value} value={o.value} style={{ background: "#1E1E1E" }}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AddMemberPage() {
  const { monthData } = useAttendanceStore();

  // Form state
  const [employeeId, setEmployeeId]       = useState("");
  const [name, setName]                   = useState("");
  const [team, setTeam]                   = useState("");
  const [buLead, setBuLead]               = useState("");
  const [joinMonth, setJoinMonth]         = useState(String(new Date().getMonth()));   // 0-indexed
  const [joinYear,  setJoinYear]          = useState(String(CURRENT_YEAR));
  const [joinDate,  setJoinDate]          = useState(String(new Date().getDate()));    // 1-indexed
  const [tillMonth, setTillMonth]         = useState("11");                            // 0-indexed (default December)
  const [tillYear,  setTillYear]          = useState(String(CURRENT_YEAR));

  // UI state
  const [errors, setErrors]               = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting]   = useState(false);
  const [alert, setAlert]                 = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [recentAdditions, setRecentAdditions] = useState<RecentAddition[]>([]);

  const allTeams = monthData
    ? [...new Set(monthData.records.map(r => r.team))].sort()
    : [];

  const teamLeadMap = monthData ? getTeamLeadMap(monthData.records) : {};
  const existingIds = new Set(monthData?.records.map(r => r.employeeId) ?? []);

  // Auto-fill BU Lead when a known team is chosen
  useEffect(() => {
    if (teamLeadMap[team]) setBuLead(teamLeadMap[team]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team]);

  // Clamp joinDate when month/year changes (e.g. Feb has only 28/29 days)
  useEffect(() => {
    const maxDay = daysInMonth(parseInt(joinMonth, 10), parseInt(joinYear, 10));
    if (parseInt(joinDate, 10) > maxDay) setJoinDate(String(maxDay));
  }, [joinMonth, joinYear, joinDate]);

  // Load recent additions from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setRecentAdditions(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const saveRecent = useCallback((addition: RecentAddition) => {
    setRecentAdditions(prev => {
      const updated = [addition, ...prev].slice(0, 5);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch { /* ignore */ }
      return updated;
    });
  }, []);

  // ── Validation ───────────────────────────────────────────────────────────
  function validate() {
    const e: Record<string, string> = {};

    if (!employeeId.trim()) {
      e.employeeId = "Employee ID is required";
    } else if (/\s/.test(employeeId)) {
      e.employeeId = "Employee ID must not contain spaces";
    } else if (existingIds.has(employeeId.toUpperCase())) {
      e.employeeId = "This Employee ID already exists";
    }

    if (!name.trim()) {
      e.name = "Employee name is required";
    } else if (name.trim().length < 2) {
      e.name = "Name must be at least 2 characters";
    }

    if (!team.trim()) {
      e.team = "Team is required";
    }

    if (!buLead.trim()) {
      e.buLead = "BU Lead is required";
    }

    // "Till" month must not be earlier than the joining month
    const joinAbs = parseInt(joinYear, 10) * 12 + parseInt(joinMonth, 10);
    const tillAbs = parseInt(tillYear, 10) * 12 + parseInt(tillMonth, 10);
    if (tillAbs < joinAbs) {
      e.till = "The 'till' month cannot be earlier than the joining month";
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // ── Submit ───────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!validate()) return;
    setIsSubmitting(true);
    setAlert(null);

    try {
      const res = await fetch("/api/employees/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employeeId.trim().toUpperCase(),
          name: name.trim(),
          team: team.trim(),
          buLead: buLead.trim(),
          joinMonth: parseInt(joinMonth, 10),
          joinYear:  parseInt(joinYear,  10),
          joinDate:  parseInt(joinDate,  10),
          tillMonth: parseInt(tillMonth, 10),
          tillYear:  parseInt(tillYear,  10),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setAlert({ type: "error", message: data.message ?? "Something went wrong" });
      } else {
        setAlert({ type: "success", message: data.message });
        saveRecent({
          employeeId: employeeId.trim().toUpperCase(),
          name: name.trim(),
          team: team.trim(),
          buLead: buLead.trim(),
          addedAt: new Date().toISOString(),
        });
        // Reset form (keep month/year/date as-is — likely to add more in same period)
        setEmployeeId(""); setName(""); setTeam(""); setBuLead(""); setErrors({});
      }
    } catch {
      setAlert({ type: "error", message: "Network error — please try again" });
    } finally {
      setIsSubmitting(false);
    }
  }

  const inputClass = "h-9 text-sm bg-[#1E1E1E] border-[rgba(255,77,0,0.25)] text-[#F5F5F5] placeholder:text-[#555] focus:border-[#FF4D00] focus:ring-1 focus:ring-[#FF4D00]";

  return (
    <div className="min-h-full px-6 py-8 flex flex-col items-center">

      {/* ── Form card ── */}
      <div
        className="w-full max-w-[560px] rounded-2xl overflow-hidden"
        style={{
          background: "#181818",
          border: "1px solid rgba(255,77,0,0.3)",
          boxShadow: "0 0 40px rgba(255,77,0,0.08)",
        }}
      >
        {/* Header */}
        <div
          className="px-8 py-6"
          style={{ borderBottom: "1px solid rgba(255,77,0,0.15)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(255,77,0,0.15)" }}
            >
              <UserPlus size={18} className="text-[#FF7A35]" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[#F5F5F5]">Add New Member</h2>
              <p className="text-xs text-[#888888] mt-0.5">
                Member added across the selected month range; joining day marked Present.
              </p>
            </div>
          </div>
        </div>

        {/* Form body */}
        <div className="px-8 py-6 space-y-5">

          {/* Alert */}
          <AnimatePresence>
            {alert && (
              <motion.div
                key="alert"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="flex items-start gap-3 px-4 py-3 rounded-lg text-sm"
                style={{
                  background: alert.type === "success"
                    ? "rgba(34,197,94,0.1)"
                    : "rgba(239,68,68,0.1)",
                  border: `1px solid ${alert.type === "success" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                  color: alert.type === "success" ? "#4ade80" : "#f87171",
                }}
              >
                {alert.type === "success"
                  ? <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />
                  : <XCircle size={16} className="flex-shrink-0 mt-0.5" />
                }
                <span>{alert.message}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Row 1: Employee ID */}
          <div>
            <Label required>Employee ID</Label>
            <Input
              value={employeeId}
              onChange={e => {
                setEmployeeId(e.target.value.toUpperCase());
                if (errors.employeeId) setErrors(p => ({ ...p, employeeId: "" }));
              }}
              placeholder="e.g. PTG301"
              className={inputClass}
              style={errors.employeeId ? { borderColor: "rgba(239,68,68,0.6)" } : {}}
            />
            <FieldError msg={errors.employeeId} />
          </div>

          {/* Row 2: Name */}
          <div>
            <Label required>Employee Name</Label>
            <Input
              value={name}
              onChange={e => {
                setName(e.target.value);
                if (errors.name) setErrors(p => ({ ...p, name: "" }));
              }}
              placeholder="Full name"
              className={inputClass}
              style={errors.name ? { borderColor: "rgba(239,68,68,0.6)" } : {}}
            />
            <FieldError msg={errors.name} />
          </div>

          {/* Row 3: Team combobox */}
          <div>
            <Label required>Team / BU</Label>
            <TeamCombobox
              value={team}
              onChange={val => {
                setTeam(val);
                if (errors.team) setErrors(p => ({ ...p, team: "" }));
              }}
              options={allTeams}
              placeholder="Select or type a team"
              hasError={!!errors.team}
            />
            <FieldError msg={errors.team} />
          </div>

          {/* Row 4: BU Lead */}
          <div>
            <Label required>BU Lead</Label>
            <Input
              value={buLead}
              onChange={e => {
                setBuLead(e.target.value);
                if (errors.buLead) setErrors(p => ({ ...p, buLead: "" }));
              }}
              placeholder="BU Lead name"
              className={inputClass}
              style={errors.buLead ? { borderColor: "rgba(239,68,68,0.6)" } : {}}
            />
            <FieldError msg={errors.buLead} />
          </div>

          {/* Row 5: Joining Date */}
          <div>
            <Label required>Joining Date</Label>
            <p className="text-[11px] text-[#666666] mb-2">
              The joining day will be marked as Present (P). Use “Add Until” below to set the last month.
            </p>
            <div className="grid grid-cols-3 gap-3">
              {/* Day */}
              <DarkSelect
                value={joinDate}
                onChange={setJoinDate}
                options={Array.from(
                  { length: daysInMonth(parseInt(joinMonth, 10), parseInt(joinYear, 10)) },
                  (_, i) => ({ label: String(i + 1), value: String(i + 1) })
                )}
              />
              {/* Month */}
              <DarkSelect
                value={joinMonth}
                onChange={setJoinMonth}
                options={MONTH_LABELS.map((label, i) => ({ label, value: String(i) }))}
              />
              {/* Year */}
              <DarkSelect
                value={joinYear}
                onChange={setJoinYear}
                options={YEAR_OPTIONS.map(y => ({ label: String(y), value: String(y) }))}
              />
            </div>
          </div>

          {/* Row 6: Till (end) month */}
          <div>
            <Label required>Add Until</Label>
            <p className="text-[11px] text-[#666666] mb-2">
              The last month to add this member to. Sheets from the joining month up to and including this month will contain the employee.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {/* Month */}
              <DarkSelect
                value={tillMonth}
                onChange={val => { setTillMonth(val); if (errors.till) setErrors(p => ({ ...p, till: "" })); }}
                options={MONTH_LABELS.map((label, i) => ({ label, value: String(i) }))}
                hasError={!!errors.till}
              />
              {/* Year */}
              <DarkSelect
                value={tillYear}
                onChange={val => { setTillYear(val); if (errors.till) setErrors(p => ({ ...p, till: "" })); }}
                options={YEAR_OPTIONS.map(y => ({ label: String(y), value: String(y) }))}
                hasError={!!errors.till}
              />
            </div>
            <FieldError msg={errors.till} />
          </div>

          {/* Submit */}
          <div
            onClick={!isSubmitting ? handleSubmit : undefined}
            className="mt-2"
          >
            <Button
              className="w-full h-10 text-sm font-semibold text-white gap-2"
              style={{
                background: "linear-gradient(135deg, #FF4D00, #FF7A35)",
                border: "none",
                opacity: isSubmitting ? 0.7 : 1,
                cursor: isSubmitting ? "not-allowed" : "pointer",
              }}
              disabled={isSubmitting}
            >
              {isSubmitting
                ? <><Loader2 size={15} className="animate-spin" /> Adding…</>
                : <><UserPlus size={15} /> Add Member</>
              }
            </Button>
          </div>
        </div>
      </div>

      {/* ── Recent additions ── */}
      {recentAdditions.length > 0 && (
        <div className="w-full max-w-[560px] mt-8">
          <p className="text-xs font-medium text-[#888888] mb-3">Recent Additions</p>
          <div className="space-y-2">
            {recentAdditions.map((r, i) => (
              <motion.div
                key={`${r.employeeId}-${i}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl"
                style={{ background: "#181818", border: "1px solid rgba(255,77,0,0.12)" }}
              >
                <Avatar name={r.name} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#F5F5F5] truncate">{r.name}</p>
                  <p className="text-[11px] text-[#888888]">
                    {r.employeeId} · {r.team}
                  </p>
                </div>
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{ background: "rgba(255,77,0,0.15)", color: "#FF7A35" }}
                >
                  Added today
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
