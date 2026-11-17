"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  CalendarDays, Loader2, CheckCircle2, XCircle, Trash2, Pencil, X, UploadCloud, FileSpreadsheet,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { formatHolidayDate, holidayWeekday } from "@/lib/holidays";
import type { HolidayPublic } from "@/types/holiday";

const inputClass = "h-9 text-sm bg-[#1E1E1E] border-[rgba(255,77,0,0.25)] text-[#F5F5F5] placeholder:text-[#555] focus:border-[#FF4D00] focus:ring-1 focus:ring-[#FF4D00]";
const cardStyle = { background: "#181818", border: "1px solid rgba(255,77,0,0.15)" };
const primaryBtnStyle = (busy: boolean) => ({
  background: "linear-gradient(135deg, #FF4D00, #FF7A35)",
  border: "none",
  opacity: busy ? 0.7 : 1,
  cursor: busy ? "not-allowed" : "pointer",
});

type Alert = { type: "success" | "error"; message: string; details?: string[] } | null;

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-[#888888] mb-1.5">{children}</label>;
}

function AlertBox({ alert }: { alert: Alert }) {
  if (!alert) return null;
  const ok = alert.type === "success";
  return (
    <div
      className="text-sm px-3 py-2 rounded-lg space-y-1"
      style={{ background: ok ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)", color: ok ? "#4ade80" : "#f87171" }}
    >
      <div className="flex items-center gap-2">
        {ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
        {alert.message}
      </div>
      {alert.details && alert.details.length > 0 && (
        <ul className="text-xs pl-6 list-disc text-[#f87171] max-h-32 overflow-y-auto">
          {alert.details.map((d, i) => <li key={i}>{d}</li>)}
        </ul>
      )}
    </div>
  );
}

async function fileToBase64(f: File): Promise<string> {
  const bytes = new Uint8Array(await f.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

const ACCEPT = ".xlsx, .xls, .csv";
const ACCEPTED_EXTS = ["xlsx", "xls", "csv"];

export default function HolidaysPage() {
  const [holidays, setHolidays] = useState<HolidayPublic[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  // Single-holiday form
  const [name, setName] = useState("");
  const [date, setDate] = useState("");           // ISO from <input type="date">
  const [description, setDescription] = useState("");
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formAlert, setFormAlert] = useState<Alert>(null);

  // Upload
  const [file, setFile] = useState<File | null>(null);
  const [isDrag, setIsDrag] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadAlert, setUploadAlert] = useState<Alert>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [deleteTarget, setDeleteTarget] = useState<HolidayPublic | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isEditing = editingDate !== null;

  const loadHolidays = useCallback(async () => {
    try {
      const res = await fetch("/api/holidays");
      const data = await res.json();
      if (data.success) setHolidays(data.holidays);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/holidays")
      .then(r => r.json())
      .then(data => { if (!cancelled && data.success) setHolidays(data.holidays); })
      .finally(() => { if (!cancelled) setLoadingList(false); });
    return () => { cancelled = true; };
  }, []);

  const byYear = useMemo(() => {
    const groups = new Map<string, HolidayPublic[]>();
    for (const h of holidays) {
      const y = h.date.slice(0, 4);
      if (!groups.has(y)) groups.set(y, []);
      groups.get(y)!.push(h);
    }
    return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [holidays]);

  function resetForm() {
    setEditingDate(null);
    setName(""); setDate(""); setDescription("");
  }

  function handleEditClick(h: HolidayPublic) {
    setFormAlert(null);
    setEditingDate(h.date);
    setName(h.name);
    setDate(h.date);
    setDescription(h.description ?? "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormAlert(null);
    if (!name.trim() || !date) {
      setFormAlert({ type: "error", message: "Holiday name and date are required." });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), date, description: description.trim(), originalDate: editingDate }),
      });
      const data = await res.json();
      if (!data.success) {
        setFormAlert({ type: "error", message: data.message ?? "Failed to save holiday" });
        return;
      }
      setFormAlert({
        type: "success",
        message: `${name.trim()} (${formatHolidayDate(date)}) ${isEditing ? "updated" : "added"}.`,
      });
      resetForm();
      loadHolidays();
    } catch (err) {
      setFormAlert({ type: "error", message: String(err) });
    } finally {
      setSubmitting(false);
    }
  }

  function handleFile(f: File) {
    setUploadAlert(null);
    const ext = (f.name.split(".").pop() ?? "").toLowerCase();
    if (!ACCEPTED_EXTS.includes(ext)) {
      setUploadAlert({ type: "error", message: "Unsupported file. Upload a .xlsx, .xls or .csv file." });
      return;
    }
    setFile(f);
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setUploadAlert(null);
    try {
      const res = await fetch("/api/holidays/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileBase64: await fileToBase64(file) }),
      });
      const data = await res.json();
      if (!data.success) {
        setUploadAlert({ type: "error", message: data.message ?? "Upload failed", details: data.errors });
        return;
      }
      const errs: string[] = data.errors ?? [];
      setUploadAlert({
        type: "success",
        message: `Imported: ${data.added} added, ${data.updated} updated${errs.length ? `, ${errs.length} row(s) skipped` : ""}.`,
        details: errs,
      });
      setFile(null);
      loadHolidays();
    } catch (err) {
      setUploadAlert({ type: "error", message: String(err) });
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteConfirmed() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/holidays?date=${encodeURIComponent(deleteTarget.date)}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.success) {
        setFormAlert({ type: "error", message: data.message ?? "Failed to delete holiday" });
        return;
      }
      if (editingDate === deleteTarget.date) resetForm();
      loadHolidays();
    } catch (err) {
      setFormAlert({ type: "error", message: String(err) });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold text-[#F5F5F5] flex items-center gap-2">
          <CalendarDays size={20} /> Holiday List
        </h1>
        <p className="text-sm text-[#888888] mt-1">
          Add company holidays one at a time, or upload a sheet to import many at once.
        </p>
      </div>

      {/* Add / edit holiday */}
      <form onSubmit={handleSubmit} className="rounded-xl p-5 space-y-4" style={cardStyle}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-[#F5F5F5]">
            {isEditing ? `Editing ${formatHolidayDate(editingDate!)}` : "Add a holiday"}
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
            <Label>Holiday Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Republic Day" className={inputClass} />
          </div>
          <div>
            <Label>Date</Label>
            <Input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className={`${inputClass} [color-scheme:dark]`}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Description (optional)</Label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Any notes about this holiday"
              rows={3}
              className="w-full rounded-md px-3 py-2 text-sm bg-[#1E1E1E] border border-[rgba(255,77,0,0.25)] text-[#F5F5F5] placeholder:text-[#555] focus:outline-none focus:border-[#FF4D00] focus:ring-1 focus:ring-[#FF4D00] resize-y"
            />
          </div>
        </div>

        <AlertBox alert={formAlert} />

        <Button
          type="submit"
          disabled={submitting}
          className="h-10 px-5 text-sm font-semibold text-white gap-2"
          style={primaryBtnStyle(submitting)}
        >
          {submitting && <Loader2 size={14} className="animate-spin" />}
          {isEditing ? "Update Holiday" : "Save Holiday"}
        </Button>
      </form>

      {/* Bulk upload */}
      <div className="rounded-xl p-5 space-y-4" style={cardStyle}>
        <div>
          <p className="text-sm font-medium text-[#F5F5F5]">Upload holiday sheet</p>
          <p className="text-xs text-[#888888] mt-1">
            Column A: <span className="text-[#F5F5F5]">Holiday Name</span> · Column B:{" "}
            <span className="text-[#F5F5F5]">Date</span> in DD-MMM-YYYY (e.g. 01-Jan-2026). A header row is optional.
            In Google Sheets, use File → Download → .xlsx or .csv.
          </p>
        </div>

        <div
          onDragOver={e => { e.preventDefault(); setIsDrag(true); }}
          onDragLeave={() => setIsDrag(false)}
          onDrop={e => { e.preventDefault(); setIsDrag(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          onClick={() => inputRef.current?.click()}
          className="flex flex-col items-center justify-center gap-2 rounded-xl cursor-pointer"
          style={{
            border: `2px dashed ${isDrag ? "#FF4D00" : "rgba(255,77,0,0.25)"}`,
            background: isDrag ? "rgba(255,77,0,0.06)" : "rgba(255,77,0,0.02)",
            padding: "28px 24px", minHeight: 120,
            transition: "border-color 0.15s, background 0.15s",
          }}
        >
          {file ? (
            <>
              <FileSpreadsheet size={26} className="text-[#FF7A35]" />
              <p className="text-sm text-[#F5F5F5]">{file.name}</p>
              <p className="text-[11px] text-[#555555]">Click to choose a different file</p>
            </>
          ) : (
            <>
              <UploadCloud size={26} style={{ color: isDrag ? "#FF4D00" : "#555555" }} />
              <p className="text-sm text-[#888888] text-center">
                <span className="text-[#FF7A35] font-medium">Click to browse</span> or drag & drop here
              </p>
              <p className="text-[11px] text-[#555555]">{ACCEPT}</p>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
          />
        </div>

        <AlertBox alert={uploadAlert} />

        <Button
          type="button"
          onClick={handleUpload}
          disabled={!file || uploading}
          className="h-10 px-5 text-sm font-semibold text-white gap-2"
          style={primaryBtnStyle(!file || uploading)}
        >
          {uploading && <Loader2 size={14} className="animate-spin" />}
          Import Holidays
        </Button>
      </div>

      {/* Existing holidays */}
      <div className="rounded-xl p-5" style={cardStyle}>
        <p className="text-sm font-medium text-[#888888] mb-4">
          Holidays{holidays.length ? ` (${holidays.length})` : ""}
        </p>
        {loadingList ? (
          <p className="text-sm text-[#666]">Loading…</p>
        ) : holidays.length === 0 ? (
          <p className="text-sm text-[#666]">No holidays added yet.</p>
        ) : (
          <div className="space-y-5">
            {byYear.map(([year, list]) => (
              <div key={year}>
                <p className="text-xs font-semibold text-[#FF7A35] mb-2">{year}</p>
                <div className="space-y-2">
                  {list.map(h => (
                    <div
                      key={h.date}
                      className="flex items-center justify-between px-4 py-3 rounded-lg"
                      style={{ background: "#222222" }}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#F5F5F5] truncate">{h.name}</p>
                        <p className="text-[11px] text-[#888888]">
                          {formatHolidayDate(h.date)} · {holidayWeekday(h.date)}
                        </p>
                        {h.description && (
                          <p className="text-xs text-[#aaaaaa] mt-1 whitespace-pre-wrap">{h.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                        <button
                          onClick={() => handleEditClick(h)}
                          className="text-[#888888] hover:text-[#FF7A35] transition-colors"
                          title="Edit"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(h)}
                          className="text-[#888888] hover:text-[#f87171] transition-colors"
                          title="Remove"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        busy={deleting}
        destructive
        title="Remove holiday?"
        confirmLabel="Yes, remove"
        busyLabel="Removing…"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirmed}
        message={
          <>
            Remove <span className="text-[#F5F5F5] font-medium">{deleteTarget?.name}</span> on{" "}
            {deleteTarget ? formatHolidayDate(deleteTarget.date) : ""}?
          </>
        }
      />
    </div>
  );
}
