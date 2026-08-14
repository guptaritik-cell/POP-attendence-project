"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  UploadCloud, FileText, X,
  CheckCircle2, XCircle, AlertTriangle,
  Loader2, CalendarDays, Laptop, Plane,
  Trash2, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAttendanceStore } from "@/lib/store";

// ── Constants ─────────────────────────────────────────────────────────────────
const MONTH_LABELS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];
type UploadMode = "all" | "wfh" | "leave" | "remove";

// ── Date helpers (ISO YYYY-MM-DD) ─────────────────────────────────────────────
function toISO(d: Date) {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function firstOfMonthISO() {
  const now = new Date();
  return toISO(new Date(now.getFullYear(), now.getMonth(), 1));
}
function todayISO() {
  return toISO(new Date());
}
function initials(name: string) {
  return name.split(" ").slice(0, 2).map(p => p[0]).join("").toUpperCase();
}

// ── Shared helpers ────────────────────────────────────────────────────────────
function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function DarkSelect({
  value, onChange, options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        width: "100%", height: 36,
        background: "#1E1E1E",
        border: "1px solid rgba(255,77,0,0.25)",
        borderRadius: 6, color: "#F5F5F5", fontSize: 14,
        padding: "0 10px", outline: "none", cursor: "pointer",
        appearance: "none", WebkitAppearance: "none",
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center", paddingRight: 32,
      }}
    >
      {options.map(o => (
        <option key={o.value} value={o.value} style={{ background: "#1E1E1E" }}>{o.label}</option>
      ))}
    </select>
  );
}

type AlertState = {
  type: "success" | "error" | "warning";
  message: string;
  extra?: string;
} | null;

function AlertBox({ alert }: { alert: AlertState }) {
  if (!alert) return null;
  const colors = {
    success: { bg: "rgba(34,197,94,0.1)",  border: "rgba(34,197,94,0.3)",  text: "#4ade80" },
    warning: { bg: "rgba(251,191,36,0.1)", border: "rgba(251,191,36,0.3)", text: "#fbbf24" },
    error:   { bg: "rgba(239,68,68,0.1)",  border: "rgba(239,68,68,0.3)",  text: "#f87171" },
  }[alert.type];
  const Icon = alert.type === "success" ? CheckCircle2 : alert.type === "warning" ? AlertTriangle : XCircle;
  return (
    <div
      className="rounded-lg px-4 py-3 space-y-1.5 text-sm"
      style={{ background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text }}
    >
      <div className="flex items-start gap-2">
        <Icon size={15} className="flex-shrink-0 mt-0.5" />
        <span>{alert.message}</span>
      </div>
      {alert.extra && <p className="text-[11px] pl-5 text-[#888888]">{alert.extra}</p>}
    </div>
  );
}

