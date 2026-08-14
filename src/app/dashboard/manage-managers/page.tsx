"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { UserCog, Loader2, CheckCircle2, XCircle, Trash2, Pencil, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAttendanceStore } from "@/lib/store";
import { ConfirmDialog } from "@/components/ConfirmDialog";
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

  // Editing an existing manager's credentials — null when adding a new one.
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ManagerPublic | null>(null);

  const isEditing = editingEmail !== null;

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

  function resetForm() {
    setEditingEmail(null);
    setEmail(""); setPassword(""); setName(""); setTeam("");
  }

  function handleEditClick(m: ManagerPublic) {
    setAlert(null);
    setEditingEmail(m.email);
    setEmail(m.email);
    setName(m.name);
    setTeam(m.team);
    setPassword("");
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAlert(null);
    if (!email.trim() || !name.trim() || !team || (!isEditing && !password)) {
      setAlert({ type: "error", message: "All fields are required." });
      return;
    }
    // Changing an existing manager's credentials needs an explicit confirmation.
    if (isEditing) {
      setConfirmOpen(true);
    } else {
      void saveManager();
    }
  }

  async function saveManager() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/managers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          originalEmail: editingEmail,
          password,
          name: name.trim(),
          team,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setAlert({ type: "error", message: data.message ?? "Failed to save manager" });
        return;
      }
      setAlert({ type: "success", message: `Manager ${email} ${isEditing ? "updated" : "saved"}.` });
      resetForm();
      loadManagers();
    } catch (err) {
      setAlert({ type: "error", message: String(err) });
    } finally {
      setSubmitting(false);
      setConfirmOpen(false);
    }
  }

  async function handleDeleteConfirmed() {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/managers?email=${encodeURIComponent(deleteTarget.email)}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.success) {
        setAlert({ type: "error", message: data.message ?? "Failed to remove manager" });
        return;
      }
      if (editingEmail === deleteTarget.email) resetForm();
      loadManagers();
    } catch (err) {
      setAlert({ type: "error", message: String(err) });
    } finally {
      setSubmitting(false);
      setDeleteTarget(null);
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

      {/* Add / edit manager form */}
      <form
        onSubmit={handleFormSubmit}
        className="rounded-xl p-5 space-y-4"
        style={{ background: "#181818", border: "1px solid rgba(255,77,0,0.15)" }}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-[#F5F5F5]">
            {isEditing ? `Editing ${editingEmail}` : "Add a new manager"}
          </p>
          {isEditing && (
            <button
              type="button"
              onClick={resetForm}
              className="flex items-center gap-1 text-xs text-[#888888] hover:text-[#F5F5F5] transition-colors"
            >
              <X size={13} /> Cancel edit
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Manager's full name" className={inputClass} />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="manager@company.com"
              className={inputClass}
            />
          </div>
          <div>
            <Label>Password</Label>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={isEditing ? "Leave blank to keep current password" : "At least 6 characters"}
              className={inputClass}
            />
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
          {submitting && !confirmOpen && <Loader2 size={14} className="animate-spin" />}
          {isEditing ? "Update Manager" : "Save Manager"}
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
                <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                  <button
                    onClick={() => handleEditClick(m)}
                    className="text-[#888888] hover:text-[#FF7A35] transition-colors"
                    title="Edit"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(m)}
                    className="text-[#888888] hover:text-[#f87171] transition-colors"
                    title="Remove"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        busy={submitting}
        title="Update manager credentials?"
        confirmLabel="Yes, update"
        busyLabel="Updating…"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={saveManager}
        message={
          <>
            Do you really want to make changes to{" "}
            <span className="text-[#F5F5F5] font-medium">{name || editingEmail}</span>&apos;s login
            {editingEmail && email.trim().toLowerCase() !== editingEmail.toLowerCase() && (
              <> (email will change to <span className="text-[#F5F5F5] font-medium">{email.trim()}</span>)</>
            )}
            {password ? " and password" : ""}? They&apos;ll need the new details to sign in.
          </>
        }
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        busy={submitting}
        destructive
        title="Remove manager access?"
        confirmLabel="Yes, remove"
        busyLabel="Removing…"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirmed}
        message={
          <>
            This permanently removes login access for{" "}
            <span className="text-[#F5F5F5] font-medium">{deleteTarget?.name}</span>{" "}
            ({deleteTarget?.email}).
          </>
        }
      />
    </div>
  );
}
