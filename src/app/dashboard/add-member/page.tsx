"use client";

import { useState, useEffect, useCallback } from "react";
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
    <label className="block text-xs font-medium text-[#8B8A9B] mb-1.5">
      {children}
      {required && <span className="text-[#7C3AED] ml-0.5">*</span>}
    </label>
  );
}

// ── Avatar initials ───────────────────────────────────────────────────────────
function Avatar({ name }: { name: string }) {
  const initials = name.split(" ").slice(0, 2).map(p => p[0]).join("").toUpperCase();
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
      style={{ background: "linear-gradient(135deg, #7C3AED, #EC4899)" }}
    >
      {initials || "?"}
    </div>
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
  const [designation, setDesignation]     = useState("");

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
          designation: designation.trim() || undefined,
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
        // Reset form
        setEmployeeId(""); setName(""); setTeam(""); setBuLead(""); setDesignation(""); setErrors({});
      }
    } catch {
      setAlert({ type: "error", message: "Network error — please try again" });
    } finally {
      setIsSubmitting(false);
    }
  }

  const inputClass = "h-9 text-sm bg-[#1C1C28] border-[rgba(124,58,237,0.25)] text-[#F1F0F5] placeholder:text-[#555] focus:border-[#7C3AED] focus:ring-1 focus:ring-[#7C3AED]";

  return (
    <div className="min-h-full px-6 py-8 flex flex-col items-center">

      {/* ── Form card ── */}
      <div
        className="w-full max-w-[560px] rounded-2xl overflow-hidden"
        style={{
          background: "#1A1A24",
          border: "1px solid rgba(124,58,237,0.3)",
          boxShadow: "0 0 40px rgba(124,58,237,0.08)",
        }}
      >
        {/* Header */}
        <div
          className="px-8 py-6"
          style={{ borderBottom: "1px solid rgba(124,58,237,0.15)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(124,58,237,0.15)" }}
            >
              <UserPlus size={18} className="text-[#a78bfa]" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[#F1F0F5]">Add New Member</h2>
              <p className="text-xs text-[#8B8A9B] mt-0.5">
                New member will be added to all 12 monthly sheets.
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

          {/* Row 3: Team with datalist */}
          <div>
            <Label required>Team / BU</Label>
            <Input
              value={team}
              onChange={e => {
                setTeam(e.target.value);
                if (errors.team) setErrors(p => ({ ...p, team: "" }));
              }}
              placeholder="Select or type a team"
              list="teams-datalist"
              className={inputClass}
              style={errors.team ? { borderColor: "rgba(239,68,68,0.6)" } : {}}
            />
            <datalist id="teams-datalist">
              {allTeams.map(t => <option key={t} value={t} />)}
            </datalist>
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

          {/* Row 5: Designation (optional) */}
          <div>
            <Label>Designation</Label>
            <Input
              value={designation}
              onChange={e => setDesignation(e.target.value)}
              placeholder="e.g. Software Engineer"
              className={inputClass}
            />
          </div>

          {/* Submit */}
          <div
            onClick={!isSubmitting ? handleSubmit : undefined}
            className="mt-2"
          >
            <Button
              className="w-full h-10 text-sm font-semibold text-white gap-2"
              style={{
                background: "linear-gradient(135deg, #7C3AED, #EC4899)",
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
          <p className="text-xs font-medium text-[#8B8A9B] mb-3">Recent Additions</p>
          <div className="space-y-2">
            {recentAdditions.map((r, i) => (
              <motion.div
                key={`${r.employeeId}-${i}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl"
                style={{ background: "#1A1A24", border: "1px solid rgba(124,58,237,0.12)" }}
              >
                <Avatar name={r.name} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#F1F0F5] truncate">{r.name}</p>
                  <p className="text-[11px] text-[#8B8A9B]">
                    {r.employeeId} · {r.team}
                  </p>
                </div>
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{ background: "rgba(124,58,237,0.15)", color: "#a78bfa" }}
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