// ── Confirmation dialog (shown before every upload) ───────────────────────────
function ConfirmDialog({
  open, title, message, confirmLabel = "Yes, upload", onConfirm, onCancel, busy,
  destructive = false, busyLabel = "Uploading…",
}: {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  destructive?: boolean;
  busyLabel?: string;
}) {
  const accentBorder = destructive ? "rgba(239,68,68,0.35)" : "rgba(255,77,0,0.3)";
  const iconBg       = destructive ? "rgba(239,68,68,0.15)" : "rgba(255,77,0,0.15)";
  const iconColor    = destructive ? "#f87171" : "#FF7A35";
  const confirmBg    = destructive
    ? "linear-gradient(135deg, #dc2626, #ef4444)"
    : "linear-gradient(135deg, #FF4D00, #FF7A35)";
  const Icon = destructive ? Trash2 : AlertTriangle;
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)" }}
          onClick={busy ? undefined : onCancel}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.18 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-[400px] rounded-2xl overflow-hidden"
            style={{ background: "#181818", border: `1px solid ${accentBorder}`, boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}
          >
            <div className="px-4 sm:px-6 pt-6 pb-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: iconBg }}>
                <Icon size={18} style={{ color: iconColor }} />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-[#F5F5F5]">{title}</h3>
                <div className="text-[13px] text-[#aaaaaa] mt-1.5 leading-relaxed">{message}</div>
              </div>
            </div>
            <div className="flex gap-2 px-4 sm:px-6 pb-6">
              <Button
                onClick={onCancel}
                disabled={busy}
                className="flex-1 h-9 text-sm font-medium"
                style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.15)", color: "#aaaaaa" }}
              >
                Cancel
              </Button>
              <Button
                onClick={onConfirm}
                disabled={busy}
                className="flex-1 h-9 text-sm font-semibold text-white gap-2"
                style={{ background: confirmBg, border: "none" }}
              >
                {busy ? <><Loader2 size={14} className="animate-spin" /> {busyLabel}</> : confirmLabel}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function FileCard({ file, onRemove }: { file: File; onRemove: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center gap-3 rounded-xl px-4 py-3"
      style={{ background: "rgba(255,77,0,0.06)", border: "1px solid rgba(255,77,0,0.25)" }}
    >
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: "rgba(255,77,0,0.15)" }}
      >
        <FileText size={16} className="text-[#FF7A35]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[#F5F5F5] truncate">{file.name}</p>
        <p className="text-[11px] text-[#888888]">{fmtBytes(file.size)}</p>
      </div>
      <button
        onClick={onRemove}
        className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center"
        style={{ color: "#555" }}
        onMouseEnter={e => (e.currentTarget.style.color = "#f87171")}
        onMouseLeave={e => (e.currentTarget.style.color = "#555")}
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}

