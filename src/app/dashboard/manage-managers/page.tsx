"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { UserCog, Loader2, CheckCircle2, XCircle, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAttendanceStore } from "@/lib/store";
import type { ManagerPublic } from "@/types/manager";

const inputClass = "h-9 text-sm bg-[#1E1E1E] border-[rgba(255,77,0,0.25)] text-[#F5F5F5] placeholder:text-[#555] focus:border-[#FF4D00] focus:ring-1 focus:ring-[#FF4D00]";

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-[#888888] mb-1.5">{children}</label>;
}

export default function ManageManagersPage() {
  const monthData = useAttendanceStore(s => s.monthData);
  const teams = useMemo(
    () => [...new Set((monthData?.records ?? []).map(r => r.team))].filter(Boolean).sort(),
    [monthData],
  );

  const [managers, setManagers] = useState<ManagerPublic[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [team, setTeam] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const loadManagers = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/managers");
      const data = await res.json();
      if (data.success) setManagers(data.managers);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => { loadManagers(); }, [loadManagers]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAlert(null);
    if (!email.trim() || !password || !name.trim() || !team) {
      setAlert({ type: "error", message: "All fields are required." });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/managers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, name: name.trim(), team }),
      });
      const data = await res.json();
      if (!data.success) {
        setAlert({ type: "error", message: data.message ?? "Failed to save manager" });
        return;
      }
      setAlert({ type: "success", message: `Manager ${email} saved.` });
      setEmail(""); setPassword(""); setName(""); setTeam("");
      loadManagers();
    } catch (err) {
      setAlert({ type: "error", message: String(err) });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(managerEmail: string) {
    if (!confirm(`Remove manager access for ${managerEmail}?`)) return;
    try {
      const res = await fetch(`/api/managers?email=${encodeURIComponent(managerEmail)}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.success) {
        setAlert({ type: "error", message: data.message ?? "Failed to remove manager" });
        return;
      }
      loadManagers();
    } catch (err) {
      setAlert({ type: "error", message: String(err) });
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold text-[#F5F5F5] flex items-center gap-2">
          <UserCog size={20} /> Manage Managers
        </h1>
        <p className="text-sm text-[#888888] mt-1">
          Create team-manager logins. A manager can only view and export their own team&apos;s attendance.
        </p>
      </div>

      {/* Add manager form */}
      <form
        onSubmit={handleSubmit}
        className="rounded-xl p-5 space-y-4"
        style={{ background: "#181818", border: "1px solid rgba(255,77,0,0.15)" }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Manager's full name" className={inputClass} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="manager@company.com" className={inputClass} />
          </div>
          <div>
            <Label>Password</Label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" className={inputClass} />
          </div>
          <div>
            <Label>Team</Label>
            <Select value={team} onValueChange={setTeam}>
              <SelectTrigger className="h-9 w-full text-sm bg-[#1E1E1E] border-[rgba(255,77,0,0.25)] text-[#F5F5F5]">
                <SelectValue placeholder="Select a team" />
              </SelectTrigger>
              <SelectContent className="bg-[#181818] border-[rgba(255,77,0,0.3)]">
                {teams.map(t => (
                  <SelectItem
                    key={t}
                    value={t}
                    className="text-[#F5F5F5] focus:bg-[rgba(255,77,0,0.15)] focus:text-[#F5F5F5] data-[highlighted]:bg-[rgba(255,77,0,0.15)] data-[highlighted]:text-[#F5F5F5]"
                  >
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {alert && (
          <div
            className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg"
            style={{
              background: alert.type === "success" ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
              color: alert.type === "success" ? "#4ade80" : "#f87171",
            }}
          >
            {alert.type === "success" ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
            {alert.message}
          </div>
        )}

        <Button
          type="submit"
          disabled={submitting}
          className="h-10 px-5 text-sm font-semibold text-white gap-2"
          style={{
            background: "linear-gradient(135deg, #FF4D00, #FF7A35)",
            border: "none",
            opacity: submitting ? 0.7 : 1,
            cursor: submitting ? "not-allowed" : "pointer",
          }}
        >
          {submitting && <Loader2 size={14} className="animate-spin" />}
          Save Manager
        </Button>
      </form>

      {/* Existing managers */}
      <div
        className="rounded-xl p-5"
        style={{ background: "#181818", border: "1px solid rgba(255,77,0,0.15)" }}
      >
        <p className="text-sm font-medium text-[#888888] mb-4">Existing Managers</p>
        {loadingList ? (
          <p className="text-sm text-[#666]">Loading…</p>
        ) : managers.length === 0 ? (
          <p className="text-sm text-[#666]">No managers added yet.</p>
        ) : (
          <div className="space-y-2">
            {managers.map(m => (
              <div
                key={m.email}
                className="flex items-center justify-between px-4 py-3 rounded-lg"
                style={{ background: "#222222" }}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#F5F5F5] truncate">{m.name}</p>
                  <p className="text-[11px] text-[#888888] truncate">{m.email} · {m.team}</p>
                </div>
                <button
                  onClick={() => handleDelete(m.email)}
                  className="flex-shrink-0 ml-3 text-[#888888] hover:text-[#f87171] transition-colors"
                  title="Remove"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