function DropZone({
  label, accept, isDrag, setIsDrag, onFile, inputRef,
}: {
  label: string; accept: string; isDrag: boolean;
  setIsDrag: (v: boolean) => void;
  onFile: (f: File) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-[#888888] mb-1.5">
        {label} <span className="text-[#FF4D00]">*</span>
      </label>
      <div
        onDragEnter={() => setIsDrag(true)}
        onDragOver={e => { e.preventDefault(); setIsDrag(true); }}
        onDragLeave={() => setIsDrag(false)}
        onDrop={e => { e.preventDefault(); setIsDrag(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
        onClick={() => inputRef.current?.click()}
        className="flex flex-col items-center justify-center gap-2 rounded-xl cursor-pointer"
        style={{
          border: `2px dashed ${isDrag ? "#FF4D00" : "rgba(255,77,0,0.25)"}`,
          background: isDrag ? "rgba(255,77,0,0.06)" : "rgba(255,77,0,0.02)",
          padding: "32px 24px", minHeight: 130,
          transition: "border-color 0.15s, background 0.15s",
        }}
      >
        <UploadCloud size={28} style={{ color: isDrag ? "#FF4D00" : "#555555", transition: "color 0.15s" }} />
        <p className="text-sm text-[#888888] text-center">
          <span className="text-[#FF7A35] font-medium">Click to browse</span> or drag & drop here
        </p>
        <p className="text-[11px] text-[#555555]">{accept}</p>
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="file"
          accept={accept}
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }}
        />
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const ACCEPTED_EXTS = [".csv", ".xlsx", ".xls"];
function isAccepted(f: File) {
  const ext = "." + (f.name.split(".").pop() ?? "").toLowerCase();
  return ACCEPTED_EXTS.includes(ext);
}
function isExcel(f: File) {
  const ext = (f.name.split(".").pop() ?? "").toLowerCase();
  return ext === "xlsx" || ext === "xls";
}
async function fileToBase64(f: File): Promise<string> {
  const buf   = await f.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

// ── Panel: New Attendance (CSV or Excel) ──────────────────────────────────────
function AttendanceUploadPanel({ mode }: { mode: "all" }) {
  const [month, setMonth] = useState(String(new Date().getMonth()));
  const [year,  setYear]  = useState(String(CURRENT_YEAR));
  const [file,  setFile]  = useState<File | null>(null);
  const [isDrag, setIsDrag] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [alert, setAlert] = useState<AlertState>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = useCallback((f: File) => {
    if (!isAccepted(f)) {
      setAlert({ type: "error", message: "Please upload a CSV or Excel file (.csv, .xlsx, .xls)" });
      return;
    }
    setFile(f); setAlert(null);
  }, []);

  async function handleUpload() {
    if (!file) return;
    setIsUploading(true); setAlert(null);
    try {
      // Excel → send as base64; CSV → send as plain text
      const body = isExcel(file)
        ? { month: parseInt(month, 10), mode, fileBase64: await fileToBase64(file) }
        : { month: parseInt(month, 10), mode, csvText: await file.text() };

      const res  = await fetch("/api/attendance/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setAlert({ type: "error", message: data.message ?? "Upload failed" });
      } else {
        const stats = data.stats as { employeesUpdated: number; cellsWritten: number; notFound: string[] };
        setAlert({
          type: stats.cellsWritten === 0 ? "warning" : "success",
          message: data.message,
          extra: stats.notFound?.length ? `Not found in sheet: ${stats.notFound.join(", ")}` : undefined,
        });
        if (stats.cellsWritten > 0) setFile(null);
      }
    } catch {
      setAlert({ type: "error", message: "Network error — please try again" });
    } finally {
      setIsUploading(false);
      setConfirmOpen(false);
    }
  }

  const fileExt = file ? (file.name.split(".").pop() ?? "").toLowerCase() : "";

  return (
    <div className="px-4 sm:px-8 py-6 space-y-5">
      <AnimatePresence>
        {alert && (
          <motion.div key="a" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
            <AlertBox alert={alert} />
          </motion.div>
        )}
      </AnimatePresence>

      <div>
        <label className="block text-xs font-medium text-[#888888] mb-1.5">
          Target Month <span className="text-[#FF4D00]">*</span>
        </label>
        <p className="text-[11px] text-[#666666] mb-2">Select the month this data belongs to.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <DarkSelect value={month} onChange={v => { setMonth(v); setAlert(null); }} options={MONTH_LABELS.map((l, i) => ({ label: l, value: String(i) }))} />
          <DarkSelect value={year}  onChange={v => { setYear(v);  setAlert(null); }} options={YEAR_OPTIONS.map(y => ({ label: String(y), value: String(y) }))} />
        </div>
      </div>

      {!file
        ? <DropZone label="Attendance File" accept=".csv, .xlsx, .xls" isDrag={isDrag} setIsDrag={setIsDrag} onFile={handleFile} inputRef={inputRef} />
        : (
          <div className="space-y-2">
            <FileCard file={file} onRemove={() => { setFile(null); setAlert(null); }} />
            {/* Format detected badge */}
            <p className="text-[11px] text-[#666666] pl-1">
              Format detected:{" "}
              <span className="font-medium" style={{ color: fileExt === "csv" ? "#4ade80" : "#FF7A35" }}>
                {fileExt === "csv" ? "CSV" : "Excel (."+fileExt+")"}
              </span>
              {" "}— will be parsed automatically.
            </p>
          </div>
        )
      }

      {/* <div className="rounded-lg px-4 py-3 space-y-1" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <p className="text-[11px] font-medium text-[#888888]">How this works</p>
        <ul className="text-[11px] text-[#555555] space-y-0.5 list-disc pl-4">
          <li>Upload your monthly attendance file in any format — <span className="text-[#888]">CSV, .xlsx, or .xls</span>.</li>
          <li>P, A, WFH, HD, WO, NHD cells are written; empty cells are skipped.</li>
          <li>Clock In, Clock Out, and Total Hours are also synced (new-format sheets).</li>
          <li>Employee info columns (ID, Name, Team, BU Lead) are never modified.</li>
        </ul>
      </div> */}

      <Button
        onClick={!isUploading && file ? () => setConfirmOpen(true) : undefined}
        disabled={!file || isUploading}
        className="w-full h-10 text-sm font-semibold text-white gap-2"
        style={{
          background: !file || isUploading ? "rgba(255,77,0,0.3)" : "linear-gradient(135deg, #FF4D00, #FF7A35)",
          border: "none", cursor: !file || isUploading ? "not-allowed" : "pointer", opacity: 1,
        }}
      >
        {isUploading ? <><Loader2 size={15} className="animate-spin" /> Syncing…</> : <><UploadCloud size={15} /> Upload & Sync</>}
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        busy={isUploading}
        title="Confirm attendance upload"
        confirmLabel="Yes, upload"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleUpload}
        message={
          <>
            Are you sure you want to add the <span className="text-[#F5F5F5] font-medium">Attendance</span> sheet
            {" "}for <span className="text-[#F5F5F5] font-medium">{MONTH_LABELS[parseInt(month, 10)]} {year}</span>?
          </>
        }
      />
    </div>
  );
}

// ── Panel: Leave (Excel upload — same pattern as WFH) ────────────────────────
function LeaveExcelPanel() {
  const [month, setMonth] = useState(String(new Date().getMonth()));
  const [file,  setFile]  = useState<File | null>(null);
  const [isDrag, setIsDrag] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [alert, setAlert] = useState<AlertState>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = useCallback((f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (ext !== "xlsx" && ext !== "xls") {
      setAlert({ type: "error", message: "Please upload an Excel file (.xlsx or .xls)" });
      return;
    }
    setFile(f); setAlert(null);
  }, []);

  async function handleUpload() {
    if (!file) return;
    setIsUploading(true); setAlert(null);
    try {
      const buffer  = await file.arrayBuffer();
      const bytes   = new Uint8Array(buffer);
      let binary    = "";
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      const fileBase64 = btoa(binary);

      const res = await fetch("/api/attendance/leave-excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileBase64, month: parseInt(month, 10) }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setAlert({ type: "error", message: data.message ?? "Upload failed" });
      } else {
        const stats = data.stats as { rowsProcessed: number; cellsWritten: number; skipped: string[]; errors: string[] };
        const extra = [
          stats.skipped?.length ? `Skipped (not approved): ${stats.skipped.join(", ")}` : "",
          stats.errors?.length  ? `Errors: ${stats.errors.join("; ")}` : "",
        ].filter(Boolean).join(" · ") || undefined;
        setAlert({ type: stats.cellsWritten === 0 ? "warning" : "success", message: data.message, extra });
        if (stats.cellsWritten > 0) setFile(null);
      }
    } catch {
      setAlert({ type: "error", message: "Network error — please try again" });
    } finally {
      setIsUploading(false);
      setConfirmOpen(false);
    }
  }

  return (
    <div className="px-4 sm:px-8 py-6 space-y-5">
      <AnimatePresence>
        {alert && (
          <motion.div key="a" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
            <AlertBox alert={alert} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Target month */}
      <div>
        <label className="block text-xs font-medium text-[#888888] mb-1.5">
          Target Month <span className="text-[#FF4D00]">*</span>
        </label>
        <p className="text-[11px] text-[#666666] mb-2">Only leave entries that fall in this month will be written.</p>
        <DarkSelect
          value={month}
          onChange={v => { setMonth(v); setAlert(null); }}
          options={MONTH_LABELS.map((l, i) => ({ label: l, value: String(i) }))}
        />
      </div>

      {!file
        ? <DropZone label="Leave Requests Excel File" accept=".xlsx, .xls" isDrag={isDrag} setIsDrag={setIsDrag} onFile={handleFile} inputRef={inputRef} />
        : <FileCard file={file} onRemove={() => { setFile(null); setAlert(null); }} />
      }

      {/* Column reference */}
      {/* <div className="rounded-lg px-4 py-3 space-y-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <p className="text-[11px] font-medium text-[#888888]">Expected Excel columns</p>
        <div className="space-y-0.5">
          {[
            ["Employee Number",  "e.g. PTG043"],
            ["Leave Types",      "Menstrual Leave → ML · Sick Leave → SL · Paid Leave → PL"],
            ["Status",           "Only \"Approved\" rows are written"],
            ["From Date / To Date", "Excel date serials (auto-converted)"],
            ["Total Duration",   "0.5 → Half Day (HD) · ≥ 1 → Full day leave"],
          ].map(([col, note]) => (
            <div key={col} className="flex items-baseline gap-2">
              <span className="text-[11px] text-[#F5F5F5] font-medium w-40 flex-shrink-0">{col}</span>
              <span className="text-[11px] text-[#555555]">{note}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-[#555555] pt-1 space-x-2">
          Written as: <span className="text-[#f87171] font-mono">ML</span> / <span className="text-[#fb923c] font-mono">SL</span> / <span className="text-[#fbbf24] font-mono">PL</span> (all count as absent) · WO/NHD days are never overwritten.
        </p>
      </div> */}

      <Button
        onClick={!isUploading && file ? () => setConfirmOpen(true) : undefined}
        disabled={!file || isUploading}
        className="w-full h-10 text-sm font-semibold text-white gap-2"
        style={{
          background: !file || isUploading ? "rgba(255,77,0,0.3)" : "linear-gradient(135deg, #FF4D00, #FF7A35)",
          border: "none", cursor: !file || isUploading ? "not-allowed" : "pointer", opacity: 1,
        }}
      >
        {isUploading ? <><Loader2 size={15} className="animate-spin" /> Syncing…</> : <><UploadCloud size={15} /> Sync Leave Data</>}
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        busy={isUploading}
        title="Confirm leave upload"
        confirmLabel="Yes, upload"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleUpload}
        message={
          <>
            Are you sure you want to add this <span className="text-[#F5F5F5] font-medium">Leave</span> data
            {" "}for <span className="text-[#F5F5F5] font-medium">{MONTH_LABELS[parseInt(month, 10)]}</span>?
            {" "}Only entries in that month will be written.
          </>
        }
      />
    </div>
  );
}

// ── Panel: WFH (Excel upload — dates auto-detected from file) ─────────────────
function WFHExcelPanel() {
  const [month, setMonth] = useState(String(new Date().getMonth()));
  const [file,  setFile]  = useState<File | null>(null);
  const [isDrag, setIsDrag] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [alert, setAlert] = useState<AlertState>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = useCallback((f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (ext !== "xlsx" && ext !== "xls") {
      setAlert({ type: "error", message: "Please upload an Excel file (.xlsx or .xls)" });
      return;
    }
    setFile(f); setAlert(null);
  }, []);

  async function handleUpload() {
    if (!file) return;
    setIsUploading(true); setAlert(null);

    try {
      // Read file as base64 to send in JSON body
      const buffer = await file.arrayBuffer();
      const bytes  = new Uint8Array(buffer);
      let binary   = "";
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      const fileBase64 = btoa(binary);

      const res = await fetch("/api/attendance/wfh-excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileBase64, month: parseInt(month, 10) }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setAlert({ type: "error", message: data.message ?? "Upload failed" });
      } else {
        const stats = data.stats as {
          rowsProcessed: number; cellsWritten: number;
          skipped: string[]; errors: string[];
        };
        const extra = [
          stats.skipped?.length  ? `Skipped (not approved): ${stats.skipped.join(", ")}`  : "",
          stats.errors?.length   ? `Errors: ${stats.errors.join("; ")}` : "",
        ].filter(Boolean).join(" · ") || undefined;

        setAlert({
          type: stats.cellsWritten === 0 ? "warning" : "success",
          message: data.message,
          extra,
        });
        if (stats.cellsWritten > 0) setFile(null);
      }
    } catch {
      setAlert({ type: "error", message: "Network error — please try again" });
    } finally {
      setIsUploading(false);
      setConfirmOpen(false);
    }
  }

  return (
    <div className="px-4 sm:px-8 py-6 space-y-5">
      <AnimatePresence>
        {alert && (
          <motion.div key="a" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
            <AlertBox alert={alert} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Target month */}
      <div>
        <label className="block text-xs font-medium text-[#888888] mb-1.5">
          Target Month <span className="text-[#FF4D00]">*</span>
        </label>
        <p className="text-[11px] text-[#666666] mb-2">Only WFH entries that fall in this month will be written.</p>
        <DarkSelect
          value={month}
          onChange={v => { setMonth(v); setAlert(null); }}
          options={MONTH_LABELS.map((l, i) => ({ label: l, value: String(i) }))}
        />
      </div>

      {!file
        ? <DropZone label="WFH Requests Excel File" accept=".xlsx, .xls" isDrag={isDrag} setIsDrag={setIsDrag} onFile={handleFile} inputRef={inputRef} />
        : <FileCard file={file} onRemove={() => { setFile(null); setAlert(null); }} />
      }

      {/* Column format reference */}
      {/* <div className="rounded-lg px-4 py-3 space-y-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <p className="text-[11px] font-medium text-[#888888]">Expected Excel columns</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
          {[
            ["Employee Number", "e.g. PTG043"],
            ["Request Type",    "Only \"WFH\" rows are processed"],
            ["Request Status",  "Only \"Approved\" rows are written"],
            ["From Date",       "Excel date serial (auto-converted)"],
            ["To Date",         "Excel date serial (auto-converted)"],
          ].map(([col, note]) => (
            <div key={col} className="col-span-2 flex items-baseline gap-2">
              <span className="text-[11px] text-[#F5F5F5] font-medium w-36 flex-shrink-0">{col}</span>
              <span className="text-[11px] text-[#555555]">{note}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-[#555555] pt-1">
          Each approved WFH day is written as: Status = <span className="text-[#4ade80] font-mono">WFH</span> · Clock In = <span className="text-[#4ade80] font-mono">10:00</span> · Clock Out = <span className="text-[#4ade80] font-mono">19:00</span> · Total = <span className="text-[#4ade80] font-mono">09:00</span>
        </p>
      </div> */}

      <Button
        onClick={!isUploading && file ? () => setConfirmOpen(true) : undefined}
        disabled={!file || isUploading}
        className="w-full h-10 text-sm font-semibold text-white gap-2"
        style={{
          background: !file || isUploading ? "rgba(255,77,0,0.3)" : "linear-gradient(135deg, #FF4D00, #FF7A35)",
          border: "none", cursor: !file || isUploading ? "not-allowed" : "pointer", opacity: 1,
        }}
      >
        {isUploading ? <><Loader2 size={15} className="animate-spin" /> Syncing…</> : <><UploadCloud size={15} /> Sync WFH Data</>}
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        busy={isUploading}
        title="Confirm WFH upload"
        confirmLabel="Yes, upload"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleUpload}
        message={
          <>
            Are you sure you want to add this <span className="text-[#F5F5F5] font-medium">WFH</span> data
            {" "}for <span className="text-[#F5F5F5] font-medium">{MONTH_LABELS[parseInt(month, 10)]}</span>?
            {" "}Only entries in that month will be written.
          </>
        }
      />
    </div>
  );
}

// ── Panel: Remove Attendance (clear an employee's attendance over a range) ────
function RemoveAttendancePanel() {
  const { monthData } = useAttendanceStore();

  const [query, setQuery]           = useState("");
  const [selected, setSelected]     = useState<{ employeeId: string; name: string; team: string } | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  const [fromDate, setFromDate] = useState(firstOfMonthISO());
  const [toDate,   setToDate]   = useState(todayISO());

  const [isWorking, setIsWorking] = useState(false);
  const [alert, setAlert]         = useState<AlertState>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const suggestions = useMemo(() => {
    if (!monthData || query.trim().length < 1) return [];
    const q = query.toLowerCase();
    return monthData.records
      .filter(r => r.name.toLowerCase().includes(q) || r.employeeId.toLowerCase().includes(q))
      .slice(0, 8);
  }, [monthData, query]);

  function selectEmployee(r: { employeeId: string; name: string; team: string }) {
    setSelected({ employeeId: r.employeeId, name: r.name, team: r.team });
    setQuery(r.name);
    setShowDropdown(false);
    setAlert(null);
  }

  const canRemove = !!selected && !!fromDate && !!toDate && !isWorking;

  function openConfirm() {
    if (!selected) { setAlert({ type: "error", message: "Please select an employee first." }); return; }
    if (!fromDate || !toDate) { setAlert({ type: "error", message: "Please choose both a from and to date." }); return; }
    if (toDate < fromDate) { setAlert({ type: "error", message: "The 'to' date cannot be earlier than the 'from' date." }); return; }
    setConfirmOpen(true);
  }

  async function handleRemove() {
    if (!selected) return;
    setIsWorking(true); setAlert(null);
    try {
      const res = await fetch("/api/attendance/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: selected.employeeId, from: fromDate, to: toDate }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setAlert({ type: "error", message: data.message ?? "Failed to remove attendance." });
      } else {
        setAlert({
          type: data.daysCleared > 0 ? "success" : "warning",
          message: data.daysCleared > 0
            ? `Cleared attendance for ${selected.name} — ${data.daysCleared} day(s) across ${data.monthsTouched} month(s).`
            : `No attendance cells were found to clear for ${selected.name} in the selected range.`,
        });
      }
    } catch {
      setAlert({ type: "error", message: "Network error — please try again." });
    } finally {
      setIsWorking(false);
      setConfirmOpen(false);
    }
  }

  const dateInputClass =
    "h-9 px-3 text-sm rounded-md bg-[#181818] border border-[rgba(255,77,0,0.3)] text-[#F5F5F5] " +
    "focus:border-[#FF4D00] focus:outline-none focus:ring-1 focus:ring-[#FF4D00] [color-scheme:dark] w-full";

  return (
    <div className="px-4 sm:px-8 py-6 space-y-5">
      <AnimatePresence>
        {alert && (
          <motion.div key="a" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
            <AlertBox alert={alert} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Employee picker */}
      <div>
        <label className="block text-xs font-medium text-[#888888] mb-1.5">
          Employee <span className="text-[#FF4D00]">*</span>
        </label>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#888888]" />
          <Input
            value={query}
            onChange={e => { setQuery(e.target.value); setShowDropdown(true); if (!e.target.value.trim()) setSelected(null); }}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            placeholder="Search by name or Employee ID…"
            className="h-9 pl-9 text-sm bg-[#181818] border-[rgba(255,77,0,0.3)] text-[#F5F5F5] placeholder:text-[#555] focus:border-[#FF4D00] focus:ring-1 focus:ring-[#FF4D00]"
          />
          <AnimatePresence>
            {showDropdown && suggestions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}
                className="absolute top-full mt-1 left-0 right-0 rounded-xl overflow-hidden z-50"
                style={{ background: "#181818", border: "1px solid rgba(255,77,0,0.3)", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}
              >
                {suggestions.map(r => (
                  <button
                    key={r.employeeId}
                    onMouseDown={() => selectEmployee(r)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[rgba(255,77,0,0.1)] transition-colors"
                  >
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ background: "linear-gradient(135deg,#FF4D00,#FF7A35)" }}>
                      {initials(r.name)}
                    </div>
                    <div>
                      <p className="text-sm text-[#F5F5F5]">{r.name}</p>
                      <p className="text-[11px] text-[#888888]">{r.employeeId} · {r.team}</p>
                    </div>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {!monthData && (
          <p className="text-[11px] text-[#666666] mt-1.5">
            Loading employee suggestions… you can also type an Employee ID directly.
          </p>
        )}
      </div>

      {/* Date range */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-[#888888] mb-1.5">From date <span className="text-[#FF4D00]">*</span></label>
          <input type="date" value={fromDate} max={toDate || undefined} onChange={e => { setFromDate(e.target.value); setAlert(null); }} className={dateInputClass} />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#888888] mb-1.5">To date <span className="text-[#FF4D00]">*</span></label>
          <input type="date" value={toDate} min={fromDate || undefined} onChange={e => { setToDate(e.target.value); setAlert(null); }} className={dateInputClass} />
        </div>
      </div>

      <div className="flex items-start gap-2.5 rounded-lg px-4 py-3" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
        <AlertTriangle size={15} className="text-[#f87171] mt-0.5 flex-shrink-0" />
        <p className="text-[12px] text-[#aaaaaa]">
          This permanently clears the selected employee&apos;s attendance (status, clock-in/out and hours) for every day
          in the range. Employee info columns are left intact. This cannot be undone.
        </p>
      </div>

      <Button
        onClick={canRemove ? openConfirm : undefined}
        disabled={!canRemove}
        className="w-full h-10 text-sm font-semibold text-white gap-2"
        style={{
          background: !canRemove ? "rgba(239,68,68,0.3)" : "linear-gradient(135deg, #dc2626, #ef4444)",
          border: "none", cursor: !canRemove ? "not-allowed" : "pointer", opacity: 1,
        }}
      >
        {isWorking ? <><Loader2 size={15} className="animate-spin" /> Removing…</> : <><Trash2 size={15} /> Remove Attendance</>}
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        busy={isWorking}
        destructive
        title="Confirm attendance removal"
        confirmLabel="Yes, remove"
        busyLabel="Removing…"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleRemove}
        message={
          <>
            Are you sure you want to clear all attendance for{" "}
            <span className="text-[#F5F5F5] font-medium">{selected?.name}</span>{" "}
            (<span className="text-[#F5F5F5] font-medium">{selected?.employeeId}</span>) from{" "}
            <span className="text-[#F5F5F5] font-medium">{fromDate}</span> to{" "}
            <span className="text-[#F5F5F5] font-medium">{toDate}</span>? This cannot be undone.
          </>
        }
      />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
const TABS: { mode: UploadMode; label: string; Icon: React.FC<{ size?: number }>; description: string }[] = [
  {
    mode: "all",
    label: "New Attendance Data",
    Icon: CalendarDays,
    description: "",
  },
  {
    mode: "wfh",
    label: "Add WFH Data",
    Icon: Laptop,
    description: "",
  },
  {
    mode: "leave",
    label: "Add Leave Data",
    Icon: Plane,
    description: "",
  },
  {
    mode: "remove",
    label: "Remove Attendance",
    Icon: Trash2,
    description: "",
  },
];

export default function AddAttendancePage() {
  const [activeTab, setActiveTab] = useState<UploadMode>("all");

  return (
    <div className="min-h-full px-3 sm:px-6 py-8 flex flex-col items-center">
      <div
        className="w-full max-w-[600px] rounded-2xl overflow-hidden"
        style={{
          background: "#181818",
          border: "1px solid rgba(255,77,0,0.3)",
          boxShadow: "0 0 40px rgba(255,77,0,0.08)",
        }}
      >
        {/* Header */}
        <div className="px-4 sm:px-8 pt-6 pb-0">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,77,0,0.15)" }}>
              <UploadCloud size={18} className="text-[#FF7A35]" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[#F5F5F5]">Add Attendance Data</h2>
              <p className="text-xs text-[#888888] mt-0.5">Upload exports to sync data into the Google Sheet.</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 overflow-x-auto" style={{ borderBottom: "1px solid rgba(255,77,0,0.15)", scrollbarWidth: "none" }}>
            {TABS.map(t => {
              const isActive = t.mode === activeTab;
              return (
                <button
                  key={t.mode}
                  onClick={() => setActiveTab(t.mode)}
                  className="relative flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium whitespace-nowrap flex-shrink-0 transition-colors"
                  style={{ color: isActive ? "#F5F5F5" : "#666666", background: "transparent", border: "none", cursor: "pointer" }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = "#aaaaaa"; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = "#666666"; }}
                >
                  <t.Icon size={14} />
                  {t.label}
                  {isActive && (
                    <motion.div
                      layoutId="tab-underline"
                      className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t"
                      style={{ background: "linear-gradient(90deg, #FF4D00, #FF7A35)" }}
                      transition={{ type: "spring", stiffness: 500, damping: 38 }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab description */}
        <div className="px-4 sm:px-8 py-3" style={{ borderBottom: "1px solid rgba(255,77,0,0.08)", background: "rgba(255,77,0,0.02)" }}>
          <p className="text-[12px] text-[#888888]">{TABS.find(t => t.mode === activeTab)?.description}</p>
        </div>

        {/* Panel (key forces remount on tab switch = clean state) */}
        {activeTab === "wfh"
          ? <WFHExcelPanel   key="wfh"   />
          : activeTab === "leave"
          ? <LeaveExcelPanel key="leave" />
          : activeTab === "remove"
          ? <RemoveAttendancePanel key="remove" />
          : <AttendanceUploadPanel key="all" mode="all" />
        }
      </div>
    </div>
  );
}
